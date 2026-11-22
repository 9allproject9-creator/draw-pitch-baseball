import { buildPath } from '/shared/trajectory.js';
import { battingTeam, fieldingTeam, OUTCOME_LABEL } from '/shared/rules.js';
import { evalHumanSwing, findHbp } from '/shared/contact.js';
import { describePitch } from '/shared/matchCore.js';
import { sanitizeStroke } from '/shared/stroke.js';
import { HIT_ZONE } from '/shared/constants.js';
import { TEAM_COLORS } from '../scene/players.js';

const WINDUP_MS = 520;
const RELEASE_AT = 0.92;

export function createGameController(d) {
  const { stage, field, players, ball, effects, hud, banner, toast, drawPad, batInput, audio, screens } = d;
  let source = null;
  let me = 'away';
  let names = { home: '홈', away: '원정' };
  let game = null;
  let cur = null;
  let resultUi = null;
  const streak = { k: { home: 0, away: 0 }, h: { home: 0, away: 0 } };
  let finishRun = null;
  let listeners = [];
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, Math.max(0, ms)); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };
  const opp = () => (me === 'home' ? 'away' : 'home');

  stage.onFrame((dt, now) => {
    if (!source || !cur) return;
    const t = now - cur.startNow;
    const p = cur.path.positionAt(Math.max(0, t));
    if (cur.iAmBatter) effects.zoneRing(!cur.swung && !cur.hit && t > 0 && p.z >= HIT_ZONE.zMin && p.z <= HIT_ZONE.zMax);
    if (!cur.hit && !cur.contactPending && t > cur.path.T * 0.45) players.setGlove(cur.path.positionAt(Math.min(t + 140, cur.path.catchMs)));
    if (!cur.hit && !cur.contactPending && !cur.hbpFrozen && cur.hbpT != null && t >= cur.hbpT) hbpImpact(cur);
    if (!cur.hit && !cur.contactPending && !cur.hbpFrozen && !cur.caught && t >= cur.path.catchMs) {
      cur.caught = true;
      ball.stopAt(cur.path.catchMs);
      audio.play('mitt');
      drawPad.fadeShown(now);
    }
    if (cur.iAmBatter && !cur.swung && !cur.tookSent && t > cur.path.catchMs + 150) {
      cur.tookSent = true;
      batInput.disarm();
      effects.zoneRing(false);
      source.submitTake();
    }
  });

  function hbpImpact(c) {
    if (c.hbpFrozen) return;
    c.hbpFrozen = true;
    ball.stopAt(c.hbpT);
    const pos = c.path.positionAt(c.hbpT);
    players.knockBatter();
    audio.play('bonk');
    effects.sparks(pos);
    stage.shake(0.9);
    effects.zoneRing(false);
    if (c.iAmBatter && !c.swung && !c.tookSent) { c.tookSent = true; batInput.disarm(); source.submitTake(); }
  }

  function teamName(t) { return names[t] || (t === 'home' ? '홈' : '원정'); }

  function onPhase(p) {
    if (p.phase === 'pitching') {
      clearTimers();
      if (resultUi) { screens.clear(); resultUi = null; hud.show(true); }
      game = p.game;
      hud.setGame(game);
      banner.hide();
      ball.clear();
      drawPad.stop();
      batInput.disarm();
      effects.zoneRing(false);
      stage.followTarget(null);
      players.setTeams({ batting: battingTeam(game), fielding: fieldingTeam(game) });
      players.resetField();
      players.showBases(game.bases);
      players.showBatter(true);
      players.setGlove(null);
      cur = null;
      const iPitch = p.pitcherTeam === me;
      const view = iPitch ? 'pitcher' : 'batter';
      // 내가 던질 땐 카메라 즉시 전환 → 바로 그릴 수 있게
      if (stage.view !== view || !stage.isSettled()) stage.setView(view, { instant: iPitch });
      players.setGhosts(view);
      effects.zoneFrame(!iPitch);
      if (iPitch) {
        hud.setRole('✏️ 내가 던질 차례!', 'pitch');
        const id = p.pitchId;
        drawPad.start({
          clockEndsAt: p.clockEndsAt || performance.now() + 15000,
          color: TEAM_COLORS[me],
          onThrow: (stroke) => {
            hud.setRole('');
            source.submitStroke(stroke);
            // 온라인이어도 내 화면에선 떼는 순간 바로 출발
            if (source.kind === 'online' && !cur) {
              const clean = sanitizeStroke(stroke);
              if (clean.ok) onPitchStart({ pitchId: id, stroke: clean.stroke, startNow: performance.now(), own: true });
            }
          },
        });
      } else {
        hud.setRole(source.kind === 'local' ? '🤖 AI가 마구를 그리는 중…' : `✏️ ${teamName(opp())} 님이 그리는 중…`, 'wait');
      }
    } else if (p.phase === 'final') {
      game = p.game;
      hud.setGame(game);
      drawPad.stop();
      batInput.disarm();
      later(() => showFinal(p.forfeit), p.forfeit ? 300 : 1900);
    }
  }

  function onPitchStart(ps) {
    if (!game) return;
    if (cur && cur.pitchId === ps.pitchId) return; // 내가 던진 공은 이미 출발함
    drawPad.stop(false);
    const path = buildPath(ps.stroke);
    const iAmBatter = battingTeam(game) === me;
    cur = { pitchId: ps.pitchId, path, startNow: ps.startNow, stroke: ps.stroke, iAmBatter, swung: false, tookSent: false, hit: false, caught: false, contactPending: false, cracked: false, hbpT: findHbp(path, Infinity), hbpFrozen: false };
    const info = describePitch(ps.stroke).pitch;
    const style = info.craziness >= 0.6 ? 'rainbow' : info.kmh >= 140 ? 'fire' : null;
    players.playWindup(WINDUP_MS, ps.startNow - WINDUP_MS * RELEASE_AT);
    ball.playPitch(path, ps.startNow, TEAM_COLORS[fieldingTeam(game)], style);
    const now = performance.now();
    later(() => audio.play('whoosh'), ps.startNow - now);
    hud.showPitch(null);
    if (fieldingTeam(game) === me) {
      drawPad.replay(ps.stroke, ps.startNow, path.T);
      hud.setRole('');
    }
    if (iAmBatter) {
      hud.setRole('🏏 공이 오면 터치!', 'bat');
      const mine = cur;
      batInput.arm({
        startNow: ps.startNow,
        onSwing: (s) => {
          if (cur !== mine || mine.swung) return;
          mine.swung = true;
          hud.setRole('');
          effects.zoneRing(false);
          players.playSwing(performance.now());
          audio.play('swing');
          const pred = evalHumanSwing(mine.path, { type: 'human', t: s.t, ray: s.ray });
          if (pred.hit) {
            mine.contactPending = true;
            mine.cracked = true;
            ball.stopAt(s.t);
            const pos = mine.path.positionAt(s.t);
            audio.play('crack');
            effects.sparks(pos);
          }
          source.submitSwing({ t: s.t, ray: s.ray });
        },
      });
    } else if (source.kind === 'online') {
      hud.setRole('');
    }
  }

  function onResult(r) {
    const prevGame = game;
    game = r.game;
    if (!cur || cur.pitchId !== r.pitchId || !r.pitch || !r.pitch.T) {
      // 폭투(시간 초과·잘못된 선) 등 비행 없는 결과
      drawPad.stop();
      hud.showPitch(r.pitch && r.pitch.T ? r.pitch : { name: '시간 초과 · 볼', kmh: 0, craziness: 0 });
      showOutcome(r, prevGame);
      return;
    }
    const c = cur;
    const now = performance.now();
    const tNow = now - c.startNow;
    batInput.disarm();
    // 상대/AI 타자 스윙 애니메이션
    if (r.swingT != null && !c.iAmBatter) later(() => { players.playSwing(performance.now()); audio.play('swing'); }, r.swingT - 30 - tNow);
    if (r.outcome === 'HBP') {
      later(() => {
        hbpImpact(c);
        c.hit = true;
        if (r.flight) ball.playHit(r.flight, c.path.positionAt(r.hbpT), performance.now());
        hud.showPitch(r.pitch);
        later(() => showOutcome(r, prevGame), 450);
      }, (r.hbpT ?? 0) - tNow);
    } else if (r.flight) {
      later(() => doContact(r, prevGame), r.swingT - tNow);
    } else {
      if (c.contactPending) { c.contactPending = false; ball.stopAt(Infinity); }
      const arrive = Math.max(r.swingT != null ? r.swingT + 120 : 0, c.path.catchMs + 60);
      later(() => { hud.showPitch(r.pitch); showOutcome(r, prevGame); }, arrive - tNow);
    }
  }

  function doContact(r, prevGame) {
    const c = cur;
    if (!c) return;
    const pos = c.path.positionAt(r.swingT);
    c.hit = true;
    c.contactPending = false;
    ball.stopAt(r.swingT);
    effects.zoneRing(false);
    if (!c.cracked) { audio.play('crack'); effects.sparks(pos); }
    drawPad.fadeShown(performance.now());
    hud.showPitch(r.pitch);
    const { landing, landMs } = ball.playHit(r.flight, pos, performance.now());
    if (r.outcome === 'HR') { stage.shake(1.1); later(() => players.batFlip(), 350); }
    else if (['2B', '3B'].includes(r.outcome)) stage.shake(0.45);
    const isFoul = r.outcome === 'FOUL';
    if (!isFoul) {
      stage.followTarget(ball.mesh);
      players.setGhosts('follow');
      players.runFielderTo(landing, landMs);
      const runs = r.events.filter((e) => e.type === 'run').reduce((a, e) => a + e.runs, 0);
      later(() => players.animateRunners(prevGame.bases, r.game.bases, runs), 250);
      field.cheer(r.outcome === 'HR' ? 1.4 : ['1B', '2B', '3B'].includes(r.outcome) ? 0.9 : 0.4);
      if (['1B', '2B', '3B', 'HR'].includes(r.outcome)) audio.play('cheer');
    }
    if (r.outcome === 'HR') later(() => { effects.fireworks(landing); audio.play('homerun'); }, landMs * 0.85);
    const showAt = isFoul ? 700 : r.outcome === 'HR' ? landMs * 0.8 : ['GO', 'FO'].includes(r.outcome) ? landMs + 150 : landMs * 0.7;
    later(() => showOutcome(r, prevGame), showAt);
  }

  function outcomeText(r) {
    const ev = (t) => r.events.find((e) => e.type === t);
    const runs = r.events.filter((e) => e.type === 'run').reduce((a, e) => a + e.runs, 0);
    const go = ev('gameOver');
    if (go && go.walkOff) return { text: '끝내기!!', kind: 'big gold' };
    if (ev('hbp')) return { text: runs ? '몸에 맞는 공! 😵 +' + runs + '점' : '몸에 맞는 공! 😵', kind: 'big red' };
    if (ev('strikeout')) return { text: r.outcome === 'MISS' ? '헛스윙 삼진!' : '삼진!', kind: 'big red' };
    if (ev('walk')) return { text: runs ? '밀어내기 볼넷!' : '볼넷', kind: 'blue' };
    if (ev('doublePlay')) return { text: '병살!', kind: 'red' };
    if (ev('sacFly')) return { text: '희생플라이', kind: 'blue' };
    if (r.outcome === 'HR') return { text: runs >= 4 ? '만루 홈런!!!!' : '홈런!!!', kind: 'big gold' };
    const base = OUTCOME_LABEL[r.outcome] || r.outcome;
    const kind = ['1B', '2B', '3B'].includes(r.outcome) ? 'gold' : ['GO', 'FO'].includes(r.outcome) ? 'red' : r.outcome === 'TAKE_STRIKE' || r.outcome === 'MISS' ? 'red' : '';
    return { text: base + (runs ? `  +${runs}점` : ''), kind };
  }

  function showOutcome(r, prevGame) {
    const { text, kind } = outcomeText(r);
    banner.show(text, kind, 1700);
    const o = r.outcome;
    if (r.events.some((e) => e.type === 'strikeout')) { audio.play('strikeout'); if (battingTeam(prevGame) === me) audio.play('boo'); }
    else if (o === 'TAKE_STRIKE' || o === 'MISS') audio.play('strike');
    else if (o === 'TAKE_BALL' || o === 'BALL_AUTO') audio.play('ball');
    hud.setGame(r.game);
    if (!['1B', '2B', '3B', 'HR', 'GO', 'FO'].includes(o)) players.showBases(r.game.bases);
    const runsNow = r.events.filter((e) => e.type === 'run').reduce((a, e) => a + e.runs, 0);
    if (r.events.some((e) => e.type === 'hbp')) later(() => players.animateRunners(prevGame.bases, r.game.bases, runsNow), 1500);
    if (r.events.some((e) => e.type === 'strikeout')) { players.celebrate(); players.stomp(); stage.shake(0.25); }
    trackStreaks(r, prevGame);
    if (r.events.some((e) => e.type === 'walk')) players.animateRunners(prevGame.bases, r.game.bases, r.events.filter((e) => e.type === 'run').reduce((a, e) => a + e.runs, 0));
    const half = r.events.find((e) => e.type === 'halfOver');
    if (half) {
      later(() => {
        stage.followTarget(null);
        stage.setView('overview');
        players.setGhosts('overview');
        banner.show(`공수교대 · ${r.game.inning}회${r.game.half === 'top' ? '초' : '말'}`, 'half', 1900);
        hud.setRole(battingTeam(r.game) === me ? '다음은 내 공격! 🏏' : '다음은 내 수비! ✏️', 'wait');
      }, 1800);
    }
  }

  function trackStreaks(r, prevGame) {
    const pa = r.events.find((e) => ['strikeout', 'walk', 'hbp', 'hit', 'homeRun', 'out', 'doublePlay'].includes(e.type));
    if (!pa) return;
    const fld = fieldingTeam(prevGame), bat = battingTeam(prevGame);
    if (pa.type === 'strikeout') streak.k[fld]++; else streak.k[fld] = 0;
    if (pa.type === 'hit' || pa.type === 'homeRun') streak.h[bat]++; else streak.h[bat] = 0;
    const who = (t) => (t === me ? '내' : teamName(t) + '의');
    if (streak.k[fld] >= 2) later(() => toast('🔥 ' + who(fld) + ' ' + streak.k[fld] + '연속 삼진!', 2200), 900);
    else if (streak.h[bat] >= 2) later(() => toast('💥 ' + who(bat) + ' ' + streak.h[bat] + '연속 안타!', 2200), 900);
  }

  function showFinal(forfeit) {
    cur = null;
    stage.followTarget(null);
    stage.setView('overview');
    players.setGhosts('overview');
    hud.show(false);
    hud.setRole('');
    const win = game.winner === me;
    audio.play(game.winner === 'tie' ? 'pop' : win ? 'win' : 'lose');
    if (win) effects.fireworks({ x: 0, y: 0, z: -60 });
    resultUi = screens.result({
      game, names, me, online: source.kind === 'online', forfeit,
      onRematch: () => {
        source.rematch();
        if (source.kind === 'local') { screens.clear(); resultUi = null; hud.show(true); }
      },
      onLobby: () => finish(),
    });
  }

  function finish() {
    if (!source) return;
    clearTimers();
    listeners.forEach(([ev, fn]) => source.removeEventListener(ev, fn));
    listeners = [];
    source.leave();
    source = null;
    cur = null;
    game = null;
    resultUi = null;
    drawPad.stop();
    batInput.disarm();
    effects.zoneRing(false);
    effects.zoneFrame(false);
    ball.clear();
    banner.hide();
    hud.show(false);
    stage.followTarget(null);
    stage.setView('lobby');
    players.setGhosts('lobby');
    players.resetField();
    players.showBases([false, false, false]);
    players.showBatter(true);
    screens.clear();
    const f = finishRun; finishRun = null;
    f?.('lobby');
  }

  return {
    run(src, { names: nm, firstPhase } = {}) {
      source = src;
      me = src.me;
      streak.k = { home: 0, away: 0 }; streak.h = { home: 0, away: 0 };
      names = nm || names;
      screens.clear();
      hud.setNames(names, me);
      hud.setOnline(src.kind === 'online');
      hud.show(true);
      hud.showPitch(null);
      hud.setRole('');
      const on = (ev, fn) => { src.addEventListener(ev, fn); listeners.push([ev, fn]); };
      on('phase', (e) => onPhase(e.detail));
      on('pitchStart', (e) => onPitchStart(e.detail));
      on('result', (e) => onResult(e.detail));
      on('emote', (e) => { hud.showEmote(e.detail.team, e.detail.id); audio.play('pop'); });
      on('error', (e) => toast(e.detail));
      on('closed', (e) => { toast(e.detail.reason || '방이 닫혔어요'); finish(); });
      on('rematchVotes', (e) => {
        if (resultUi && e.detail.teams.includes(opp()) && !e.detail.teams.includes(me)) resultUi.setVotes(`${teamName(opp())} 님이 재대결을 원해요! 🔥`);
      });
      on('room', (e) => {
        const s = e.detail;
        for (const p of s.players) names[p.team] = p.name;
        hud.setNames(names, me);
        const o = s.players.find((p) => p.team === opp());
        if (o && !o.connected) toast(`${o.name} 님 연결이 끊겼어요. 잠시 기다려요…`, 4000);
      });
      on('net', (e) => {
        if (e.detail === 'disconnected') toast('연결이 끊겼어요. 다시 연결하는 중…', 4000);
        else if (e.detail === 'connected' && source) toast('다시 연결됐어요!');
        else if (String(e.detail).startsWith('rejoinFailed')) { toast('방에 다시 들어가지 못했어요'); finish(); }
      });
      stage.setView('batter', { instant: false });
      return new Promise((resolve) => {
        finishRun = resolve;
        if (firstPhase) onPhase(firstPhase);
        src.start();
      });
    },
    menu() {
      if (!source) return;
      screens.confirm({ text: '경기를 그만두고 로비로 갈까요?', yes: '나가기', no: '계속하기', onYes: () => finish() });
    },
    emote(id) { if (source) { source.sendEmote(id); } },
    get active() { return !!source; },
  };
}
