import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalHumanSwing, outcomeFromQuality, aiBatter, hitFlight } from '../shared/contact.js';
import { resolvePitch } from '../shared/matchCore.js';
import { buildPath, timeAtZ } from '../shared/trajectory.js';
import { sanitizeStroke } from '../shared/stroke.js';
import { createGame } from '../shared/rules.js';
import { createRng } from '../shared/rng.js';
import { BAT_CAM, HIT_ZONE } from '../shared/constants.js';
import { line, circles } from './helpers.js';

const straight = sanitizeStroke(line([0.5, 0.9], [0.5, 0.35], 1200)).stroke;
const path = buildPath(straight);
const rayTo = (P, off = 0) => {
  const d = { x: P.x + off - BAT_CAM.x, y: P.y - BAT_CAM.y, z: P.z - BAT_CAM.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
};
const fixed = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

test('perfect tap is solid contact', () => {
  const t = timeAtZ(path, HIT_ZONE.ideal);
  const r = evalHumanSwing(path, { type: 'human', t, ray: rayTo(path.positionAt(t)) });
  assert.equal(r.hit, true);
  assert.ok(r.quality > 0.95, String(r.quality));
});

test('early tap is a miss', () => {
  const t = path.T * 0.3;
  const r = evalHumanSwing(path, { type: 'human', t, ray: rayTo(path.positionAt(t)) });
  assert.deepEqual(r, { hit: false, reason: 'early' });
});

test('late tap is a miss', () => {
  const t = path.T + 400;
  const r = evalHumanSwing(path, { type: 'human', t, ray: rayTo(path.positionAt(t)) });
  assert.equal(r.reason, 'late');
});

test('off target', () => {
  const t = timeAtZ(path, HIT_ZONE.ideal);
  const r = evalHumanSwing(path, { type: 'human', t, ray: rayTo(path.positionAt(t), 0.5) });
  assert.equal(r.reason, 'off');
});

test('timing sign', () => {
  const t = timeAtZ(path, -0.9);
  const r = evalHumanSwing(path, { type: 'human', t, ray: rayTo(path.positionAt(t)) });
  assert.equal(r.hit, true);
  assert.ok(r.timing < 0);
});

test('outcome table boundaries', () => {
  const rng = fixed(0.0, 0.39, 0.41, 0.49, 0.76, 0.96);
  assert.deepEqual([0, 0, 0, 0, 0, 0].map(() => outcomeFromQuality(0.9, rng)), ['HR', 'HR', '3B', '2B', '1B', 'FO']);
  assert.equal(outcomeFromQuality(0.1, fixed(0.2)), 'FOUL');
});

function contactRate(info, diff, n = 2000) {
  const rng = createRng(99);
  let c = 0;
  for (let i = 0; i < n; i++) if (aiBatter(info, diff, rng).contact) c++;
  return c / n;
}

test('crazy pitch is harder for AI', () => {
  const a = contactRate({ inZone: true, craziness: 0, T: 1000 }, 'normal');
  const b = contactRate({ inZone: true, craziness: 0.7, T: 1000 }, 'normal');
  assert.ok(b <= a / 2, `${b} vs ${a}`);
});

test('fast pitch is harder for AI', () => {
  const a = contactRate({ inZone: true, craziness: 0.2, T: 400 }, 'normal');
  const b = contactRate({ inZone: true, craziness: 0.2, T: 1500 }, 'normal');
  assert.ok(a < b, `${a} vs ${b}`);
});

test('resolvePitch is deterministic', () => {
  const st = sanitizeStroke(circles(2, 0.1, 1500)).stroke;
  const args = { game: createGame({ innings: 3 }), stroke: st, swing: { type: 'ai', difficulty: 'normal' }, seed: 1234 };
  assert.deepEqual(resolvePitch(args), resolvePitch(args));
});

test('take on ball is TAKE_BALL', () => {
  const st = sanitizeStroke(line([0.5, 0.9], [0.05, 0.9], 800)).stroke;
  const r = resolvePitch({ game: createGame({ innings: 3 }), stroke: st, swing: { type: 'take' }, seed: 1 });
  assert.equal(r.outcome, 'TAKE_BALL');
  assert.equal(r.game.balls, 1);
});

test('take on strike is TAKE_STRIKE', () => {
  const r = resolvePitch({ game: createGame({ innings: 3 }), stroke: straight, swing: { type: 'take' }, seed: 1 });
  assert.equal(r.outcome, 'TAKE_STRIKE');
});

test('invalid stroke counts as ball', () => {
  const r = resolvePitch({ game: createGame({ innings: 3 }), stroke: { pts: 'x' }, swing: { type: 'take' }, seed: 1 });
  assert.equal(r.outcome, 'BALL_AUTO');
});

test('human miss is MISS with swingT', () => {
  const r = resolvePitch({ game: createGame({ innings: 3 }), stroke: straight, swing: { type: 'human', t: 100, ray: { x: 0, y: 0, z: -1 } }, seed: 1 });
  assert.equal(r.outcome, 'MISS');
  assert.equal(r.swingT, 100);
});

test('hitFlight HR clears fence', () => {
  const f = hitFlight('HR', 0, createRng(5));
  assert.equal(f.kind, 'hr');
  assert.ok(f.distance >= 110);
  const foul = hitFlight('FOUL', 0.5, createRng(5));
  assert.ok(Math.abs(foul.spray) >= 50);
});

import { findHbp } from '../shared/contact.js';
import { BATTER } from '../shared/constants.js';
import { plateToBox } from '../shared/stroke.js';

test('pitch through the batter is HBP', () => {
  const b = plateToBox(BATTER.x, 1.0);
  const st = sanitizeStroke(line([0.5, 0.9], [b.u, b.v], 800)).stroke;
  const p = buildPath(st);
  assert.ok(findHbp(p, Infinity) != null);
  const r = resolvePitch({ game: createGame({ innings: 3 }), stroke: st, swing: { type: 'take' }, seed: 3 });
  assert.equal(r.outcome, 'HBP');
  assert.ok(r.hbpT > 0 && r.hbpT <= p.T + 200);
  const ai = resolvePitch({ game: createGame({ innings: 3 }), stroke: st, swing: { type: 'ai', difficulty: 'normal' }, seed: 3 });
  assert.equal(ai.outcome, 'HBP');
});

test('pitch in the zone does not hit the batter', () => {
  assert.equal(findHbp(path, Infinity), null);
});

test('contact before the ball reaches the batter is a hit, not HBP', () => {
  const t = timeAtZ(path, HIT_ZONE.ideal);
  const r = resolvePitch({ game: createGame({ innings: 3 }), stroke: straight, swing: { type: 'human', t, ray: rayTo(path.positionAt(t)) }, seed: 9 });
  assert.notEqual(r.outcome, 'HBP');
});
