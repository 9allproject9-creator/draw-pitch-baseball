import { ServerMatch } from './match.js';
import { INNING_OPTIONS, EMOTES } from '../shared/constants.js';

const RATE_PER_SEC = 20;
const RESERVE_MS = 60000;

const cleanName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '') || '선수';
const cleanSession = (s) => (typeof s === 'string' && s.length >= 2 && s.length <= 80 ? s : null);

// 방 하나의 상태와 규칙. 통신 방식(Durable Object 웹소켓, 테스트)과 무관.
// send(connId, type, payload) 로 메시지를 보낸다. handle()은 응답(ack)을 바로 돌려준다.
export class RoomCore {
  constructor({ code, send, disconnectGraceMs = 60000, resultScale = 1, onIdle } = {}) {
    this.code = code;
    this.sendRaw = send;
    this.disconnectGraceMs = disconnectGraceMs;
    this.resultScale = resultScale;
    this.onIdle = onIdle;
    this.conns = new Map(); // connId -> {team, hits}
    this.reset();
  }

  reset() {
    this.match?.dispose();
    for (const t of ['home', 'away']) clearTimeout(this.players?.[t]?.graceTimer);
    clearTimeout(this.reserveTimer);
    this.players = { home: null, away: null };
    this.match = null;
    this.innings = 3;
    this.lastEmote = { home: 0, away: 0 };
    this.rematch = new Set();
    this.reserved = false;
  }

  // 방 코드 선점 (방 만들기 전에 Worker가 호출)
  claim() {
    if (this.players.home || this.reserved) return false;
    this.reserved = true;
    clearTimeout(this.reserveTimer);
    this.reserveTimer = setTimeout(() => { if (!this.players.home) this.reserved = false; }, RESERVE_MS);
    return true;
  }

  open(connId) { this.conns.set(connId, { team: null, hits: new Map() }); }

  send(team, type, payload) {
    const p = this.players[team];
    if (p && p.connId != null) this.sendRaw(p.connId, type, payload);
  }
  broadcast(type, payload) { for (const t of ['home', 'away']) this.send(t, type, payload); }

  status() {
    if (this.match) return this.match.phase === 'final' ? 'final' : 'playing';
    return this.players.home && this.players.away ? 'ready' : 'waiting';
  }

  sendRoomState() {
    const players = ['home', 'away'].filter((t) => this.players[t]).map((t) => {
      const p = this.players[t];
      return { name: p.name, team: t, connected: p.connected, host: t === 'home' };
    });
    for (const t of ['home', 'away']) this.send(t, 'room:state', { code: this.code, status: this.status(), players, you: t, innings: this.innings });
  }

  destroy(reason) {
    this.broadcast('room:closed', { reason });
    for (const c of this.conns.values()) c.team = null;
    this.reset();
    this.onIdle?.();
  }

  startMatch() {
    this.match?.dispose();
    this.rematch = new Set();
    this.match = new ServerMatch({
      innings: this.innings,
      seed: `${this.code}-${Date.now()}-${Math.random()}`,
      emit: (ev, payload) => this.broadcast(ev, payload),
      resultScale: this.resultScale,
    });
    this.sendRoomState();
    this.match.start();
  }

  seat(connId, team, player) {
    // 같은 자리에 이전 연결이 있으면 그 연결은 자리에서 뗌
    if (player.connId != null && player.connId !== connId) {
      const old = this.conns.get(player.connId);
      if (old) old.team = null;
    }
    this.players[team] = player;
    player.connId = connId;
    player.connected = true;
    clearTimeout(player.graceTimer);
    const c = this.conns.get(connId);
    if (c) c.team = team;
  }

  leaveSeat(team, immediate) {
    const p = this.players[team];
    if (!p) return;
    const other = team === 'home' ? 'away' : 'home';
    if (this.match && this.match.phase !== 'final') {
      this.match.forfeitTo(other);
      this.sendRoomState();
    }
    if (immediate || !this.match) {
      if (team === 'home') { this.destroy('방장이 나갔어요'); return; }
      this.players[team] = null;
      if (this.match && this.match.phase === 'final') { this.match.dispose(); this.match = null; }
      this.sendRoomState();
    }
    if (!this.players.home?.connected && !this.players.away?.connected) this.destroy('모두 나갔어요');
  }

  close(connId) {
    const c = this.conns.get(connId);
    this.conns.delete(connId);
    if (!c || !c.team) return;
    const team = c.team;
    const p = this.players[team];
    if (!p || p.connId !== connId) return;
    p.connected = false;
    p.connId = null;
    this.match?.pause();
    this.sendRoomState();
    clearTimeout(p.graceTimer);
    p.graceTimer = setTimeout(() => {
      if (!p.connected && this.players[team] === p) this.leaveSeat(team, !this.match || this.match.phase === 'final');
    }, this.disconnectGraceMs);
  }

  limited(connId, ev) {
    const c = this.conns.get(connId);
    if (!c) return true;
    const now = Date.now();
    const h = c.hits.get(ev) || { t: now, n: 0 };
    if (now - h.t > 1000) { h.t = now; h.n = 0; }
    h.n++;
    c.hits.set(ev, h);
    return h.n > RATE_PER_SEC;
  }

