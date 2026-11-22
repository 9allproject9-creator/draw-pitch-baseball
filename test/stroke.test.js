import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStroke, boxToPlate, strokeInk, strokeMetrics, flightMs, kmh, namePitch } from '../shared/stroke.js';
import { line, circles, zigzag, figure8, scribble } from './helpers.js';
import { BOX, STROKE_LIMITS, FLIGHT } from '../shared/constants.js';

const analyze = (s) => {
  const r = sanitizeStroke(s);
  assert.ok(r.ok, r.reason);
  const m = strokeMetrics(r.stroke);
  const ms = flightMs(r.stroke);
  return { m, ms, name: namePitch(m, ms), stroke: r.stroke };
};

test('straight line has ~0 craziness', () => {
  const { m, ms, name } = analyze(line([0.5, 0.9], [0.5, 0.5], 300));
  assert.ok(m.craziness < 0.03, String(m.craziness));
  assert.ok(ms <= 520, String(ms));
  assert.equal(name, '강속구');
});

test('three loops', () => {
  const { m, name } = analyze(circles(3, 0.12, 1500));
  assert.equal(m.loops, 3);
  assert.equal(name, '회오리볼 ×3');
});

test('zigzag', () => {
  const { m, name } = analyze(zigzag(4, 900));
  assert.ok(m.zigzags >= 3, String(m.zigzags));
  assert.equal(name, '지그재그볼');
});

test('figure eight', () => {
  const { name } = analyze(figure8(2, 2000));
  assert.equal(name, '8자 마구');
});

test('scribble is crazy', () => {
  const { m } = analyze(scribble(7, 3000));
  assert.ok(m.craziness >= 0.85, String(m.craziness));
});

test('flight clamps', () => {
  assert.equal(flightMs(sanitizeStroke(line([0.5, 0.9], [0.5, 0.5], 100)).stroke), FLIGHT.minMs);
  assert.equal(flightMs(sanitizeStroke(circles(20, 0.25, 7000)).stroke), 3000);
});

test('faster drawing gives a faster pitch', () => {
  const fast = flightMs(sanitizeStroke(line([0.5, 0.9], [0.5, 0.4], 150)).stroke);
  const mid = flightMs(sanitizeStroke(line([0.5, 0.9], [0.5, 0.4], 700)).stroke);
  const slow = flightMs(sanitizeStroke(line([0.5, 0.9], [0.5, 0.4], 1500)).stroke);
  assert.ok(fast < mid && mid < slow, [fast, mid, slow].join(' < '));
  assert.ok(slow - fast >= 300, 'speed difference should be noticeable: ' + (slow - fast));
  const crazyFast = flightMs(sanitizeStroke(circles(3, 0.12, 900)).stroke);
  const crazySlow = flightMs(sanitizeStroke(circles(3, 0.12, 3000)).stroke);
  assert.ok(crazyFast + 400 < crazySlow, crazyFast + ' vs ' + crazySlow);
});

test('kmh', () => {
  assert.equal(kmh(400), 155);
  assert.equal(kmh(3000), 21);
});

test('tap-only stroke', () => {
  const r = sanitizeStroke({ pts: [[0.5, 0.5, 0]] });
  assert.ok(r.ok);
  assert.equal(r.stroke.pts.length, 2);
  assert.equal(flightMs(r.stroke), FLIGHT.minMs);
});

test('rejects garbage', () => {
  assert.equal(sanitizeStroke(null).ok, false);
  assert.equal(sanitizeStroke({ pts: 'x' }).ok, false);
  assert.equal(sanitizeStroke({ pts: [[NaN, 0, 0]] }).ok, false);
  assert.equal(sanitizeStroke({ pts: [] }).ok, false);
});

test('drawing outside the box is kept, absurd values clamped, downsampled', () => {
  const pts = [];
  for (let i = 0; i < 2000; i++) pts.push([i % 2 ? 1.5 : -0.5, i === 7 ? 99 : 0.5, i]);
  const r = sanitizeStroke({ pts });
  assert.ok(r.ok);
  assert.ok(r.stroke.pts.length <= 600);
  assert.ok(r.stroke.pts.some(([u]) => u === 1.5 || u === -0.5));
  for (const [u, v] of r.stroke.pts) { assert.ok(u >= STROKE_LIMITS.uvMin && u <= STROKE_LIMITS.uvMax); assert.ok(v >= STROKE_LIMITS.uvMin && v <= STROKE_LIMITS.uvMax); }
});

test('ink limit cuts stroke', () => {
  const r = sanitizeStroke(circles(30, 0.3, 7000));
  assert.ok(r.ok);
  assert.ok(strokeInk(r.stroke) <= STROKE_LIMITS.inkMax + 0.01, String(strokeInk(r.stroke)));
});

test('boxToPlate mirrors u', () => {
  assert.deepEqual(boxToPlate(0, 0), { x: BOX.xMax, y: BOX.yMin });
  assert.deepEqual(boxToPlate(1, 1), { x: BOX.xMin, y: BOX.yMax });
});
