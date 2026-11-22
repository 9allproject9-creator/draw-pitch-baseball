import { PITCH_CAM, RELEASE, CATCHER_Z, ZONE, BALL_R, FLIGHT } from './constants.js';
import { boxToPlate, flightMs, strokeDuration } from './stroke.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export function isStrike(end) {
  return end.x >= ZONE.xMin - BALL_R && end.x <= ZONE.xMax + BALL_R &&
    end.y >= ZONE.yMin - BALL_R && end.y <= ZONE.yMax + BALL_R;
}

// 선 → 3D 공 경로. 투수 카메라(PITCH_CAM)에서 보면 공은 항상 그린 점 위에 있다.
export function buildPath(stroke) {
  const pts = stroke.pts;
  const D = strokeDuration(stroke);
  const T = flightMs(stroke);

  const strokeAt = (tau) => {
    if (tau <= pts[0][2]) return [pts[0][0], pts[0][1]];
    if (tau >= D) { const l = pts[pts.length - 1]; return [l[0], l[1]]; }
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][2] <= tau) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi];
    const f = b[2] > a[2] ? (tau - a[2]) / (b[2] - a[2]) : 0;
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
  };

  const inFlight = (t) => {
    const s = Math.min(1, Math.max(0, t / T));
    const [u, v] = strokeAt(s * D);
    const B = boxToPlate(u, v);
    const z = lerp(RELEASE.z, 0, s);
    const k = (z - PITCH_CAM.z) / (0 - PITCH_CAM.z);
    let x = PITCH_CAM.x + (B.x - PITCH_CAM.x) * k;
    let y = PITCH_CAM.y + (B.y - PITCH_CAM.y) * k;
    if (s < FLIGHT.blendFrac) {
      const w = smooth(s / FLIGHT.blendFrac);
      x = lerp(RELEASE.x, x, w);
      y = lerp(RELEASE.y, y, w);
    }
    return { x, y: Math.max(y, BALL_R), z };
  };

  const endP = inFlight(T);
  const before = inFlight(T - 16);
  const vel = { x: (endP.x - before.x) / 16, y: (endP.y - before.y) / 16, z: (endP.z - before.z) / 16 };
  const tCatch = vel.z > 0 ? (CATCHER_Z - endP.z) / vel.z : 0;

  const positionAt = (t) => {
    if (t <= T) return inFlight(t);
    const dt = Math.min(t - T, tCatch);
    return { x: endP.x + vel.x * dt, y: Math.max(BALL_R, endP.y + vel.y * dt), z: endP.z + vel.z * dt };
  };

  const last = pts[pts.length - 1];
  const end = boxToPlate(last[0], last[1]);
  return {
    T,
    durationStroke: D,
    end,
    inZone: isStrike(end),
    catchMs: T + tCatch,
    positionAt,
    samples(n, tMax = T) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(positionAt((i / (n - 1)) * tMax));
      return out;
    },
  };
}

// 공 z가 주어진 값이 되는 시각 (비행 중, z는 시간에 선형)
export function timeAtZ(path, z) {
  const s = (z - RELEASE.z) / (0 - RELEASE.z);
  return s * path.T;
}
