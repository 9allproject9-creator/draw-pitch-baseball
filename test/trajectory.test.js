import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPath, isStrike } from '../shared/trajectory.js';
import { sanitizeStroke, boxToPlate } from '../shared/stroke.js';
import { RELEASE, PITCH_CAM, CATCHER_Z, ZONE, BALL_R, FLIGHT } from '../shared/constants.js';
import { circles, line, polyline } from './helpers.js';

const S = (s) => sanitizeStroke(s).stroke;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const dir = (from, p) => { const d = { x: p.x - from.x, y: p.y - from.y, z: p.z - from.z }; const l = Math.hypot(d.x, d.y, d.z); return { x: d.x / l, y: d.y / l, z: d.z / l }; };

test('path starts at release', () => {
  const p = buildPath(S(circles(2, 0.1, 1200)));
  const a = p.positionAt(0);
  near(a.x, RELEASE.x); near(a.y, RELEASE.y); near(a.z, RELEASE.z);
});

test('path ends at drawn end on plate', () => {
  const st = S(circles(2, 0.1, 1200));
  const p = buildPath(st);
  const last = st.pts[st.pts.length - 1];
  const e = boxToPlate(last[0], last[1]);
  const q = p.positionAt(p.T);
  near(q.x, e.x); near(q.y, e.y); near(q.z, 0);
  near(p.end.x, e.x); near(p.end.y, e.y);
});

test('pitcher view matches drawing', () => {
  const st = S(circles(3, 0.15, 2000));
  const p = buildPath(st);
  const D = st.pts[st.pts.length - 1][2];
  for (const s of [0.2, 0.35, 0.5, 0.77, 0.95]) {
    const P = p.positionAt(s * p.T);
    const tau = s * D;
    let i = 1; while (i < st.pts.length - 1 && st.pts[i][2] < tau) i++;
    const a = st.pts[i - 1], b = st.pts[i];
    const f = b[2] > a[2] ? (tau - a[2]) / (b[2] - a[2]) : 0;
    const B = boxToPlate(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
    const d1 = dir(PITCH_CAM, P), d2 = dir(PITCH_CAM, { x: B.x, y: B.y, z: 0 });
    const ang = Math.acos(Math.min(1, d1.x * d2.x + d1.y * d2.y + d1.z * d2.z));
    assert.ok(ang < 1e-7, `angle ${ang} at s=${s}`);
  }
});

test('fast segment moves faster', () => {
  // 앞 절반(0.9→0.6) 100ms, 뒤 절반(0.6→0.3) 900ms
  const st = S({ pts: [[0.5, 0.9, 0], [0.5, 0.6, 100], [0.5, 0.3, 1000]] });
  const p = buildPath(st);
  const mid = p.positionAt(p.T * 0.5);
  const midPlateY = boxToPlate(0.5, 0.6).y;
  // 투수 카메라 광선을 판정면으로 연장한 y 가 이미 0.6 지점보다 아래
  const k = (0 - PITCH_CAM.z) / (mid.z - PITCH_CAM.z);
  const yOnPlate = PITCH_CAM.y + (mid.y - PITCH_CAM.y) * k;
  assert.ok(yOnPlate < midPlateY, `${yOnPlate} < ${midPlateY}`);
});

test('continues to catcher', () => {
  const p = buildPath(S(line([0.5, 0.8], [0.5, 0.4], 800)));
  near(p.positionAt(p.T + 2000).z, CATCHER_Z, 1e-6);
});

test('strike edges', () => {
  assert.equal(isStrike({ x: ZONE.xMax + BALL_R - 0.001, y: ZONE.yMin - BALL_R + 0.001 }), true);
  assert.equal(isStrike({ x: ZONE.xMax + BALL_R + 0.01, y: 0.8 }), false);
  assert.equal(isStrike({ x: 0, y: ZONE.yMax + BALL_R + 0.01 }), false);
});

test('never below ground', () => {
  const p = buildPath(S(polyline([[0.5, 0.9], [0.1, 0.0], [0.9, 0.0], [0.5, 0.0]], 1500)));
  for (const q of p.samples(200)) assert.ok(q.y >= BALL_R - 1e-9, String(q.y));
});
