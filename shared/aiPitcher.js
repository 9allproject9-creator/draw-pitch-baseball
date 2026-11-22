import { ZONE, BALL_R, BOX } from './constants.js';
import { plateToBox, boxToPlate } from './stroke.js';
import { DIFFICULTY } from './constants.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = (rng, a, b) => a + (b - a) * rng();

function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rng() * total;
  for (const [k, w] of entries) { x -= w; if (x < 0) return k; }
  return entries[entries.length - 1][0];
}

function pickEnd(inZone, rng) {
  if (inZone) {
    const m = 0.03;
    return { x: R(rng, ZONE.xMin + m, ZONE.xMax - m), y: R(rng, ZONE.yMin + m, ZONE.yMax - m) };
  }
  // 존 바깥 0.05~0.35m (공 반지름 감안)
  const side = Math.floor(rng() * 4);
  const off = BALL_R + R(rng, 0.05, 0.35);
  let x = R(rng, ZONE.xMin - 0.3, ZONE.xMax + 0.3), y = R(rng, ZONE.yMin - 0.2, ZONE.yMax + 0.2);
  if (side === 0) x = ZONE.xMin - off;
  else if (side === 1) x = ZONE.xMax + off;
  else if (side === 2) y = Math.max(BOX.yMin + 0.05, ZONE.yMin - off);
  else y = ZONE.yMax + off;
  // 아래쪽이 박스 밖으로 잘려 존 안으로 들어가는 경우 방지
  if (side === 2 && y >= ZONE.yMin - BALL_R) x = ZONE.xMax + off;
  return { x, y };
}

// 템플릿: s∈[0,1] → 기본 직선에서의 수직/수평 편차 (박스 단위)
function makeShape(kind, rng) {
  const env = (s) => Math.sin(Math.PI * s);
  switch (kind) {
    case 'straight': return { n: 30, f: () => [0, 0] };
    case 'curve': {
      const a = R(rng, 0.12, 0.32) * (rng() < 0.5 ? -1 : 1);
      return { n: 50, perp: true, f: (s) => [a * 4 * s * (1 - s), 0] };
    }
    case 'zigzag': {
      const k = 3 + Math.floor(rng() * 5);
      const a = R(rng, 0.08, 0.2);
      return {
        n: 30 * k, perp: true,
        f: (s) => {
          const x = s * (k + 1);
          const i = Math.floor(x), fr = x - i;
          const amp = (j) => (j === 0 || j > k ? 0 : (j % 2 ? a : -a));
          return [lerp(amp(i), amp(i + 1), fr), 0];
        },
      };
    }
    case 'spiral': {
      const turns = 1 + Math.floor(rng() * 4);
      const r = R(rng, 0.07, 0.17);
      const dir = rng() < 0.5 ? 1 : -1;
      return { n: 60 * turns, f: (s) => [r * env(s) * Math.cos(dir * TAU * turns * s) - r * env(s), r * env(s) * Math.sin(dir * TAU * turns * s)] };
    }
    case 'figure8': {
      const times = 1 + Math.floor(rng() * 2);
      const a = R(rng, 0.12, 0.2), b = R(rng, 0.08, 0.14);
      return { n: 90 * times, f: (s) => [a * env(s) * Math.sin(TAU * times * s), b * env(s) * Math.sin(2 * TAU * times * s)] };
    }
    case 'wave': {
      const k = R(rng, 1.5, 4);
      const a = R(rng, 0.06, 0.16);
      return { n: 80, perp: true, f: (s) => [a * env(s) * Math.sin(TAU * k * s), 0] };
    }
    case 'scribble': {
      const comps = Array.from({ length: 5 }, () => ({ fx: R(rng, 2, 9), fy: R(rng, 2, 9), px: R(rng, 0, TAU), py: R(rng, 0, TAU), a: R(rng, 0.04, 0.1) }));
      return {
        n: 220,
        f: (s) => {
          let x = 0, y = 0;
          for (const c of comps) { x += c.a * Math.sin(TAU * c.fx * s + c.px); y += c.a * Math.cos(TAU * c.fy * s + c.py); }
          const e = env(s);
          return [x * e, y * e];
        },
      };
    }
    default: return { n: 30, f: () => [0, 0] };
  }
}

export function generateAiStroke(difficulty, rng) {
  const D = (DIFFICULTY[difficulty] || DIFFICULTY.normal).pitch;
  const kind = pickWeighted(D.weights, rng);
  const inZone = rng() < D.zoneRate;
  const endP = pickEnd(inZone, rng);
  const E = plateToBox(endP.x, endP.y);
  const S = { u: R(rng, 0.42, 0.58), v: R(rng, 0.78, 0.92) };
  const shape = makeShape(kind, rng);
  const dx = E.u - S.u, dy = E.v - S.v;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;

  const raw = [];
  for (let i = 0; i < shape.n; i++) {
    const s = i / (shape.n - 1);
    const [a, b] = shape.f(s);
    let u = lerp(S.u, E.u, s), v = lerp(S.v, E.v, s);
    if (shape.perp) { u += px * a; v += py * a; } else { u += a; v += b; }
    raw.push([clamp(u, 0.01, 0.99), clamp(v, 0.01, 0.99)]);
  }
  raw[raw.length - 1] = [clamp(E.u, 0, 1), clamp(E.v, 0, 1)];

  // 사람처럼 시간 부여: 판정면 기준 약 2m/s × 난이도 배수, 흔들림 포함
  const speed = 2.0 * R(rng, D.speed[0], D.speed[1]);
  const wob = R(rng, 0, TAU), wobA = R(rng, 0.1, 0.35);
  const pts = [[raw[0][0], raw[0][1], 0]];
  let t = 0;
  for (let i = 1; i < raw.length; i++) {
    const p = boxToPlate(raw[i][0], raw[i][1]), q = boxToPlate(raw[i - 1][0], raw[i - 1][1]);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    const sp = speed * (1 + wobA * Math.sin(wob + (i / raw.length) * TAU * 1.5));
    t += (d / sp) * 1000;
    pts.push([raw[i][0], raw[i][1], Math.round(t * 10) / 10]);
  }
  return { pts };
}
