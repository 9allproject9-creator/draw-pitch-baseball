import { createStage } from './scene/stage.js';
import { buildField } from './scene/field.js';
import { createPlayers } from './scene/players.js';
import { createBall } from './scene/ball.js';
import { createEffects } from './scene/effects.js';
import { createOverlay, createDrawPad, createBatInput } from './input/drawPad.js';
import { createHud, createBanner, createToast } from './ui/hud.js';
import { createScreens, DIFF_LABEL } from './ui/screens.js';
import { createGameController } from './game/controller.js';
import { createLocalMatch } from './game/localMatch.js';
import { createOnlineMatch } from './game/onlineMatch.js';
import { audio } from './audio.js';

// 핀치 확대·더블탭 확대 막기 (iOS 사파리)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

const stage = createStage(document.getElementById('stage'));
const field = buildField(stage.scene);
const players = createPlayers(stage.scene);
const ball = createBall(stage.scene);
const effects = createEffects(stage.scene);
const overlay = createOverlay(stage, document.getElementById('overlay'));
const drawPad = createDrawPad(stage, overlay);
const batInput = createBatInput(stage, overlay);
drawPad.onTick(() => audio.play('tick'));
const screens = createScreens(document.getElementById('screens'));
const banner = createBanner(document.getElementById('banner'));
const toast = createToast(document.getElementById('toast'));
let controller = null;
const hud = createHud(document.getElementById('hud'), {
  onEmote: (id) => controller?.emote(id),
  onMenu: () => controller?.menu(),
});
controller = createGameController({ stage, field, players, ball, effects, hud, banner, toast, drawPad, batInput, audio, screens });

stage.onFrame((dt, now) => {
  field.update(dt, now);
  players.update(dt, now);
  ball.update(now, stage.camera);
  effects.update(dt, now);
});
stage.start();
players.setGhosts('lobby');

// 로비 배경: 천천히 도는 카메라 대신 가끔 연습 투구
let lobbyDemo = null;
function startLobbyDemo() {
  stopLobbyDemo();
  const tick = () => {
    if (controller.active) return;
    players.playWindup(900);
    lobbyDemo = setTimeout(tick, 4200);
  };
  lobbyDemo = setTimeout(tick, 800);
}
function stopLobbyDemo() { clearTimeout(lobbyDemo); }

// ───────── 온라인 ─────────
let netPromise = null;
async function getNet() {
  if (!netPromise) netPromise = import('./net.js').then((m) => m.createNet());
  const net = await netPromise;
  if (!net.connected) {
    const slow = setTimeout(() => screens.connecting('서버 깨우는 중… (처음엔 최대 1분 걸려요)'), 1500);
    screens.connecting();
    try { await net.connect(); } finally { clearTimeout(slow); }
  }
  return net;
}

function rememberRoom(code) { try { code ? localStorage.setItem('gd.lastRoom', JSON.stringify({ code, at: Date.now() })) : localStorage.removeItem('gd.lastRoom'); } catch { /* 무시 */ } }

// 방에 들어간 뒤: 대기실 표시 → 경기 시작되면 컨트롤러로
async function enterRoom(net, code, me) {
  net.setRoom(code);
  rememberRoom(code);
  const names = { home: '홈', away: '원정' };
  let source = createOnlineMatch(net, { me, names });
  let inGame = false;
  let lastState = null;

  const leaveRoom = () => {
    source.leave();
    rememberRoom(null);
    showLobby();
  };
  const renderRoom = (s) => {
    lastState = s;
    source.me = s.you;
    for (const p of s.players) names[p.team] = p.name;
    if (inGame) return;
    screens.room({
      state: s,
      onStart: async (innings) => {
        const r = await net.call('game:start', { innings });
        if (!r.ok) toast(r.error);
      },
      onLeave: leaveRoom,
    });
  };
  const onRoom = (e) => renderRoom(e.detail);
  const onPhase = async (e) => {
    if (inGame) return;
    if (e.detail.phase === 'final' && !lastState) return;
    inGame = true;
    source.removeEventListener('room', onRoom);
    source.removeEventListener('phase', onPhase);
    source.removeEventListener('closed', onClosed);
    await controller.run(source, { names, firstPhase: e.detail });
    rememberRoom(null);
    showLobby();
  };
  const onClosed = (e) => { toast(e.detail.reason || '방이 닫혔어요'); source.leave(); rememberRoom(null); showLobby(); };
  source.addEventListener('room', onRoom);
  source.addEventListener('phase', onPhase);
  source.addEventListener('closed', onClosed);
  return source;
}

