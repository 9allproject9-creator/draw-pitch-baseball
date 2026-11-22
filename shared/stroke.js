import { BOX, STROKE_LIMITS, FLIGHT } from './constants.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 박스 좌표(u: 투수 화면 왼→오, v: 아래→위) → 판정면 좌표. 투수 화면 왼쪽 = 포수 기준 +x
export function boxToPlate(u, v) {
  return {
    x: BOX.xMax * (1 - u) + BOX.xMin * u,
    y: BOX.yMin * (1 - v) + BOX.yMax * v,
  };
}

export function plateToBox(x, y) {
  return {
    u: (BOX.xMax - x) / (BOX.xMax - BOX.xMin),
    v: (y - BOX.yMin) / (BOX.yMax - BOX.yMin),
  };
}

const segLen = (a, b) => {
  const p = boxToPlate(a[0], a[1]), q = boxToPlate(b[0], b[1]);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

export function sanitizeStroke(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pts)) return { ok: false, reason: 'no points' };
  const src = raw.pts;
  if (src.length === 0) return { ok: false, reason: 'empty' };
  if (src.length > 20000) return { ok: false, reason: 'too many points' };
  let pts = [];
  for (const p of src) {
    if (!Array.isArray(p) || p.length < 3) return { ok: false, reason: 'bad point' };
    const [u, v, t] = p;
    if (![u, v, t].every((n) => typeof n === 'number' && Number.isFinite(n))) return { ok: false, reason: 'bad number' };
    pts.push([clamp(u, 0, 1), clamp(v, 0, 1), t]);
  }
  // 시간: 0부터, 단조 증가
  const t0 = pts[0][2];
  let prev = 0;
  for (const p of pts) { p[2] = Math.max(prev, p[2] - t0); prev = p[2]; }
  if (pts.length === 1) pts.push([pts[0][0], pts[0][1], STROKE_LIMITS.minDurationMs]);

  // 최대 시간 자르기
  pts = pts.filter((p) => p[2] <= STROKE_LIMITS.maxDurationMs);
  if (pts.length < 2) pts.push([pts[0][0], pts[0][1], STROKE_LIMITS.minDurationMs]);

  // 최소 시간 보장
  const total = pts[pts.length - 1][2];
  if (total < STROKE_LIMITS.minDurationMs) {
    const n = pts.length;
    pts.forEach((p, i) => { p[2] = total > 0 ? (p[2] / total) * STROKE_LIMITS.minDurationMs : (i / (n - 1)) * STROKE_LIMITS.minDurationMs; });
  }

  // 잉크 한도 자르기
  let ink = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = segLen(pts[i - 1], pts[i]);
    if (ink + d > STROKE_LIMITS.inkMax) {
      const f = (STROKE_LIMITS.inkMax - ink) / d;
      const a = pts[i - 1], b = pts[i];
      const cut = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      pts = pts.slice(0, i);
      pts.push(cut);
      break;
    }
    ink += d;
  }

  // 다운샘플
  if (pts.length > STROKE_LIMITS.maxPoints) {
    const n = STROKE_LIMITS.maxPoints;
    const out = [];
    for (let i = 0; i < n; i++) out.push(pts[Math.round((i / (n - 1)) * (pts.length - 1))]);
    pts = out;
  }
  if (pts[pts.length - 1][2] < STROKE_LIMITS.minDurationMs) pts[pts.length - 1][2] = STROKE_LIMITS.minDurationMs;
  return { ok: true, stroke: { pts: pts.map((p) => [p[0], p[1], p[2]]) } };
}

export function strokeDuration(stroke) {
  return stroke.pts[stroke.pts.length - 1][2];
}

// 판정면 미터 기준 누적 길이 배열
export function strokeArc(stroke) {
  const arc = [0];
  for (let i = 1; i < stroke.pts.length; i++) arc.push(arc[i - 1] + segLen(stroke.pts[i - 1], stroke.pts[i]));
  return arc;
}

export function strokeInk(stroke) {
  let ink = 0;
  for (let i = 1; i < stroke.pts.length; i++) ink += segLen(stroke.pts[i - 1], stroke.pts[i]);
  return ink;
}

