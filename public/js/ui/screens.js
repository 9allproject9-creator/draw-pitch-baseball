import { esc } from './hud.js';
import { INNING_OPTIONS } from '/shared/constants.js';
import { audio } from '../audio.js';

const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };
export { DIFF_LABEL };

function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch { return null; } return null; }

export function createScreens(root) {
  let current = null;
  const mount = (html, cls) => {
    root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    current = root.firstElementChild;
    current.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => audio.play('click')));
    return current;
  };
  const clear = () => { root.innerHTML = ''; current = null; };

  const logo = `
    <div class="logo">
      <svg viewBox="0 0 320 70" aria-hidden="true"><path d="M8 52 C 40 10, 70 70, 100 30 S 150 10, 170 45 S 230 60, 250 20 S 300 30, 312 18" fill="none" stroke="#ffd23f" stroke-width="6" stroke-linecap="round" stroke-dasharray="6 10"/></svg>
      <h1>그려던져!</h1>
      <p>선을 그리면, 그대로 날아간다</p>
    </div>`;

  function seg(name, options, value, labels = {}) {
    return `<div class="seg" data-seg="${name}">${options.map((o) => `<button type="button" data-v="${o}" class="${String(o) === String(value) ? 'on' : ''}">${labels[o] ?? o}</button>`).join('')}</div>`;
  }
  function wireSeg(el, onChange) {
    el.querySelectorAll('.seg').forEach((s) => s.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      onChange?.(s.dataset.seg, b.dataset.v);
    }));
  }
  const segVal = (el, name) => el.querySelector(`.seg[data-seg="${name}"] .on`)?.dataset.v;

  return {
    clear,
    lobby({ onAi, onFriend, onHowTo }) {
      const name = store('gd.name') || '';
      const el = mount(`
        ${logo}
        <label class="field"><span>닉네임</span><input id="nick" maxlength="10" placeholder="이름을 적어 주세요" value="${esc(name)}" autocomplete="off"></label>
        <div class="big-buttons">
          <button class="btn primary" id="ai">🤖 AI 대전</button>
          <button class="btn secondary" id="friend">👫 친구 대전</button>
        </div>
        <button class="link" id="howto">어떻게 해요?</button>
        <label class="sound"><input type="checkbox" id="snd" ${audio.enabled ? 'checked' : ''}> 효과음</label>
      `, 'lobby');
      const nick = el.querySelector('#nick');
      const getName = () => { const n = nick.value.trim().slice(0, 10) || '선수'; store('gd.name', n); return n; };
      el.querySelector('#ai').addEventListener('click', () => onAi(getName()));
      el.querySelector('#friend').addEventListener('click', () => onFriend(getName()));
      el.querySelector('#howto').addEventListener('click', () => onHowTo());
      el.querySelector('#snd').addEventListener('change', (e) => audio.setEnabled(e.target.checked));
    },

    aiSetup({ onStart, onBack }) {
      const saved = JSON.parse(store('gd.ai') || '{}');
      const el = mount(`
        <h2>AI 대전 설정</h2>
        <div class="opt"><span>이닝</span>${seg('innings', INNING_OPTIONS, saved.innings || 3, { 1: '1회', 3: '3회', 5: '5회', 9: '9회' })}</div>
        <div class="opt"><span>난이도</span>${seg('difficulty', ['easy', 'normal', 'hard'], saved.difficulty || 'normal', DIFF_LABEL)}</div>
        <div class="opt"><span>순서</span>${seg('side', ['away', 'home'], saved.side || 'home', { away: '먼저 공격', home: '먼저 수비' })}</div>
        <div class="row-buttons">
          <button class="btn ghost" id="back">← 뒤로</button>
          <button class="btn primary" id="go">플레이 볼! ⚾</button>
        </div>
      `, 'setup');
      wireSeg(el);
      el.querySelector('#back').addEventListener('click', onBack);
      el.querySelector('#go').addEventListener('click', () => {
        const cfg = { innings: Number(segVal(el, 'innings')), difficulty: segVal(el, 'difficulty'), side: segVal(el, 'side') };
        store('gd.ai', JSON.stringify(cfg));
        onStart(cfg);
      });
    },

    friendMenu({ onCreate, onJoin, onBack, presetCode = '' }) {
      const el = mount(`
        <h2>친구 대전</h2>
        <button class="btn primary wide" id="create">🏟️ 방 만들기</button>
        <div class="or"><span>또는</span></div>
        <div class="join">
          <input id="code" maxlength="4" placeholder="코드 4자리" value="${esc(presetCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button class="btn secondary" id="join">참가</button>
        </div>
        <p class="err" id="err"></p>
        <button class="btn ghost" id="back">← 뒤로</button>
      `, 'friend');
      const code = el.querySelector('#code');
      code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      const err = el.querySelector('#err');
      const busy = (on) => el.querySelectorAll('button').forEach((b) => (b.disabled = on));
      el.querySelector('#create').addEventListener('click', async () => { busy(true); err.textContent = ''; const e = await onCreate(); if (e) err.textContent = e; busy(false); });
      const join = async () => { busy(true); err.textContent = ''; const e = await onJoin(code.value); if (e) err.textContent = e; busy(false); };
      el.querySelector('#join').addEventListener('click', join);
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
      el.querySelector('#back').addEventListener('click', onBack);
    },

    room({ state, onStart, onLeave }) {
      const link = `${location.origin}/?room=${state.code}`;
      const isHost = state.you === 'home';
      const p = (t) => state.players.find((x) => x.team === t);
      const card = (t, label) => {
        const pl = p(t);
        return `<div class="pcard ${t} ${pl ? '' : 'empty'}"><small>${label}</small><b>${pl ? esc(pl.name) : '기다리는 중…'}</b>${pl && !pl.connected ? '<em>연결 끊김</em>' : ''}${pl && pl.team === state.you ? '<em class="me">나</em>' : ''}</div>`;
      };
      const ready = state.players.length === 2 && state.players.every((x) => x.connected);
      const el = mount(`
        <h2>대기실</h2>
        <div class="code-box"><small>방 코드</small><b>${state.code}</b></div>
        <div class="share">
          <button class="btn ghost" id="copy">🔗 링크 복사</button>
          ${navigator.share ? '<button class="btn ghost" id="share">📤 공유</button>' : ''}
        </div>
        <div class="pcards">${card('away', '원정 (먼저 공격)')}<span class="vs">VS</span>${card('home', '홈 · 방장')}</div>
        ${isHost ? `<div class="opt"><span>이닝</span>${seg('innings', INNING_OPTIONS, state.innings || 3, { 1: '1회', 3: '3회', 5: '5회', 9: '9회' })}</div>
          <button class="btn primary wide" id="start" ${ready ? '' : 'disabled'}>${ready ? '경기 시작! ⚾' : '친구를 기다리는 중…'}</button>`
          : `<p class="wait">방장이 시작하면 바로 경기해요 ⏳</p>`}
        <button class="btn ghost" id="leave">나가기</button>
      `, 'room');
      wireSeg(el);
      el.querySelector('#copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); el.querySelector('#copy').textContent = '✅ 복사됨!'; }
        catch { prompt('이 링크를 친구에게 보내 주세요', link); }
      });
      el.querySelector('#share')?.addEventListener('click', () => navigator.share({ title: '그려던져! 한 판 붙자', text: `방 코드 ${state.code}`, url: link }).catch(() => {}));
      el.querySelector('#start')?.addEventListener('click', () => onStart(Number(segVal(el, 'innings') || 3)));
      el.querySelector('#leave').addEventListener('click', onLeave);
    },

    nameOnly({ code, onJoin, onBack }) {
      const el = mount(`
        ${logo}
        <p class="invite">친구가 <b>${esc(code)}</b> 방으로 초대했어요!</p>
        <label class="field"><span>닉네임</span><input id="nick" maxlength="10" placeholder="이름을 적어 주세요" value="${esc(store('gd.name') || '')}" autocomplete="off"></label>
        <button class="btn primary wide" id="go">참가하기</button>
        <p class="err" id="err"></p>
        <button class="btn ghost" id="back">로비로</button>
      `, 'lobby');
      el.querySelector('#go').addEventListener('click', async () => {
        const n = el.querySelector('#nick').value.trim().slice(0, 10) || '선수';
        store('gd.name', n);
        el.querySelector('#go').disabled = true;
        const e = await onJoin(n);
        if (e) { el.querySelector('#err').textContent = e; el.querySelector('#go').disabled = false; }
      });
      el.querySelector('#back').addEventListener('click', onBack);
    },

    howTo({ onBack }) {
      const el = mount(`
        <h2>어떻게 해요?</h2>
        <ol class="howto">
          <li><b>✏️ 던질 때</b> — 박스 안에 손가락(마우스)으로 선을 한 번에 그려요. 손을 떼는 순간 공이 <b>그린 모양 그대로, 그린 속도 그대로</b> 날아가요.</li>
          <li><b>🎯 스트라이크</b> — 선이 끝나는 점이 노란 존 안이면 스트라이크, 밖이면 볼!</li>
          <li><b>🌀 마구</b> — 뱅글뱅글, 지그재그로 이상하게 그릴수록 치기 어려워요. 대신 그리는 데 오래 걸리면 공이 느려져요. <b>빠르게 + 이상하게 + 존 안에!</b></li>
          <li><b>🏏 칠 때</b> — 공이 홈 근처에 오면 공을 터치! 위치랑 타이밍이 정확할수록 멀리 날아가요.</li>
          <li><b>⚾ 룰</b> — 진짜 야구랑 같아요. 3스트라이크 삼진, 4볼 볼넷, 3아웃 공수교대.</li>
        </ol>
        <button class="btn primary wide" id="back">알겠어요!</button>
      `, 'howto-screen');
      el.querySelector('#back').addEventListener('click', onBack);
    },

    connecting(text = '서버에 연결하는 중…') {
      mount(`<div class="spinner"></div><p class="wait">${esc(text)}</p>`, 'connecting');
    },

    result({ game, names, me, online, forfeit, onRematch, onLobby }) {
      const win = game.winner;
      const title = win === 'tie' ? '무승부' : win === me ? '승리! 🎉' : '패배…';
      const cls = win === 'tie' ? 'tie' : win === me ? 'win' : 'lose';
      const inn = Math.max(game.lines.away.length, game.lines.home.length);
      const cells = (team) => Array.from({ length: inn }, (_, i) => {
        const v = game.lines[team][i];
        return `<td>${v === null ? 'X' : v === undefined ? '-' : v}</td>`;
      }).join('');
      const st = (t) => game.stats[t];
      const crazy = (t) => (st(t).craziest ? `${esc(st(t).craziest.name)} (${Math.round(st(t).craziest.craziness * 100)})` : '-');
      const el = mount(`
        <h2 class="result-title ${cls}">${title}</h2>
        ${forfeit ? '<p class="wait">상대가 나가서 경기가 끝났어요</p>' : ''}
        <div class="final-score"><span>${esc(names.away)}</span><b>${game.score.away} : ${game.score.home}</b><span>${esc(names.home)}</span></div>
        <div class="table-wrap"><table class="linescore">
          <tr><th></th>${Array.from({ length: inn }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>R</th><th>H</th></tr>
          <tr><th>${esc(names.away)}</th>${cells('away')}<td class="r">${game.score.away}</td><td>${st('away').hits}</td></tr>
          <tr><th>${esc(names.home)}</th>${cells('home')}<td class="r">${game.score.home}</td><td>${st('home').hits}</td></tr>
        </table></div>
        <div class="table-wrap"><table class="stats">
          <tr><th></th><th>${esc(names.away)}</th><th>${esc(names.home)}</th></tr>
          <tr><th>탈삼진</th><td>${st('away').strikeouts}</td><td>${st('home').strikeouts}</td></tr>
          <tr><th>최고 구속</th><td>${st('away').maxKmh || '-'}${st('away').maxKmh ? ' km/h' : ''}</td><td>${st('home').maxKmh || '-'}${st('home').maxKmh ? ' km/h' : ''}</td></tr>
          <tr><th>가장 미친 공</th><td>${crazy('away')}</td><td>${crazy('home')}</td></tr>
        </table></div>
        <div class="row-buttons">
          <button class="btn ghost" id="lobby">로비로</button>
          <button class="btn primary" id="again">${online ? '재대결 신청' : '한 판 더!'}</button>
        </div>
        <p class="wait" id="votes"></p>
      `, 'result ' + cls);
      el.querySelector('#lobby').addEventListener('click', onLobby);
      el.querySelector('#again').addEventListener('click', () => {
        onRematch();
        if (online) { el.querySelector('#again').disabled = true; el.querySelector('#votes').textContent = '상대의 대답을 기다리는 중…'; }
      });
      return {
        setVotes(text) { const v = el.querySelector('#votes'); if (v) v.textContent = text; },
      };
    },

    confirm({ text, yes = '네', no = '아니요', onYes, onNo }) {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `<div class="modal-box"><p>${esc(text)}</p><div class="row-buttons"><button class="btn ghost" data-a="no">${esc(no)}</button><button class="btn primary" data-a="yes">${esc(yes)}</button></div></div>`;
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => {
        const a = e.target.closest('button')?.dataset.a;
        if (!a && e.target !== wrap) return;
        wrap.remove();
        if (a === 'yes') onYes?.(); else onNo?.();
      });
    },
  };
}
