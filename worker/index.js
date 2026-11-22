// Cloudflare Worker: 정적 파일 + 방 만들기 API + 방별 Durable Object(웹소켓)
import { RoomCore } from '../server/roomCore.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

const newCode = () => {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// 방 하나 = Durable Object 하나. 두 선수의 웹소켓을 붙잡고 RoomCore로 경기를 진행.
export class Room {
  constructor(state, env) {
    this.state = state;
    this.sockets = new Map();
    this.nextId = 1;
    this.core = null;
  }

  ensure(code) {
    if (!this.core) {
      this.core = new RoomCore({
        code,
        send: (cid, t, d) => {
          const ws = this.sockets.get(cid);
          if (!ws) return;
          try { ws.send(JSON.stringify({ t, d })); } catch { /* 끊긴 연결 */ }
        },
      });
    }
    return this.core;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') || '';
    const core = this.ensure(code);

    if (url.pathname === '/claim') {
      return core.claim() ? new Response('ok') : new Response('taken', { status: 409 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const cid = this.nextId++;
    this.sockets.set(cid, server);
    core.open(cid);

    server.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > 200000) return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      const res = core.handle(cid, m.t, m.d && typeof m.d === 'object' ? m.d : {});
      if (m.id != null) {
        try { server.send(JSON.stringify({ t: 'ack', id: m.id, d: res })); } catch { /* 무시 */ }
      }
    });
    const bye = () => {
      if (!this.sockets.delete(cid)) return;
      core.close(cid);
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/healthz') return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    if (path === '/api/time') return json({ server: Date.now() });

    if (path === '/api/rooms' && request.method === 'POST') {
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch(`https://room/claim?code=${code}`);
        if (r.ok) return json({ ok: true, code });
      }
      return json({ ok: false, error: '방을 만들 수 없어요. 다시 해 주세요' }, 503);
    }

    const m = path.match(/^\/ws\/([A-Za-z0-9]{4})$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return new Response('bad code', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request(`https://room/ws?code=${code}`, request));
    }

    return env.ASSETS.fetch(request);
  },
};
