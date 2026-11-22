import { BAT_CAM, HIT_ZONE, CONTACT, DIFFICULTY, BATTER, BALL_R } from './constants.js';
import { timeAtZ } from './trajectory.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 사람 스윙: 탭한 순간 공 위치와 탭 광선(BAT_CAM 기준)의 수직거리 + 타이밍
export function evalHumanSwing(path, swing) {
  const P = path.positionAt(swing.t);
  if (P.z < HIT_ZONE.zMin) return { hit: false, reason: 'early' };
  if (P.z > HIT_ZONE.zMax) return { hit: false, reason: 'late' };
  const r = swing.ray;
  const rl = Math.hypot(r.x, r.y, r.z) || 1;
  const d = { x: r.x / rl, y: r.y / rl, z: r.z / rl };
  const w = { x: P.x - BAT_CAM.x, y: P.y - BAT_CAM.y, z: P.z - BAT_CAM.z };
  const cx = w.y * d.z - w.z * d.y, cy = w.z * d.x - w.x * d.z, cz = w.x * d.y - w.y * d.x;
  const dist = Math.hypot(cx, cy, cz);
  const ahead = w.x * d.x + w.y * d.y + w.z * d.z;
  if (dist > CONTACT.dMax || ahead <= 0) return { hit: false, reason: 'off' };
  const a = 1 - clamp((dist - CONTACT.dPerfect) / (CONTACT.dMax - CONTACT.dPerfect), 0, 1);
  const b = 1 - clamp(Math.abs(P.z - HIT_ZONE.ideal) / CONTACT.timingHalf, 0, 1);
  return {
    hit: true,
    quality: a * b,
    timing: clamp((P.z - HIT_ZONE.ideal) / CONTACT.timingHalf, -1, 1),
    dist,
  };
}

const TABLE = [
  { min: 0.8, rows: [['HR', 0.40], ['3B', 0.08], ['2B', 0.27], ['1B', 0.20], ['FO', 0.05]] },
  { min: 0.55, rows: [['HR', 0.08], ['2B', 0.17], ['1B', 0.40], ['FO', 0.17], ['FOUL', 0.18]] },
  { min: 0.3, rows: [['1B', 0.22], ['GO', 0.30], ['FO', 0.20], ['FOUL', 0.28]] },
  { min: -1, rows: [['FOUL', 0.50], ['GO', 0.28], ['FO', 0.22]] },
];

export function outcomeFromQuality(q, rng) {
  const band = TABLE.find((b) => q >= b.min);
  const x = rng();
  let acc = 0;
  for (const [o, p] of band.rows) { acc += p; if (x < acc) return o; }
  return band.rows[band.rows.length - 1][0];
}

export function aiBatter(info, difficulty, rng) {
  const D = (DIFFICULTY[difficulty] || DIFFICULTY.normal).bat;
  const swingP = info.inZone ? D.zoneSwing : D.chase + 0.35 * info.craziness;
  const swing = rng() < swingP;
  if (!swing) return { swing: false, contact: false, quality: 0 };
  const speedF = clamp(0.6 + (0.3 * (info.T / 1000 - 0.4)) / 0.6, 0.6, 1.0);
  const contactP = D.base * speedF * (1 - 0.75 * info.craziness) * (info.inZone ? 1 : 0.5);
  const contact = rng() < contactP;
  const quality = contact ? Math.pow(rng(), 0.8 + 1.6 * info.craziness) * D.qMax : 0;
  return { swing: true, contact, quality };
}

const R = (rng, a, b) => a + (b - a) * rng();

export function hitFlight(outcome, timing, rng) {
  const fairSpray = () => clamp(timing * 40 + (rng() - 0.5) * 34, -43, 43);
  switch (outcome) {
    case 'GO': return { kind: 'ground', spray: fairSpray(), distance: R(rng, 25, 45), apex: 0.4, hangMs: 1600 };
    case 'FO': {
      const pop = rng() < 0.25;
      return pop
        ? { kind: 'pop', spray: fairSpray() * 0.5, distance: R(rng, 15, 35), apex: R(rng, 25, 35), hangMs: 3000 }
        : { kind: 'fly', spray: fairSpray(), distance: R(rng, 60, 95), apex: R(rng, 18, 30), hangMs: 2800 };
    }
    case '1B': return { kind: 'line', spray: fairSpray(), distance: R(rng, 40, 70), apex: R(rng, 2, 6), hangMs: 1300 };
    case '2B': return { kind: 'line', spray: fairSpray(), distance: R(rng, 75, 100), apex: R(rng, 6, 14), hangMs: 1900 };
    case '3B': return { kind: 'fly', spray: fairSpray(), distance: R(rng, 95, 115), apex: R(rng, 12, 22), hangMs: 2400 };
    case 'HR': return { kind: 'hr', spray: fairSpray(), distance: R(rng, 110, 140), apex: R(rng, 30, 45), hangMs: 3200 };
    case 'HBP': return { kind: 'bounce', spray: R(rng, 150, 210), distance: R(rng, 2, 4), apex: R(rng, 0.8, 1.6), hangMs: 700 };
    case 'FOUL': {
      const side = timing !== 0 ? Math.sign(timing) : (rng() < 0.5 ? -1 : 1);
      return { kind: 'foul', spray: side * R(rng, 50, 80), distance: R(rng, 20, 60), apex: R(rng, 5, 20), hangMs: 1800 };
    }
    default: return null;
  }
}

export function aiSwingTime(path, contact, rng) {
  const t = timeAtZ(path, HIT_ZONE.ideal);
  return contact ? t : t + (rng() < 0.5 ? -1 : 1) * R(rng, 40, 120);
}

// 공이 타자 몸에 맞는 시각 (없으면 null). untilT 이전까지만 확인
export function findHbp(path, untilT = Infinity) {
  const t0 = Math.max(0, timeAtZ(path, BATTER.z - 0.8));
  const t1 = Math.min(untilT, path.catchMs);
  for (let t = t0; t <= t1; t += 6) {
    const P = path.positionAt(t);
    if (P.y < BATTER.yMin || P.y > BATTER.yMax) continue;
    if (Math.hypot(P.x - BATTER.x, P.z - BATTER.z) < BATTER.r + BALL_R) return t;
  }
  return null;
}
