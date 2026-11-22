import { io } from '/socket.io/socket.io.esm.min.js';

function getSessionId() {
  try {
    let s = localStorage.getItem('gd.session');
    if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem('gd.session', s); }
    return s;
  } catch { return 'tmp-' + Math.random().toString(36).slice(2); }
}

export function createNet() {
  const sessionId = getSessionId();
  let socket = null;
  let offset = 0; // server - client(Date.now)
  let room = null; // 재접속용 코드
  const handlers = new Map();
  const onStatus = new Set();

  const emitStatus = (s) => onStatus.forEach((f) => f(s));

  async function syncClock() {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await call('time:ping', { t0 });
      const t1 = Date.now();
      if (r && r.server) samples.push({ rtt: t1 - t0, off: r.server - (t0 + t1) / 2 });
    }
    samples.sort((a, b) => a.rtt - b.rtt);
    if (samples.length) offset = samples[0].off;
  }

  function call(ev, payload = {}, timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) return resolve({ ok: false, error: '서버와 연결이 끊겼어요' });
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: '서버 응답이 없어요' }); } }, timeoutMs);
      socket.emit(ev, payload, (res) => { if (!done) { done = true; clearTimeout(t); resolve(res); } });
    });
  }

  function connect() {
    if (socket && socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!socket) {
        socket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 600, reconnectionDelayMax: 3000 });
        for (const [ev, set] of handlers) for (const fn of set) socket.on(ev, fn);
        socket.on('connect', async () => {
          emitStatus('connected');
          await syncClock();
          if (room) {
            const r = await call('room:rejoin', { code: room, sessionId });
            if (!r.ok) emitStatus('rejoinFailed:' + (r.error || ''));
          }
        });
        socket.on('disconnect', () => emitStatus('disconnected'));
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && socket && !socket.connected) socket.connect();
        });
      }
      const ok = () => { cleanup(); syncClock().then(resolve); };
      const fail = (e) => { cleanup(); reject(e); };
      const timer = setTimeout(() => fail(new Error('timeout')), 70000);
      const cleanup = () => { clearTimeout(timer); socket.off('connect', ok); };
      socket.once('connect', ok);
      if (!socket.connected) socket.connect();
    });
  }

  return {
    sessionId,
    connect,
    call,
    get connected() { return !!socket?.connected; },
    get offset() { return offset; },
    serverNow: () => Date.now() + offset,
    // 서버 시각 → 로컬 performance.now 기준
    toLocal: (serverT) => performance.now() + (serverT - (Date.now() + offset)),
    setRoom(code) { room = code; },
    get room() { return room; },
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev).add(fn);
      socket?.on(ev, fn);
      return () => { handlers.get(ev).delete(fn); socket?.off(ev, fn); };
    },
    onStatus(fn) { onStatus.add(fn); return () => onStatus.delete(fn); },
  };
}
