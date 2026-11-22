// 좌표계(미터): 홈플레이트 판정면 z=0, 투수판 z=-18.44, y 위, 포수 쪽에서 투수를 볼 때 +x 오른쪽
export const RUBBER_Z = -18.44;
export const RELEASE = { x: -0.35, y: 1.75, z: -17.2 };
export const PITCH_CAM = { x: 0, y: 2.9, z: -23.5 };
export const PITCH_CAM_TARGET = { x: 0, y: 0.85, z: 0 };
export const BAT_CAM = { x: 0, y: 1.5, z: 4.6 };
export const BAT_CAM_TARGET = { x: 0, y: 1.0, z: -18 };
export const ZONE = { xMin: -0.216, xMax: 0.216, yMin: 0.48, yMax: 1.07 };
export const BALL_R = 0.037;
export const BOX = { xMin: -2.0, xMax: 2.0, yMin: -0.05, yMax: 2.9 };
export const CATCHER_Z = 0.85;
export const HIT_ZONE = { zMin: -1.15, zMax: 0.45, ideal: -0.35 };
export const STROKE_LIMITS = { maxPoints: 600, minDurationMs: 60, maxDurationMs: 8000, inkMax: 30, clockMs: 15000 };
// 비행 시간 = base + 선 길이(m)×perMeter + 그린 시간×drawFactor (공은 선을 따라 일정한 속도로 이동)
export const FLIGHT = { base: 250, perMeter: 100, drawFactor: 0.12, minMs: 400, maxMs: 3000, speedDistance: 17.2, blendFrac: 0.08 };
export const CONTACT = { dPerfect: 0.06, dMax: 0.30, timingHalf: 0.8 };
export const RESULT_MS = {
  TAKE_STRIKE: 2200, TAKE_BALL: 2200, BALL_AUTO: 2200, MISS: 2200, FOUL: 2600,
  GO: 3600, FO: 3800, '1B': 4500, '2B': 5000, '3B': 5500, HR: 7000,
};
export const HALF_BANNER_MS = 2200;
export const EXTRA_INNINGS_MAX = 3;
export const INNING_OPTIONS = [1, 3, 5, 9];
export const EMOTES = ['lol', 'shock', 'clap', 'angry', 'fire'];

export const DIFFICULTY = {
  easy: {
    bat: { zoneSwing: 0.68, chase: 0.26, base: 0.62, qMax: 0.85 },
    pitch: { zoneRate: 0.55, speed: [0.6, 1.0], weights: { straight: 3, curve: 3, zigzag: 2, spiral: 1, figure8: 0, wave: 2, scribble: 0 } },
  },
  normal: {
    bat: { zoneSwing: 0.78, chase: 0.18, base: 0.78, qMax: 0.95 },
    pitch: { zoneRate: 0.65, speed: [0.8, 1.3], weights: { straight: 2, curve: 2, zigzag: 2, spiral: 2, figure8: 1, wave: 2, scribble: 1 } },
  },
  hard: {
    bat: { zoneSwing: 0.85, chase: 0.12, base: 0.90, qMax: 1.0 },
    pitch: { zoneRate: 0.72, speed: [1.0, 1.7], weights: { straight: 1, curve: 2, zigzag: 2, spiral: 2, figure8: 2, wave: 1, scribble: 2 } },
  },
};
