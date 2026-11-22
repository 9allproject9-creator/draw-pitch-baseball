// 온라인 매치 소스: 서버 이벤트를 로컬 시간 기준 이벤트로 바꿔 전달
export function createOnlineMatch(net, { me, names }) {
  const et = new EventTarget();
  const emit = (type, detail) => et.dispatchEvent(new CustomEvent(type, { detail }));
  let pitchId = 0;
  const offs = [];
  const on = (ev, fn) => offs.push(net.on(ev, fn));

  on('game:phase', (p) => {
    pitchId = p.pitchId;
    emit('phase', { ...p, clockEndsAt: p.clockEndsAt ? net.toLocal(p.clockEndsAt) : undefined });
  });
  on('pitch:start', (p) => { pitchId = p.pitchId; emit('pitchStart', { pitchId: p.pitchId, stroke: p.stroke, startNow: net.toLocal(p.startAt) }); });
  on('pitch:result', (r) => emit('result', r));
  on('emote', (e) => emit('emote', e));
  on('room:state', (s) => emit('room', s));
  on('room:closed', (c) => emit('closed', c));
  on('game:rematchVotes', (v) => emit('rematchVotes', v));
  offs.push(net.onStatus((s) => emit('net', s)));

  const toast = (r) => { if (r && !r.ok && r.error) emit('error', r.error); };

  return {
    kind: 'online',
    me,
    names,
    addEventListener: et.addEventListener.bind(et),
    removeEventListener: et.removeEventListener.bind(et),
    start() {},
    submitStroke(stroke) { net.call('pitch:stroke', { pitchId, stroke }).then(toast); },
    submitSwing({ t, ray }) { net.call('pitch:swing', { pitchId, t, ray }).then(toast); },
    submitTake() { net.call('pitch:take', { pitchId }); },
    sendEmote(id) { net.call('emote', { id }); },
    rematch() { net.call('game:rematch').then(toast); },
    leave() {
      offs.forEach((f) => f());
      net.call('room:leave');
      net.setRoom(null);
    },
  };
}
