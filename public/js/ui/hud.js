const EMOJI = { lol: 'ㅋㅋ', shock: '😱', clap: '👏', angry: '😡', fire: '🔥' };
export { EMOJI };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createHud(root, { onEmote, onMenu }) {
  root.innerHTML = `
    <div class="hud-top">
      <div class="scoreboard">
        <div class="team away"><span class="tname"></span><b class="tscore">0</b></div>
        <div class="inning"><span class="arrow">▲</span><span class="inum">1</span></div>
        <div class="team home"><b class="tscore">0</b><span class="tname"></span></div>
      </div>
      <button class="menu-btn" aria-label="메뉴">☰</button>
    </div>
    <div class="hud-left">
      <div class="count">
        <div class="row"><span>B</span><i></i><i></i><i></i></div>
        <div class="row"><span>S</span><i></i><i></i></div>
        <div class="row"><span>O</span><i></i><i></i></div>
      </div>
      <div class="bases"><i class="b2"></i><i class="b3"></i><i class="b1"></i></div>
    </div>
    <div class="role-badge"></div>
    <div class="pitch-card" hidden>
      <div class="pname"></div>
      <div class="pmeta"><span class="kmh"></span><span class="crazy"></span></div>
      <div class="crazy-bar"><i></i></div>
    </div>
    <div class="emote-bar" hidden>
      ${Object.entries(EMOJI).map(([k, v]) => `<button data-emote="${k}">${v}</button>`).join('')}
    </div>
    <div class="emote-layer"></div>
  `;
  const $ = (s) => root.querySelector(s);
  $('.menu-btn').addEventListener('click', () => onMenu?.());
  root.querySelectorAll('[data-emote]').forEach((b) => b.addEventListener('click', () => onEmote?.(b.dataset.emote)));

  let me = 'away';

  function setNames(names, meTeam) {
    me = meTeam;
    $('.team.away .tname').textContent = names.away + (meTeam === 'away' ? ' (나)' : '');
    $('.team.home .tname').textContent = names.home + (meTeam === 'home' ? ' (나)' : '');
    root.classList.toggle('me-home', meTeam === 'home');
  }

  function setGame(g) {
    $('.team.away .tscore').textContent = g.score.away;
    $('.team.home .tscore').textContent = g.score.home;
    $('.inning .arrow').textContent = g.half === 'top' ? '▲' : '▼';
    $('.inning .inum').textContent = g.inning;
    const rows = root.querySelectorAll('.count .row');
    const fill = (row, n, cls) => row.querySelectorAll('i').forEach((el, i) => el.className = i < n ? cls : '');
    fill(rows[0], g.balls, 'on-b'); fill(rows[1], g.strikes, 'on-s'); fill(rows[2], g.outs, 'on-o');
    $('.bases .b1').classList.toggle('on', g.bases[0]);
    $('.bases .b2').classList.toggle('on', g.bases[1]);
    $('.bases .b3').classList.toggle('on', g.bases[2]);
  }

  function setRole(text, kind) {
    const el = $('.role-badge');
    el.textContent = text || '';
    el.className = 'role-badge' + (kind ? ' ' + kind : '');
    el.hidden = !text;
  }

  function showPitch(p) {
    const card = $('.pitch-card');
    if (!p) { card.hidden = true; return; }
    card.hidden = false;
    $('.pname').textContent = p.name;
    $('.kmh').textContent = p.kmh ? `${p.kmh} km/h` : '';
    const c = Math.round((p.craziness || 0) * 100);
    $('.crazy').textContent = `변화 ${c}`;
    $('.crazy-bar i').style.width = c + '%';
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
  }

  function showEmote(team, id) {
    const el = document.createElement('div');
    el.className = 'emote-float ' + (team === me ? 'mine' : 'theirs');
    el.textContent = EMOJI[id] || '❓';
    $('.emote-layer').appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  return {
    show(on) { root.hidden = !on; },
    setNames, setGame, setRole, showPitch, showEmote,
    setOnline(on) { $('.emote-bar').hidden = !on; },
  };
}

export function createBanner(el) {
  let t = null;
  return {
    show(text, kind = '', ms = 1600) {
      clearTimeout(t);
      el.innerHTML = `<div class="banner-text ${kind}">${esc(text)}</div>`;
      el.classList.add('show');
      t = setTimeout(() => el.classList.remove('show'), ms);
    },
    hide() { clearTimeout(t); el.classList.remove('show'); },
  };
}

export function createToast(el) {
  let t = null;
  return (text, ms = 2600) => {
    clearTimeout(t);
    el.textContent = text;
    el.classList.add('show');
    t = setTimeout(() => el.classList.remove('show'), ms);
  };
}

export { esc };
