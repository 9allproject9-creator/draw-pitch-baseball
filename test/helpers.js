import { createRng } from '../shared/rng.js';

// 박스 좌표 함수 f(s) s∈[0,1] → [u,v] 를 duration ms 동안 n점으로
export function makeStroke(f, duration, n = 120) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const [u, v] = f(s);
    pts.push([u, v, s * duration]);
  }
  return { pts };
}

export const line = (a, b, duration) =>
  makeStroke((s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s], duration, 40);

export const circles = (turns, r, duration, cx = 0.5, cy = 0.5) =>
  makeStroke((s) => [cx + r * Math.cos(s * turns * Math.PI * 2), cy + r * Math.sin(s * turns * Math.PI * 2)], duration, 60 * turns);

export function zigzag(n, duration) {
  const corners = [];
  for (let i = 0; i <= n + 1; i++) corners.push([i % 2 ? 0.7 : 0.3, 0.85 - (i / (n + 1)) * 0.5]);
  return polyline(corners, duration);
}

export function polyline(corners, duration, perSeg = 20) {
  const pts = [];
  const segs = corners.length - 1;
  for (let k = 0; k < segs; k++) {
    for (let i = 0; i < perSeg; i++) {
      const s = i / perSeg;
      const a = corners[k], b = corners[k + 1];
      pts.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, ((k + s) / segs) * duration]);
    }
  }
  const last = corners[corners.length - 1];
  pts.push([last[0], last[1], duration]);
  return { pts };
}

export const figure8 = (times, duration) =>
  makeStroke((s) => {
    const a = s * times * Math.PI * 2;
    return [0.5 + 0.2 * Math.sin(a), 0.5 + 0.15 * Math.sin(2 * a)];
  }, duration, 80 * times);

export function scribble(seed, duration, n = 300) {
  const rng = createRng(seed);
  let u = 0.5, v = 0.5, a = 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    a += (rng() - 0.5) * 1.6;
    u = Math.min(0.95, Math.max(0.05, u + Math.cos(a) * 0.012));
    v = Math.min(0.95, Math.max(0.05, v + Math.sin(a) * 0.012));
    pts.push([u, v, (i / (n - 1)) * duration]);
  }
  return { pts };
}
