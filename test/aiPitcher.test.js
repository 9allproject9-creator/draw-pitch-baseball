import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAiStroke } from '../shared/aiPitcher.js';
import { sanitizeStroke, strokeMetrics, namePitch, flightMs } from '../shared/stroke.js';
import { buildPath } from '../shared/trajectory.js';
import { createRng } from '../shared/rng.js';

test('always valid', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    for (let s = 0; s < 300; s++) {
      const st = generateAiStroke(d, createRng(s));
      const r = sanitizeStroke(st);
      assert.ok(r.ok, `${d} ${s} ${r.reason}`);
      for (const [u, v] of st.pts) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1);
    }
  }
});

test('zone rate roughly matches', () => {
  const rng = createRng(11);
  let inZ = 0;
  for (let i = 0; i < 1000; i++) if (buildPath(sanitizeStroke(generateAiStroke('normal', rng)).stroke).inZone) inZ++;
  assert.ok(inZ / 1000 >= 0.58 && inZ / 1000 <= 0.72, String(inZ / 1000));
});

test('variety', () => {
  const rng = createRng(3);
  const names = new Set();
  for (let i = 0; i < 200; i++) {
    const st = sanitizeStroke(generateAiStroke('normal', rng)).stroke;
    names.add(namePitch(strokeMetrics(st), flightMs(st)).replace(/ ×\d+/, ''));
  }
  assert.ok(names.size >= 6, [...names].join(','));
});

test('deterministic', () => {
  assert.deepEqual(generateAiStroke('hard', createRng(5)), generateAiStroke('hard', createRng(5)));
});
