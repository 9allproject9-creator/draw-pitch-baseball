// Cloudflare 방(Durable Object)과 기본 웹소켓으로 통신
// 메시지: 보내기 {t, d, id?} / 받기 {t, d} 또는 {t:'ack', id, d}

function getSessionId() {
  try {
    // 탭마다 다른 세션 (같은 브라우저 탭 2개로도 대전 가능), 새로고침해도 유지
    let s = sessionStorage.getItem('gd.session');
    if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); sessionStorage.setItem('gd.session', s); }
    return s;
  } catch { return 'tmp-' + Math.random().toString(36).slice(2); }
}

export function createNet() {
  const sessionId = getSessionId();
  let ws = null;
  let wsCode = null;     // 현재 연결된 방 코드
  let room = null;       // 재접속할 방 코드
  let offset = 0;        // 서버 시각 - Date.now()
  let ackId = 1;
  let retry = 0;
  let retryTimer = null;
  const pending = new Map();
  const handlers = new Map();
  const onStatus = new Set();
  const emitStatus = (s) => onStatus.forEach((f) => f(s));

  const wsUrl = (code) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`;

  function failPending(msg) {
    for (const [, p] of pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: msg }); }
    pending.clear();
  }

  function openRoom(code) {
    if (ws && wsCode === code && ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (ws && wsCode === code && ws.readyState === WebSocket.CONNECTING) {
      return new Promise((res, rej) => { ws.addEventListener('open', () => res(), { once: true }); ws.addEventListener('close', () => rej(new Error('closed')), { once: true }); });
    }
    if (ws) { const old = ws; ws = null; old.__intentional = true; try { old.close(); } catch { /* 무시 */ } }
    wsCode = code;
    return new Promise((resolve, reject) => {
      const sock = new WebSocket(wsUrl(code));
      ws = sock;
      const timer = setTimeout(() => { reject(new Error('timeout')); try { sock.close(); } catch { /* 무시 */ } }, 10000);
      sock.addEventListener('open', async () => {
        clearTimeout(timer);
        retry = 0;
        resolve();
        await syncClock();
      }, { once: true });
      sock.addEventListener('message', (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'ack') {
          const p = pending.get(m.id);
          if (p) { pending.delete(m.id); clearTimeout(p.timer); p.resolve(m.d); }
          return;
        }
        const set = handlers.get(m.t);
        if (set) for (const fn of set) { try { fn(m.d); } catch (e) { console.error(e); } }
      });
      sock.addEventListener('close', () => {
        clearTimeout(timer);
        if (sock !== ws) return; // 의도적으로 바꾼 연결
        reject(new Error('closed'));
        failPending('서버와 연결이 끊겼어요');
        if (sock.__intentional || !room) return;
        emitStatus('disconnected');
        scheduleReconnect();
      });
    });
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    const delay = Math.min(4000, 500 * 2 ** retry++);
    retryTimer = setTimeout(async () => {
      if (!room) return;
      try {
        await openRoom(room);
        emitStatus('connected');
        const r = await send('room:rejoin', { code: room, sessionId });
        if (!r.ok) emitStatus('rejoinFailed:' + (r.error || ''));
      } catch { scheduleReconnect(); }
    }, delay);
  }

  function send(t, d = {}, timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, error: '서버와 연결이 끊겼어요' });
      const id = ackId++;
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: '서버 응답이 없어요' }); }, timeoutMs);
      pending.set(id, { resolve, timer });
      ws.send(JSON.stringify({ t, d, id }));
    });
  }

  async function syncClock() {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await send('time:ping', { t0 });
      const t1 = Date.now();
      if (r && r.server) samples.push({ rtt: t1 - t0, off: r.server - (t0 + t1) / 2 });
    }
    samples.sort((a, b) => a.rtt - b.rtt);
    if (samples.length) offset = samples[0].off;
  }

  async function call(ev, payload = {}) {
    try {
      if (ev === 'room:create') {
        const res = await fetch('/api/rooms', { method: 'POST' }).then((r) => r.json()).catch(() => null);
        if (!res || !res.ok) return { ok: false, error: res?.error || '방을 만들 수 없어요' };
        await openRoom(res.code);
        return await send('room:create', payload);
      }
      if (ev === 'room:join' || ev === 'room:rejoin') {
        const code = String(payload.code || '').toUpperCase();
        await openRoom(code);
        return await send(ev, { ...payload, code });
      }
      if (ev === 'room:leave') {
        const r = await send(ev, payload);
        room = null;
        if (ws) { ws.__intentional = true; try { ws.close(); } catch { /* 무시 */ } ws = null; wsCode = null; }
        return r;
      }
      return await send(ev, payload);
    } catch {
      return { ok: false, error: '서버에 연결할 수 없어요. 잠시 후 다시 해 주세요' };
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && room && (!ws || ws.readyState === WebSocket.CLOSED)) scheduleReconnect();
  });

  return {
    sessionId,
    // Cloudflare는 잠들지 않으므로 서버 상태만 확인
    async connect() {
      const r = await fetch('/healthz', { cache: 'no-store' });
      if (!r.ok) throw new Error('server down');
    },
    call,
    get connected() { return true; },
    get offset() { return offset; },
    serverNow: () => Date.now() + offset,
    toLocal: (serverT) => performance.now() + (serverT - (Date.now() + offset)),
    setRoom(code) { room = code; },
    get room() { return room; },
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev).add(fn);
      return () => handlers.get(ev)?.delete(fn);
    },
    onStatus(fn) { onStatus.add(fn); return () => onStatus.delete(fn); },
  };
}
