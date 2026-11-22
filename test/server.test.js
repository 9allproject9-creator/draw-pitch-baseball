import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { createServer } from '../server/index.js';

let srv, url;
before(async () => { srv = await createServer({ port: 0, disconnectGraceMs: 200, resultScale: 0.01 }); url = `http://localhost:${srv.port}`; });
after(async () => { await srv.close(); });

const clients = [];
const connect = () => new Promise((res) => { const s = ioc(url, { transports: ['websocket'], forceNew: true }); clients.push(s); s.on('connect', () => res(s)); });
const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const once = (s, ev, pred = () => true, ms = 3000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms);
  const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); res(d); } };
  s.on(ev, h);
});
after(() => clients.forEach((c) => c.close()));

const straight = { pts: [[0.5, 0.9, 0], [0.5, 0.6, 300], [0.5, 0.35, 600]] };

async function pair() {
  const a = await connect(), b = await connect();
  const c = await emit(a, 'room:create', { name: '홈', sessionId: 'sa' + Math.random() });
  const sb = 'sb' + Math.random();
  const ready = once(a, 'room:state', (st) => st.status === 'ready');
  const j = await emit(b, 'room:join', { code: c.code, name: '원정', sessionId: sb });
  assert.ok(j.ok, j.error);
  await ready;
  return { a, b, code: c.code, sb };
}

test('healthz returns ok', async () => {
  const r = await fetch(url + '/healthz');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
});

test('create and join room', async () => {
  const a = await connect(), b = await connect();
  const c = await emit(a, 'room:create', { name: '철수', sessionId: 's1' });
  assert.ok(c.ok);
  assert.match(c.code, /^[A-HJ-NP-Z2-9]{4}$/);
  const stB = once(b, 'room:state', (st) => st.status === 'ready');
  const j = await emit(b, 'room:join', { code: c.code, name: '영희', sessionId: 's2' });
  assert.ok(j.ok);
  const st = await stB;
  assert.equal(st.you, 'away');
  assert.deepEqual(st.players.map((p) => p.team).sort(), ['away', 'home']);
});

test('third player rejected', async () => {
  const { code } = await pair();
  const c = await connect();
  const r = await emit(c, 'room:join', { code, name: '셋째', sessionId: 's3' });
  assert.equal(r.ok, false);
  assert.match(r.error, /가득/);
});

test('only host can start', async () => {
  const { b } = await pair();
  const r = await emit(b, 'game:start', { innings: 1 });
  assert.equal(r.ok, false);
});

test('full pitch flow', async () => {
  const { a, b } = await pair();
  const ph = once(a, 'game:phase', (p) => p.phase === 'pitching');
  assert.ok((await emit(a, 'game:start', { innings: 1 })).ok);
  const p = await ph;
  assert.equal(p.pitcherTeam, 'home');
  const sa = once(a, 'pitch:start'), sb = once(b, 'pitch:start');
  const r = await emit(a, 'pitch:stroke', { pitchId: p.pitchId, stroke: straight });
  assert.ok(r.ok, r.error);
  const [ps] = await Promise.all([sa, sb]);
  const ra = once(a, 'pitch:result'), rb = once(b, 'pitch:result');
  assert.ok((await emit(b, 'pitch:take', { pitchId: ps.pitchId })).ok);
  const [x, y] = await Promise.all([ra, rb]);
  assert.ok(['TAKE_STRIKE', 'TAKE_BALL'].includes(x.outcome));
  assert.deepEqual(x.game, y.game);
  await once(a, 'game:phase', (q) => q.phase === 'pitching' && q.pitchId > p.pitchId);
});

test('wrong player cannot pitch', async () => {
  const { a, b } = await pair();
  const ph = once(a, 'game:phase', (p) => p.phase === 'pitching');
  await emit(a, 'game:start', { innings: 1 });
  const p = await ph;
  const r = await emit(b, 'pitch:stroke', { pitchId: p.pitchId, stroke: straight });
  assert.equal(r.ok, false);
});

test('invalid stroke counts as ball', async () => {
  const { a } = await pair();
  const ph = once(a, 'game:phase', (p) => p.phase === 'pitching');
  await emit(a, 'game:start', { innings: 1 });
  const p = await ph;
  const res = once(a, 'pitch:result');
  await emit(a, 'pitch:stroke', { pitchId: p.pitchId, stroke: { pts: 'x' } });
  assert.equal((await res).outcome, 'BALL_AUTO');
});

test('swing only once', async () => {
  const { a, b } = await pair();
  const ph = once(a, 'game:phase', (p) => p.phase === 'pitching');
  await emit(a, 'game:start', { innings: 1 });
  const p = await ph;
  const st = once(b, 'pitch:start');
  await emit(a, 'pitch:stroke', { pitchId: p.pitchId, stroke: straight });
  const ps = await st;
  const r1 = await emit(b, 'pitch:swing', { pitchId: ps.pitchId, t: 100, ray: { x: 0, y: 0, z: -1 } });
  const r2 = await emit(b, 'pitch:swing', { pitchId: ps.pitchId, t: 120, ray: { x: 0, y: 0, z: -1 } });
  assert.ok(r1.ok);
  assert.equal(r2.ok, false);
});

test('rejoin restores state', async () => {
  const { a, b, code, sb } = await pair();
  const ph = once(a, 'game:phase', (p) => p.phase === 'pitching');
  await emit(a, 'game:start', { innings: 1 });
  await ph;
  b.close();
  await once(a, 'room:state', (st) => st.players.some((p) => !p.connected));
  const b2 = await connect();
  const phase = once(b2, 'game:phase');
  const r = await emit(b2, 'room:rejoin', { code, sessionId: sb });
  assert.ok(r.ok, r.error);
  const got = await phase;
  assert.equal(got.game.inning, 1);
});

test('forfeit after timeout', async () => {
  const { a, b } = await pair();
  const ph = once(a, 'game:phase', (p) => p.phase === 'pitching');
  await emit(a, 'game:start', { innings: 1 });
  await ph;
  const fin = once(a, 'game:phase', (p) => p.phase === 'final', 2000);
  b.close();
  const f = await fin;
  assert.equal(f.game.winner, 'home');
  assert.equal(f.forfeit, true);
});

test('emote rate limit', async () => {
  const { a } = await pair();
  const r1 = await emit(a, 'emote', { id: 'lol' });
  const r2 = await emit(a, 'emote', { id: 'lol' });
  const r3 = await emit(a, 'emote', { id: 'nope' });
  assert.ok(r1.ok);
  assert.equal(r2.ok, false);
  assert.equal(r3.ok, false);
});

test('time ping', async () => {
  const a = await connect();
  const r = await emit(a, 'time:ping', { t0: 5 });
  assert.equal(r.t0, 5);
  assert.ok(Math.abs(r.server - Date.now()) < 1000);
});
