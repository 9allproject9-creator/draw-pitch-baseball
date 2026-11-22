import { createGame, battingTeam, fieldingTeam } from '../shared/rules.js';
import { resolvePitch, describePitch } from '../shared/matchCore.js';
import { sanitizeStroke } from '../shared/stroke.js';
import { hashSeed } from '../shared/rng.js';
import { RESULT_MS, HALF_BANNER_MS, STROKE_LIMITS } from '../shared/constants.js';

const PITCH_LEAD_MS = 300;      // 상대 화면 전송 여유 (던진 사람 화면은 즉시 출발)
const FLIGHT_GRACE_MS = 3000;   // 타자 응답 대기 여유

// 한 방의 경기 진행. emit(event, payload)로 방 전체에 보낸다.
export class ServerMatch {
  constructor({ innings, seed, emit, resultScale = 1 }) {
    this.game = createGame({ innings });
    this.seed = seed;
    this.emit = emit;
    this.resultScale = resultScale;
    this.phase = 'idle';
    this.pitchId = 0;
    this.timer = null;
    this.paused = false;
    this.pending = null;
    this.current = null; // {stroke, T, startAt, swung}
    this.clockEndsAt = 0;
    this.forfeit = false;
  }

  start() { this.startPitching(); }

  setTimer(fn, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.paused) { this.pending = fn; return; }
      fn();
    }, Math.max(0, ms));
  }

  phaseMsg() {
    return {
      phase: this.phase,
      game: this.game,
      pitcherTeam: fieldingTeam(this.game),
      pitchId: this.pitchId,
      clockEndsAt: this.phase === 'pitching' ? this.clockEndsAt : undefined,
      forfeit: this.forfeit || undefined,
    };
  }

  startPitching() {
    this.phase = 'pitching';
    this.pitchId += 1;
    this.current = null;
    this.clockEndsAt = Date.now() + STROKE_LIMITS.clockMs;
    this.emit('game:phase', this.phaseMsg());
    const id = this.pitchId;
    this.setTimer(() => { if (this.phase === 'pitching' && this.pitchId === id) this.resolve(null, null); }, STROKE_LIMITS.clockMs + 500);
  }

  onStroke(team, { pitchId, stroke } = {}) {
    if (this.phase !== 'pitching') return '지금은 던질 차례가 아니에요';
    if (team !== fieldingTeam(this.game)) return '상대가 던질 차례예요';
    if (pitchId !== this.pitchId) return '이미 지난 투구예요';
    const clean = sanitizeStroke(stroke);
    if (!clean.ok) { this.resolve(null, null); return null; }
    const { path } = describePitch(clean.stroke);
    const startAt = Date.now() + PITCH_LEAD_MS;
    this.current = { stroke: clean.stroke, T: path.T, startAt, swung: false };
    this.phase = 'flight';
    this.emit('pitch:start', { pitchId: this.pitchId, stroke: clean.stroke, startAt });
    this.emit('game:phase', this.phaseMsg());
    const id = this.pitchId;
    this.setTimer(() => {
      if (this.phase === 'flight' && this.pitchId === id) this.resolve(this.current.stroke, { type: 'take' });
    }, PITCH_LEAD_MS + path.T + FLIGHT_GRACE_MS);
    return null;
  }

  checkBatter(team, pitchId) {
    if (this.phase !== 'flight' || !this.current) return '지금은 칠 수 없어요';
    if (team !== battingTeam(this.game)) return '상대가 칠 차례예요';
    if (pitchId !== this.pitchId) return '이미 지난 투구예요';
    if (this.current.swung) return '이미 휘둘렀어요';
    return null;
  }

  onSwing(team, { pitchId, t, ray } = {}) {
    const err = this.checkBatter(team, pitchId);
    if (err) return err;
    const okNum = (n) => typeof n === 'number' && Number.isFinite(n);
    if (!okNum(t) || t < 0 || t > this.current.T + 2000) return '잘못된 스윙';
    if (!ray || !okNum(ray.x) || !okNum(ray.y) || !okNum(ray.z)) return '잘못된 스윙';
    this.current.swung = true;
    this.resolve(this.current.stroke, { type: 'human', t, ray: { x: ray.x, y: ray.y, z: ray.z } });
    return null;
  }

  onTake(team, { pitchId } = {}) {
    const err = this.checkBatter(team, pitchId);
    if (err) return err;
    this.current.swung = true;
    this.resolve(this.current.stroke, { type: 'take' });
    return null;
  }

  resolve(stroke, swing) {
    clearTimeout(this.timer);
    const res = resolvePitch({
      game: this.game,
      stroke: stroke || { pts: [] },
      swing,
      seed: hashSeed(this.seed, this.game.pitchNo, this.pitchId),
    });
    this.game = res.game;
    this.phase = 'result';
    this.emit('pitch:result', {
      pitchId: this.pitchId,
      outcome: res.outcome, pitch: res.pitch, contact: res.contact, swingT: res.swingT, hbpT: res.hbpT ?? null,
      flight: res.flight, events: res.events, game: res.game,
      swing: swing && swing.type === 'human' ? { t: swing.t, ray: swing.ray } : null,
    });
    const halfOver = res.events.some((e) => e.type === 'halfOver');
    const wait = ((RESULT_MS[res.outcome] || 2500) + (halfOver ? HALF_BANNER_MS : 0)) * this.resultScale;
    this.setTimer(() => this.next(), wait);
  }

  next() {
    if (this.game.status === 'final') {
      this.phase = 'final';
      this.emit('game:phase', this.phaseMsg());
      return;
    }
    this.startPitching();
  }

  pause() { this.paused = true; }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.phase === 'pitching') { clearTimeout(this.timer); this.pitchId -= 1; this.startPitching(); return; }
    if (this.phase === 'flight' && !this.timer) { this.resolve(this.current.stroke, { type: 'take' }); return; }
    if (this.pending) { const fn = this.pending; this.pending = null; fn(); }
  }

  forfeitTo(winner) {
    clearTimeout(this.timer);
    this.game = { ...this.game, status: 'final', winner };
    this.forfeit = true;
    this.phase = 'final';
    this.emit('game:phase', this.phaseMsg());
  }

  dispose() { clearTimeout(this.timer); }
}
