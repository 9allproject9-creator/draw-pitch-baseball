import { createGame, fieldingTeam, battingTeam } from '/shared/rules.js';
import { resolvePitch } from '/shared/matchCore.js';
import { sanitizeStroke } from '/shared/stroke.js';
import { buildPath } from '/shared/trajectory.js';
import { generateAiStroke } from '/shared/aiPitcher.js';
import { createRng, hashSeed } from '/shared/rng.js';
import { RESULT_MS, HALF_BANNER_MS, STROKE_LIMITS } from '/shared/constants.js';

const LEAD = 900;

// AI 대전 매치 소스. 온라인 매치와 같은 이벤트/메서드를 제공한다.
export function createLocalMatch({ innings = 3, difficulty = 'normal', myTeam = 'away', names }) {
  const et = new EventTarget();
  const emit = (type, detail) => et.dispatchEvent(new CustomEvent(type, { detail }));
  const baseSeed = hashSeed(Date.now(), Math.random());
  const aiRng = createRng(baseSeed ^ 0x9e3779b9);
  let game = createGame({ innings });
  let pitchId = 0;
  let phase = 'idle';
  let timers = [];
  let cur = null; // {stroke, path, startNow, swung}
  let closed = false;
  const later = (fn, ms) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); if (!closed) fn(); }, ms); timers.push(t); return t; };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; };
  const aiTeam = myTeam === 'home' ? 'away' : 'home';

  function startPitching() {
    if (game.status === 'final') { phase = 'final'; emit('phase', { phase, game, pitcherTeam: fieldingTeam(game), pitchId }); return; }
    phase = 'pitching';
    pitchId += 1;
    cur = null;
    const clockEndsAt = performance.now() + STROKE_LIMITS.clockMs;
    const pitcherTeam = fieldingTeam(game);
    emit('phase', { phase, game, pitcherTeam, pitchId, clockEndsAt });
    const id = pitchId;
    if (pitcherTeam === aiTeam) {
      later(() => beginPitch(generateAiStroke(difficulty, aiRng)), 1100 + aiRng() * 900);
    } else {
      later(() => { if (phase === 'pitching' && pitchId === id) resolve(null, null); }, STROKE_LIMITS.clockMs + 400);
    }
  }

  function beginPitch(stroke) {
    const clean = sanitizeStroke(stroke);
    if (!clean.ok) { resolve(null, null); return; }
    clearAll();
    const path = buildPath(clean.stroke);
    const startNow = performance.now() + LEAD;
    cur = { stroke: clean.stroke, path, startNow, swung: false };
    phase = 'flight';
    emit('pitchStart', { pitchId, stroke: clean.stroke, startNow });
    if (battingTeam(game) === aiTeam) {
      // AI 타자: 결과는 미리 계산하고, 스윙/도착 시점에 알린다
      const res = compute(clean.stroke, { type: 'ai', difficulty });
      const at = res.swingT != null ? Math.min(res.swingT, path.T) : path.T;
      later(() => publish(res), Math.max(0, startNow + at - performance.now() - 20));
    } else {
      later(() => { if (phase === 'flight' && cur && !cur.swung) { cur.swung = true; resolve(cur.stroke, { type: 'take' }); } }, LEAD + path.catchMs + 2500);
    }
  }

  function compute(stroke, swing) {
    return resolvePitch({ game, stroke: stroke || { pts: [] }, swing, seed: hashSeed(baseSeed, game.pitchNo, pitchId) });
  }

  function resolve(stroke, swing) {
    clearAll();
    publish(compute(stroke, swing));
  }

  function publish(res) {
    game = res.game;
    phase = 'result';
    emit('result', { pitchId, ...res, swing: null });
    const halfOver = res.events.some((e) => e.type === 'halfOver');
    later(startPitching, (RESULT_MS[res.outcome] || 2500) + (halfOver ? HALF_BANNER_MS : 0));
  }

  return {
    kind: 'local',
    me: myTeam,
    names,
    difficulty,
    addEventListener: et.addEventListener.bind(et),
    removeEventListener: et.removeEventListener.bind(et),
    start() { later(startPitching, 600); },
    submitStroke(stroke) {
      if (phase !== 'pitching' || fieldingTeam(game) !== myTeam) return;
      beginPitch(stroke);
    },
    submitSwing({ t, ray }) {
      if (phase !== 'flight' || !cur || cur.swung || battingTeam(game) !== myTeam) return;
      cur.swung = true;
      resolve(cur.stroke, { type: 'human', t, ray });
    },
    submitTake() {
      if (phase !== 'flight' || !cur || cur.swung || battingTeam(game) !== myTeam) return;
      cur.swung = true;
      resolve(cur.stroke, { type: 'take' });
    },
    sendEmote() {},
    rematch() {
      clearAll();
      game = createGame({ innings });
      pitchId = 0;
      later(startPitching, 400);
    },
    leave() { closed = true; clearAll(); },
  };
}
