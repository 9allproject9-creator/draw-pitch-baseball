import { EXTRA_INNINGS_MAX } from './constants.js';

const emptyStats = () => ({ runs: 0, hits: 0, strikeouts: 0, walks: 0, maxKmh: 0, craziest: null });

export function createGame({ innings = 3 } = {}) {
  return {
    innings, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
    bases: [false, false, false],
    score: { away: 0, home: 0 },
    lines: { away: [], home: [] },
    stats: { away: emptyStats(), home: emptyStats() },
    status: 'playing', winner: null, pitchNo: 0,
  };
}

export const battingTeam = (g) => (g.half === 'top' ? 'away' : 'home');
export const fieldingTeam = (g) => (g.half === 'top' ? 'home' : 'away');

function clone(g) {
  return {
    ...g,
    bases: [...g.bases],
    score: { ...g.score },
    lines: { away: [...g.lines.away], home: [...g.lines.home] },
    stats: {
      away: { ...g.stats.away, craziest: g.stats.away.craziest && { ...g.stats.away.craziest } },
      home: { ...g.stats.home, craziest: g.stats.home.craziest && { ...g.stats.home.craziest } },
    },
  };
}

export const OUTCOME_LABEL = {
  TAKE_STRIKE: '스트라이크!', MISS: '헛스윙!', TAKE_BALL: '볼', BALL_AUTO: '볼', FOUL: '파울',
  GO: '땅볼 아웃', FO: '뜬공 아웃', HBP: '몸에 맞는 공!', '1B': '안타!', '2B': '2루타!', '3B': '3루타!!', HR: '홈런!!!',
};

export function applyOutcome(game, outcome, rng, pitchInfo) {
  const g = clone(game);
  const events = [];
  const bat = battingTeam(g);
  const fld = fieldingTeam(g);
  g.pitchNo += 1;

  if (pitchInfo) {
    const st = g.stats[fld];
    if (pitchInfo.kmh > st.maxKmh) st.maxKmh = pitchInfo.kmh;
    if (pitchInfo.name && (!st.craziest || pitchInfo.craziness > st.craziest.craziness)) {
      st.craziest = { name: pitchInfo.name, craziness: pitchInfo.craziness };
    }
  }

  const resetCount = () => { g.balls = 0; g.strikes = 0; };
  const score = (n) => {
    if (n <= 0) return;
    g.score[bat] += n;
    g.stats[bat].runs += n;
    events.push({ type: 'run', runs: n, team: bat });
  };
  const addOut = (n = 1) => { g.outs += n; };

  // 주자 진루: 모든 주자(타자 포함 여부 선택) n 베이스
  const advanceAll = (n, batterTo) => {
    let runs = 0;
    const nb = [false, false, false];
    for (let i = 2; i >= 0; i--) {
      if (!g.bases[i]) continue;
      const to = i + n;
      if (to >= 3) runs++; else nb[to] = true;
    }
    if (batterTo != null) {
      if (batterTo >= 3) runs++; else nb[batterTo] = true;
    }
    g.bases = nb;
    return runs;
  };
  const walk = () => {
    let runs = 0;
    const b = g.bases;
    if (b[0]) {
      if (b[1]) {
        if (b[2]) runs = 1;
        b[2] = true;
      }
      b[1] = true;
    }
    b[0] = true;
    return runs;
  };

  switch (outcome) {
    case 'TAKE_STRIKE':
    case 'MISS':
      g.strikes += 1;
      if (g.strikes >= 3) {
        resetCount(); addOut();
        g.stats[fld].strikeouts += 1;
        events.push({ type: 'strikeout', team: bat });
      } else events.push({ type: 'strike' });
      break;
    case 'FOUL':
      if (g.strikes < 2) g.strikes += 1;
      events.push({ type: 'foul' });
      break;
    case 'TAKE_BALL':
    case 'BALL_AUTO':
      g.balls += 1;
      if (g.balls >= 4) {
        resetCount();
        g.stats[bat].walks += 1;
        events.push({ type: 'walk', team: bat });
        score(walk());
      } else events.push({ type: 'ball' });
      break;
    case 'HBP':
      resetCount();
      events.push({ type: 'hbp', team: bat });
      score(walk());
      break;
    case 'GO': {
      resetCount();
      if (g.bases[0] && g.outs < 2 && rng() < 0.4) {
        addOut(2);
        g.bases[0] = false;
        events.push({ type: 'doublePlay', team: bat });
        if (g.outs < 3) {
          // 나머지 주자 한 베이스씩
          const runs = advanceAll(1, null);
          score(runs);
        }
      } else {
        addOut();
        events.push({ type: 'out', kind: 'GO', team: bat });
        if (g.outs < 3) score(advanceAll(1, null));
      }
      break;
    }
    case 'FO': {
      resetCount();
      const sac = g.bases[2] && g.outs < 2;
      addOut();
      events.push({ type: 'out', kind: 'FO', team: bat });
      if (sac) {
        g.bases[2] = false;
        events.push({ type: 'sacFly', team: bat });
        score(1);
      }
      break;
    }
    case '1B': case '2B': case '3B': {
      resetCount();
      const n = { '1B': 1, '2B': 2, '3B': 3 }[outcome];
      g.stats[bat].hits += 1;
      events.push({ type: 'hit', bases: n, team: bat });
      score(advanceAll(n, n - 1));
      break;
    }
    case 'HR': {
      resetCount();
      g.stats[bat].hits += 1;
      const runs = advanceAll(4, 3);
      events.push({ type: 'homeRun', runs, team: bat });
      score(runs);
      break;
    }
    default:
      throw new Error('unknown outcome ' + outcome);
  }

  // 끝내기: 마지막 이닝 이후 말 공격에서 홈팀이 앞서면 즉시 종료
  if (g.half === 'bottom' && g.inning >= g.innings && g.score.home > g.score.away) {
    finishHalf(g, events, true);
    return { game: g, events };
  }

  if (g.outs >= 3) finishHalf(g, events, false);
  return { game: g, events };
}

function inningRuns(g, team) {
  const prev = g.lines[team].reduce((a, b) => a + b, 0);
  return g.score[team] - prev;
}

function finishHalf(g, events, walkOff) {
  const bat = battingTeam(g);
  g.lines[bat].push(inningRuns(g, bat));
  const maxInnings = g.innings + EXTRA_INNINGS_MAX;

  const end = (winner) => {
    g.status = 'final';
    g.winner = winner;
    if (g.half === 'top') g.lines.home.push(null); // 말 공격 없음 표시
    events.push({ type: 'gameOver', winner, walkOff: !!walkOff });
  };

  if (walkOff) { end('home'); return; }

  if (g.half === 'top') {
    if (g.inning >= g.innings && g.score.home > g.score.away) { end('home'); return; }
    events.push({ type: 'halfOver', inning: g.inning, half: 'top' });
    g.half = 'bottom';
  } else {
    if (g.inning >= g.innings && g.score.home !== g.score.away) {
      end(g.score.home > g.score.away ? 'home' : 'away');
      return;
    }
    if (g.inning >= maxInnings) { end('tie'); return; }
    events.push({ type: 'halfOver', inning: g.inning, half: 'bottom' });
    g.half = 'top';
    g.inning += 1;
  }
  g.outs = 0; g.balls = 0; g.strikes = 0;
  g.bases = [false, false, false];
}