async function createRoom(name) {
  let net;
  try { net = await getNet(); } catch { showFriend(); return '서버에 연결할 수 없어요. 잠시 후 다시 해 주세요'; }
  const r = await net.call('room:create', { name, sessionId: net.sessionId });
  if (!r.ok) { showFriend(); return r.error; }
  screens.connecting('방 만드는 중…');
  await enterRoom(net, r.code, 'home');
  // room:state 는 enterRoom 구독 직후 다시 요청
  await net.call('room:rejoin', { code: r.code, sessionId: net.sessionId });
  return null;
}

async function joinRoom(name, code) {
  code = String(code || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(code)) return '코드 4자리를 입력해 주세요';
  let net;
  try { net = await getNet(); } catch { return '서버에 연결할 수 없어요. 잠시 후 다시 해 주세요'; }
  const src = await enterRoom(net, code, 'away');
  const r = await net.call('room:join', { code, name, sessionId: net.sessionId });
  if (!r.ok) { src.leave(); rememberRoom(null); showFriend(code); return r.error; }
  return null;
}

async function tryResume() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem('gd.lastRoom') || 'null'); } catch { /* 무시 */ }
  if (!last || Date.now() - last.at > 3 * 60 * 1000) return false;
  try {
    const net = await getNet();
    const src = await enterRoom(net, last.code, 'away');
    const r = await net.call('room:rejoin', { code: last.code, sessionId: net.sessionId });
    if (!r.ok) { src.leave(); rememberRoom(null); return false; }
    src.me = r.team;
    return true;
  } catch { return false; }
}

// ───────── 화면 흐름 ─────────
let myName = '선수';
function showLobby() {
  history.replaceState(null, '', location.pathname);
  stage.setView('lobby');
  hud.show(false);
  startLobbyDemo();
  screens.lobby({
    onAi: (name) => { myName = name; showAiSetup(); },
    onFriend: (name) => { myName = name; showFriend(); },
    onHowTo: () => screens.howTo({ onBack: showLobby }),
  });
}

function showAiSetup() {
  screens.aiSetup({
    onBack: showLobby,
    onStart: async (cfg) => {
      stopLobbyDemo();
      const myTeam = cfg.side;
      const names = { [myTeam]: myName, [myTeam === 'home' ? 'away' : 'home']: `AI (${DIFF_LABEL[cfg.difficulty]})` };
      const src = createLocalMatch({ innings: cfg.innings, difficulty: cfg.difficulty, myTeam, names });
      await controller.run(src, { names });
      showLobby();
    },
  });
}

function showFriend(preset = '') {
  screens.friendMenu({
    presetCode: preset,
    onBack: showLobby,
    onCreate: () => createRoom(myName),
    onJoin: (code) => joinRoom(myName, code),
  });
}

// 시작
const params = new URLSearchParams(location.search);
const inviteCode = (params.get('room') || '').toUpperCase();
(async () => {
  if (inviteCode) {
    stopLobbyDemo();
    screens.nameOnly({
      code: inviteCode,
      onJoin: async (name) => { myName = name; return joinRoom(name, inviteCode); },
      onBack: showLobby,
    });
    return;
  }
  if (await tryResume()) return;
  showLobby();
})();

window.__game = { stage, players, ball, effects, controller };
