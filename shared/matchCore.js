import { createRng } from './rng.js';
import { sanitizeStroke, strokeMetrics, kmh, namePitch } from './stroke.js';
import { buildPath } from './trajectory.js';
import { evalHumanSwing, outcomeFromQuality, aiBatter, hitFlight, aiSwingTime, findHbp } from './contact.js';
import { applyOutcome } from './rules.js';

// 한 투구의 전체 판정. 서버(온라인)와 브라우저(AI 대전)가 같이 쓴다.
export function describePitch(stroke) {
  const path = buildPath(stroke);
  const metrics = strokeMetrics(stroke);
  const speed = kmh(path.T);
  return {
    path,
    pitch: {
      T: path.T, kmh: speed, name: namePitch(metrics, path.T),
      craziness: Math.round(metrics.craziness * 1000) / 1000,
      metrics: { length: metrics.length, loops: metrics.loops, zigzags: metrics.zigzags },
      end: path.end, inZone: path.inZone,
    },
  };
}

export function resolvePitch({ game, stroke, swing, seed }) {
  const rng = createRng(seed);
  const clean = sanitizeStroke(stroke);
  if (!clean.ok) {
    const { game: next, events } = applyOutcome(game, 'BALL_AUTO', rng);
    return {
      pitch: { T: 0, kmh: 0, name: '폭투', craziness: 0, metrics: null, end: null, inZone: false },
      outcome: 'BALL_AUTO', contact: null, swingT: null, flight: null, events, game: next,
    };
  }
  const { path, pitch } = describePitch(clean.stroke);
  let outcome, contact = null, swingT = null, hbpT = null;

  if (!swing || swing.type === 'take') {
    outcome = pitch.inZone ? 'TAKE_STRIKE' : 'TAKE_BALL';
  } else if (swing.type === 'human') {
    swingT = swing.t;
    const r = evalHumanSwing(path, swing);
    if (!r.hit) outcome = 'MISS';
    else {
      contact = { quality: r.quality, timing: r.timing, dist: r.dist };
      outcome = outcomeFromQuality(r.quality, rng);
    }
  } else if (swing.type === 'ai') {
    const ai = aiBatter({ inZone: pitch.inZone, craziness: pitch.craziness, T: pitch.T }, swing.difficulty, rng);
    if (!ai.swing) outcome = pitch.inZone ? 'TAKE_STRIKE' : 'TAKE_BALL';
    else {
      swingT = aiSwingTime(path, ai.contact, rng);
      if (!ai.contact) outcome = 'MISS';
      else {
        const timing = (rng() - 0.5) * 1.2;
        contact = { quality: ai.quality, timing, dist: 0 };
        outcome = outcomeFromQuality(ai.quality, rng);
      }
    }
  } else {
    outcome = pitch.inZone ? 'TAKE_STRIKE' : 'TAKE_BALL';
  }

  // 사구: 배트에 맞기 전에 공이 몸에 닿으면 몸에 맞는 공
  const hitAt = contact && swingT != null ? swingT : Infinity;
  const hb = findHbp(path, hitAt);
  if (hb != null) { outcome = 'HBP'; hbpT = hb; contact = null; if (swing && swing.type === 'ai') swingT = null; }
  const flight = contact ? hitFlight(outcome, contact.timing, rng) : outcome === 'HBP' ? hitFlight('HBP', 0, rng) : null;
  const { game: next, events } = applyOutcome(game, outcome, rng, { kmh: pitch.kmh, name: pitch.name, craziness: pitch.craziness });
  return { pitch, outcome, contact, swingT, hbpT, flight, events, game: next };
}
