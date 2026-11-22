import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../shared/rng.js';
import { createGame, applyOutcome, battingTeam, fieldingTeam } from '../shared/rules.js';

const fixed = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const r = fixed(0.5);
function run(g, outcomes, rng = r) {
  let events = [];
  for (const o of outcomes) { const res = applyOutcome(g, o, rng); g = res.game; events = events.concat(res.events); }
  return { g, events };
}
function withState(over) { return { ...createGame({ innings: 3 }), ...over }; }

test('rng deterministic', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = Array.from({ length: 10 }, a), sb = Array.from({ length: 10 }, b), sc = Array.from({ length: 10 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
  assert.equal(hashSeed('ab', 3), hashSeed('ab', 3));
  assert.notEqual(hashSeed('ab', 3), hashSeed('ab', 4));
});

test('3 strikes is strikeout', () => {
  const { g, events } = run(createGame({ innings: 3 }), ['TAKE_STRIKE', 'TAKE_STRIKE', 'MISS']);
  assert.equal(g.outs, 1);
  assert.equal(g.strikes, 0); assert.equal(g.balls, 0);
  assert.equal(g.stats.home.strikeouts, 1);
  assert.ok(events.some(e => e.type === 'strikeout'));
  assert.equal(battingTeam(g), 'away'); assert.equal(fieldingTeam(g), 'home');
});

test('foul with 2 strikes keeps count', () => {
  const { g } = run(createGame({ innings: 3 }), ['TAKE_STRIKE', 'FOUL', 'FOUL', 'FOUL']);
  assert.equal(g.strikes, 2); assert.equal(g.outs, 0);
});

test('4 balls walks and forces runners', () => {
  const { g } = run(withState({ bases: [true, true, true] }), ['TAKE_BALL', 'TAKE_BALL', 'TAKE_BALL', 'TAKE_BALL']);
  assert.equal(g.score.away, 1);
  assert.deepEqual(g.bases, [true, true, true]);
  assert.equal(g.stats.away.walks, 1);
});

test('walk without force', () => {
  const { g } = run(withState({ bases: [false, true, false] }), ['BALL_AUTO', 'BALL_AUTO', 'TAKE_BALL', 'TAKE_BALL']);
  assert.deepEqual(g.bases, [true, true, false]);
  assert.equal(g.score.away, 0);
});

test('single advances one', () => {
  const { g } = run(withState({ bases: [true, false, true] }), ['1B']);
  assert.equal(g.score.away, 1);
  assert.deepEqual(g.bases, [true, true, false]);
  assert.equal(g.stats.away.hits, 1);
});

test('double advances two', () => {
  const { g } = run(withState({ bases: [true, false, false] }), ['2B']);
  assert.deepEqual(g.bases, [false, true, true]);
});

test('triple clears bases', () => {
  const { g } = run(withState({ bases: [true, true, false] }), ['3B']);
  assert.equal(g.score.away, 2);
  assert.deepEqual(g.bases, [false, false, true]);
});

test('home run scores all', () => {
  const { g, events } = run(withState({ bases: [true, true, true] }), ['HR']);
  assert.equal(g.score.away, 4);
  assert.deepEqual(g.bases, [false, false, false]);
  assert.ok(events.some(e => e.type === 'homeRun'));
});

test('ground out double play', () => {
  const dp = run(withState({ bases: [true, false, false] }), ['GO'], fixed(0.1)).g;
  assert.equal(dp.outs, 2); assert.deepEqual(dp.bases, [false, false, false]);
  const adv = run(withState({ bases: [true, false, false] }), ['GO'], fixed(0.9)).g;
  assert.equal(adv.outs, 1); assert.deepEqual(adv.bases, [false, true, false]);
});

test('sac fly scores runner from third', () => {
  const a = run(withState({ bases: [false, false, true], outs: 1 }), ['FO']).g;
  assert.equal(a.score.away, 1); assert.equal(a.outs, 2);
  const b = run(withState({ bases: [false, false, true], outs: 2 }), ['FO']).g;
  assert.equal(b.score.away, 0); assert.equal(b.half, 'bottom');
});

test('three outs switches half', () => {
  const { g, events } = run(withState({ outs: 2, bases: [true, true, false], score: { away: 2, home: 0 }, balls: 2, strikes: 1 }), ['FO']);
  assert.equal(g.half, 'bottom'); assert.equal(g.outs, 0);
  assert.deepEqual(g.bases, [false, false, false]);
  assert.equal(g.balls, 0); assert.equal(g.strikes, 0);
  assert.ok(events.some(e => e.type === 'halfOver'));
  assert.equal(g.lines.away.length, 1);
});

test('home leading after top of last inning ends game', () => {
  const { g, events } = run(withState({ inning: 3, outs: 2, score: { away: 1, home: 3 } }), ['GO']);
  assert.equal(g.status, 'final'); assert.equal(g.winner, 'home');
  assert.ok(events.some(e => e.type === 'gameOver'));
});

test('walk-off ends immediately', () => {
  const { g } = run(withState({ inning: 3, half: 'bottom', bases: [false, false, true], score: { away: 2, home: 2 } }), ['1B']);
  assert.equal(g.status, 'final'); assert.equal(g.winner, 'home'); assert.equal(g.score.home, 3);
});

test('tie goes to extra innings, max 3 extra then tie', () => {
  const mid = run(withState({ inning: 3, half: 'bottom', outs: 2, score: { away: 1, home: 1 } }), ['GO']).g;
  assert.equal(mid.status, 'playing'); assert.equal(mid.inning, 4); assert.equal(mid.half, 'top');
  const end = run(withState({ inning: 6, half: 'bottom', outs: 2, score: { away: 1, home: 1 } }), ['GO']).g;
  assert.equal(end.status, 'final'); assert.equal(end.winner, 'tie');
});

test('away wins after bottom of last inning', () => {
  const g = run(withState({ inning: 3, half: 'bottom', outs: 2, score: { away: 4, home: 1 } }), ['GO']).g;
  assert.equal(g.status, 'final'); assert.equal(g.winner, 'away');
});

test('BALL_AUTO counts as ball', () => {
  const { g } = run(createGame({ innings: 3 }), ['BALL_AUTO']);
  assert.equal(g.balls, 1);
});

test('pitch info updates fielding stats', () => {
  const { game } = applyOutcome(createGame({ innings: 1 }), 'TAKE_STRIKE', r, { kmh: 140, name: '회오리볼 ×2', craziness: 0.5 });
  assert.equal(game.stats.home.maxKmh, 140);
  assert.deepEqual(game.stats.home.craziest, { name: '회오리볼 ×2', craziness: 0.5 });
});

test('hit by pitch forces runners like a walk', () => {
  const { g, events } = run(withState({ bases: [true, false, false], balls: 1, strikes: 2 }), ['HBP']);
  assert.deepEqual(g.bases, [true, true, false]);
  assert.equal(g.balls, 0); assert.equal(g.strikes, 0);
  assert.ok(events.some((e) => e.type === 'hbp'));
});