// 판정면 미터 좌표로 0.03m 간격 재샘플 + 3점 이동평균
function resample(stroke, step = 0.03) {
  const P = stroke.pts.map((p) => boxToPlate(p[0], p[1]));
  const out = [P[0]];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d === 0) continue;
    let pos = step - carry;
    while (pos <= d) {
      const f = pos / d;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      pos += step;
    }
    carry = d - (pos - step);
  }
  if (out.length < 3) return out;
  const sm = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    sm.push({ x: (out[i - 1].x + out[i].x + out[i + 1].x) / 3, y: (out[i - 1].y + out[i].y + out[i + 1].y) / 3 });
  }
  sm.push(out[out.length - 1]);
  return sm;
}

const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export function strokeMetrics(stroke) {
  const length = strokeInk(stroke);
  const R = resample(stroke);
  const base = { length, totalTurn: 0, netTurn: 0, loops: 0, zigzags: 0, craziness: 0, bend: { x: 0, y: 0 } };
  if (R.length < 4) return base;
  const heads = [];
  for (let i = 1; i < R.length; i++) heads.push(Math.atan2(R[i].y - R[i - 1].y, R[i].x - R[i - 1].x));
  const dth = [];
  for (let i = 1; i < heads.length; i++) dth.push(wrap(heads[i] - heads[i - 1]));
  let totalTurn = 0, netTurn = 0;
  for (const d of dth) { totalTurn += Math.abs(d); netTurn += d; }

  // 급회전: 0.12m 창(4샘플) 안 누적 회전 > 90° — 부드러운 곡선(8자, 원)은 제외
  const W = 4;
  let zigzags = 0, lastSign = 0;
  for (let i = 0; i < dth.length;) {
    let sum = 0;
    for (let k = i; k < Math.min(dth.length, i + W); k++) sum += dth[k];
    if (Math.abs(sum) > Math.PI / 2) {
      const sign = Math.sign(sum);
      if (lastSign !== 0 && sign !== lastSign) zigzags++;
      lastSign = sign;
      i += W;
    } else i++;
  }

  // 휘어짐 방향 (처음 20% 방향 → 마지막 20% 방향 변화)
  const k = Math.max(1, Math.floor(R.length * 0.2));
  const dir = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
  const d0 = dir(R[0], R[k]);
  const d1 = dir(R[R.length - 1 - k], R[R.length - 1]);

  return {
    length,
    totalTurn,
    netTurn,
    loops: Math.floor(Math.abs(netTurn) / TAU + 0.1),
    zigzags,
    craziness: 1 - Math.exp(-totalTurn / (3 * TAU)),
    bend: { x: d1.x - d0.x, y: d1.y - d0.y },
  };
}

export function flightMs(stroke) {
  return clamp(FLIGHT.base + strokeInk(stroke) * FLIGHT.perMeter + strokeDuration(stroke) * FLIGHT.drawFactor, FLIGHT.minMs, FLIGHT.maxMs);
}

export function kmh(ms) {
  return Math.round((3.6 * FLIGHT.speedDistance) / (ms / 1000));
}

export function namePitch(m, ms) {
  if (m.craziness >= 0.85) return '정신나간 마구';
  if (m.loops >= 4) return '블랙홀볼';
  if (m.totalTurn >= 3.5 * Math.PI && Math.abs(m.netTurn) < Math.PI && m.zigzags < 3) return '8자 마구';
  if (m.loops >= 1) return `회오리볼 ×${m.loops}`;
  if (m.zigzags >= 6) return '번개볼';
  if (m.zigzags >= 3) return '지그재그볼';
  if (m.totalTurn >= 0.3 * Math.PI) {
    const b = m.bend || { x: 0, y: 0 };
    return Math.abs(b.y) > Math.abs(b.x) && b.y < 0 ? '커브' : '슬라이더';
  }
  if (ms >= 2200) return '아리랑볼';
  if (ms <= 520) return '강속구';
  return '직구';
}
