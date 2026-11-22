import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore } from '../server/roomCore.js';

const straight = { pts: [[0.5, 0.9, 0], [0.5, 0.6, 300], [0.5, 0.35, 600]] };

const allRooms = [];
after(() => allRooms.forEach((c) => c.dispose()));

// 가짜 연결: 받은 메시지를 모으고, 특정 이벤트를 기다릴 수 있음
function makeRoom(opts = {}) {
  const inbox = new Map();
  const waiters = [];
  const core = new RoomCore({
    code: 'ABCD',
    disconnectGraceMs: opts.grace ?? 200,
    resultScale: 0.01,
    send: (cid, t, d) => {
      inbox.get(cid)?.push({ t, d });
      for (const w of [...waiters]) if (w.cid === cid && w.t === t && w.pred(d)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.timer); w.res(d); }
    },
  });
  allRooms.push(core);
  let next = 1;
  const conn = () => {
    const id = next++;
    inbox.set(id, []);
    core.open(id);
    return {
      id,
      call: (t, d) => core.handle(id, t, d),
      wait: (t, pred = () => true, ms = 3000) => new Promise((res, rej) => {
        const w = { cid: id, t, pred, res };
        w.timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('timeout ' + t)); }, ms);
        waiters.push(w);
      }),
      close: () => core.close(id),
      last: (t) => [...inbox.get(id)].reverse().find((m) => m.t === t)?.d,
    };
  };
  return { core, conn };
}

function pair(opts) {
  const r = makeRoom(opts);
  const a = r.conn(), b = r.conn();
  assert.ok(r.core.claim());
  assert.ok(a.call('room:create', { name: '홈', sessionId: 'sa' }).ok);
  const j = b.call('room:join', { code: 'ABCD', name: '원정', sessionId: 'sb' });
  assert.ok(j.ok, j.error);
  return { ...r, a, b };
}

test('create and join room', () => {
  const { a, b } = pair();
  assert.equal(b.last('room:state').you, 'away');
  assert.equal(a.last('room:state').status, 'ready');
  assert.deepEqual(a.last('room:state').players.map((p) => p.team).sort(), ['away', 'home']);
});

test('claim reserves a code once', () => {
  const { core } = makeRoom();
  assert.equal(core.claim(), true);
  assert.equal(core.claim(), false);
});

test('join without host fails', () => {
  const { conn } = makeRoom();
  const r = conn().call('room:join', { code: 'ABCD', name: 'x', sessionId: 'sx' });
  assert.equal(r.ok, false);
  assert.match(r.error, /없어요/);
});

test('third player rejected', () => {
  const { conn } = pair();
  const r = conn().call('room:join', { code: 'ABCD', name: '셋째', sessionId: 's3' });
  assert.equal(r.ok, false);
  assert.match(r.error, /가득/);
});

test('only host can start', () => {
  const { b } = pair();
  assert.equal(b.call('game:start', { innings: 1 }).ok, false);
});

test('full pitch flow', async () => {
  const { a, b } = pair();
  const ph = a.wait('game:phase', (p) => p.phase === 'pitching');
  assert.ok(a.call('game:start', { innings: 1 }).ok);
  const p = await ph;
  assert.equal(p.pitcherTeam, 'home');
  const sa = a.wait('pitch:start'), sb = b.wait('pitch:start');
  assert.ok(a.call('pitch:stroke', { pitchId: p.pitchId, stroke: straight }).ok);
  const [ps] = await Promise.all([sa, sb]);
  const ra = a.wait('pitch:result'), rb = b.wait('pitch:result');
  assert.ok(b.call('pitch:take', { pitchId: ps.pitchId }).ok);
  const [x, y] = await Promise.all([ra, rb]);
  assert.ok(['TAKE_STRIKE', 'TAKE_BALL'].includes(x.outcome));
  assert.deepEqual(x.game, y.game);
  await a.wait('game:phase', (q) => q.phase === 'pitching' && q.pitchId > p.pitchId);
});

test('wrong player cannot pitch', async () => {
  const { a, b } = pair();
  const ph = a.wait('game:phase', (p) => p.phase === 'pitching');
  a.call('game:start', { innings: 1 });
  const p = await ph;
  assert.equal(b.call('pitch:stroke', { pitchId: p.pitchId, stroke: straight }).ok, false);
});

test('invalid stroke counts as ball', async () => {
  const { a } = pair();
  const ph = a.wait('game:phase', (p) => p.phase === 'pitching');
  a.call('game:start', { innings: 1 });
  const p = await ph;
  const res = a.wait('pitch:result');
  a.call('pitch:stroke', { pitchId: p.pitchId, stroke: { pts: 'x' } });
  assert.equal((await res).outcome, 'BALL_AUTO');
});

test('swing only once', async () => {
  const { a, b } = pair();
  const ph = a.wait('game:phase', (p) => p.phase === 'pitching');
  a.call('game:start', { innings: 1 });
  const p = await ph;
  const st = b.wait('pitch:start');
  a.call('pitch:stroke', { pitchId: p.pitchId, stroke: straight });
  const ps = await st;
  assert.ok(b.call('pitch:swing', { pitchId: ps.pitchId, t: 100, ray: { x: 0, y: 0, z: -1 } }).ok);
  assert.equal(b.call('pitch:swing', { pitchId: ps.pitchId, t: 120, ray: { x: 0, y: 0, z: -1 } }).ok, false);
});

test('rejoin restores state', async () => {
  const r = pair();
  const ph = r.a.wait('game:phase', (p) => p.phase === 'pitching');
  r.a.call('game:start', { innings: 1 });
  await ph;
  r.b.close();
  assert.ok(r.a.last('room:state').players.some((p) => !p.connected));
  const b2 = r.conn();
  const phase = b2.wait('game:phase');
  const res = b2.call('room:rejoin', { code: 'ABCD', sessionId: 'sb' });
  assert.ok(res.ok, res.error);
  assert.equal((await phase).game.inning, 1);
});

test('forfeit after timeout', async () => {
  const r = pair({ grace: 150 });
  const ph = r.a.wait('game:phase', (p) => p.phase === 'pitching');
  r.a.call('game:start', { innings: 1 });
  await ph;
  const fin = r.a.wait('game:phase', (p) => p.phase === 'final', 2000);
  r.b.close();
  const f = await fin;
  assert.equal(f.game.winner, 'home');
  assert.equal(f.forfeit, true);
});

test('host leaving the waiting room closes it', async () => {
  const { a, b } = pair();
  const closed = b.wait('room:closed');
  a.call('room:leave');
  assert.match((await closed).reason, /방장/);
});

test('emote rate limit', () => {
  const { a } = pair();
  assert.ok(a.call('emote', { id: 'lol' }).ok);
  assert.equal(a.call('emote', { id: 'lol' }).ok, false);
  assert.equal(a.call('emote', { id: 'nope' }).ok, false);
});

test('time ping', () => {
  const { conn } = makeRoom();
  const r = conn().call('time:ping', { t0: 5 });
  assert.equal(r.t0, 5);
  assert.ok(Math.abs(r.server - Date.now()) < 1000);
});

test('request flood is rate limited', () => {
  const { conn } = makeRoom();
  const c = conn();
  let blocked = 0;
  for (let i = 0; i < 40; i++) if (c.call('time:ping', { t0: i }).ok === false) blocked++;
  assert.ok(blocked > 0);
});