  // 메시지 처리 → ack 응답 객체
  handle(connId, ev, d = {}) {
    if (!this.conns.has(connId)) return { ok: false, error: '연결이 없어요' };
    if (this.limited(connId, ev)) return { ok: false, error: '너무 빨라요' };
    try { return this.dispatch(connId, ev, d || {}); } catch (e) { console.error(ev, e); return { ok: false, error: '서버 오류' }; }
  }

  dispatch(connId, ev, d) {
    const c = this.conns.get(connId);
    const team = c.team;
    switch (ev) {
      case 'time:ping': return { t0: d.t0, server: Date.now() };

      case 'room:create': {
        const sid = cleanSession(d.sessionId);
        if (!sid) return { ok: false, error: '세션 정보가 없어요' };
        if (this.players.home && this.players.home.sessionId !== sid) return { ok: false, error: '이미 있는 방이에요. 다시 만들어 주세요' };
        clearTimeout(this.reserveTimer);
        this.reserved = false;
        this.seat(connId, 'home', this.players.home || { name: cleanName(d.name), sessionId: sid });
        this.sendRoomState();
        return { ok: true, code: this.code };
      }

      case 'room:join': {
        const sid = cleanSession(d.sessionId);
        if (!this.players.home) return { ok: false, error: '그런 방이 없어요. 코드를 확인해 주세요' };
        if (!sid) return { ok: false, error: '세션 정보가 없어요' };
        for (const t of ['home', 'away']) {
          if (this.players[t]?.sessionId === sid) {
            this.seat(connId, t, this.players[t]);
            this.match?.resume();
            this.sendRoomState();
            if (this.match) this.sendRaw(connId, 'game:phase', this.match.phaseMsg());
            return { ok: true, code: this.code, rejoined: true, team: t };
          }
        }
        if (this.players.away) return { ok: false, error: '방이 가득 찼어요' };
        this.seat(connId, 'away', { name: cleanName(d.name), sessionId: sid });
        this.sendRoomState();
        return { ok: true, code: this.code, team: 'away' };
      }

      case 'room:rejoin': {
        const t = ['home', 'away'].find((x) => this.players[x]?.sessionId === d.sessionId);
        if (!t) return { ok: false, error: this.players.home ? '이 방의 선수가 아니에요' : '방이 사라졌어요' };
        this.seat(connId, t, this.players[t]);
        this.sendRoomState();
        if (this.match) {
          this.sendRaw(connId, 'game:phase', this.match.phaseMsg());
          const cur = this.match.current;
          if (this.match.phase === 'flight' && cur) this.sendRaw(connId, 'pitch:start', { pitchId: this.match.pitchId, stroke: cur.stroke, startAt: cur.startAt });
          const other = t === 'home' ? 'away' : 'home';
          if (this.players[other]?.connected) this.match.resume();
        }
        return { ok: true, code: this.code, team: t };
      }

      case 'room:leave': {
        if (team) { c.team = null; this.leaveSeat(team, true); }
        return { ok: true };
      }

      case 'game:start': {
        if (!team) return { ok: false, error: '방에 없어요' };
        if (team !== 'home') return { ok: false, error: '방장만 시작할 수 있어요' };
        if (!this.players.away || !this.players.away.connected) return { ok: false, error: '상대를 기다리는 중이에요' };
        if (this.match && this.match.phase !== 'final') return { ok: false, error: '이미 경기 중이에요' };
        const n = Number(d.innings);
        this.innings = INNING_OPTIONS.includes(n) ? n : 3;
        this.startMatch();
        return { ok: true };
      }

      case 'game:rematch': {
        if (!team || !this.match || this.match.phase !== 'final') return { ok: false, error: '아직 경기가 안 끝났어요' };
        if (!this.players.home || !this.players.away) return { ok: false, error: '상대가 나갔어요' };
        this.rematch.add(team);
        this.broadcast('game:rematchVotes', { teams: [...this.rematch] });
        if (this.rematch.size === 2) this.startMatch();
        return { ok: true };
      }

      case 'pitch:stroke':
      case 'pitch:swing':
      case 'pitch:take': {
        if (!team || !this.match) return { ok: false, error: '경기 중이 아니에요' };
        const method = { 'pitch:stroke': 'onStroke', 'pitch:swing': 'onSwing', 'pitch:take': 'onTake' }[ev];
        const err = this.match[method](team, d);
        return err ? { ok: false, error: err } : { ok: true };
      }

      case 'emote': {
        if (!team) return { ok: false, error: '방에 없어요' };
        if (!EMOTES.includes(d.id)) return { ok: false, error: '없는 이모티콘' };
        const now = Date.now();
        if (now - this.lastEmote[team] < 1000) return { ok: false, error: '잠깐만요' };
        this.lastEmote[team] = now;
        this.broadcast('emote', { team, id: d.id });
        return { ok: true };
      }

      default:
        return { ok: false, error: '알 수 없는 요청' };
    }
  }

  dispose() { this.reset(); }
}
