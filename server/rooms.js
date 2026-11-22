import { ServerMatch } from './match.js';
import { INNING_OPTIONS, EMOTES } from '../shared/constants.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_MS = 10 * 60 * 1000;
const RATE_PER_SEC = 20;

const cleanName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '') || '선수';
const cleanSession = (s) => (typeof s === 'string' && s.length >= 2 && s.length <= 80 ? s : null);

export function attachRooms(io, { disconnectGraceMs = 60000, resultScale = 1 } = {}) {
  const rooms = new Map();

  const newCode = () => {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    throw new Error('no codes');
  };

  const status = (room) => {
    if (room.match) return room.match.phase === 'final' ? 'final' : 'playing';
    return room.players.home && room.players.away ? 'ready' : 'waiting';
  };

  const sendRoomState = (room) => {
    const players = ['home', 'away'].filter((t) => room.players[t]).map((t) => {
      const p = room.players[t];
      return { name: p.name, team: t, connected: p.connected, host: t === 'home' };
    });
    for (const t of ['home', 'away']) {
      const p = room.players[t];
      if (p && p.socketId) io.to(p.socketId).emit('room:state', { code: room.code, status: status(room), players, you: t, innings: room.innings });
    }
  };

  const touch = (room) => {
    clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => destroy(room, '방이 오래 비어 있어 닫혔어요'), ROOM_IDLE_MS);
  };

  const destroy = (room, reason) => {
    if (!rooms.has(room.code)) return;
    io.to(room.code).emit('room:closed', { reason });
    room.match?.dispose();
    for (const t of ['home', 'away']) clearTimeout(room.players[t]?.graceTimer);
    clearTimeout(room.idleTimer);
    io.in(room.code).socketsLeave(room.code);
    rooms.delete(room.code);
  };

  const startMatch = (room) => {
    room.match?.dispose();
    room.rematch = new Set();
    room.match = new ServerMatch({
      innings: room.innings,
      seed: `${room.code}-${Date.now()}-${Math.random()}`,
      emit: (ev, payload) => io.to(room.code).emit(ev, payload),
      resultScale,
    });
    sendRoomState(room);
    room.match.start();
  };

  const seat = (socket, room, team, player) => {
    room.players[team] = player;
    player.socketId = socket.id;
    player.connected = true;
    clearTimeout(player.graceTimer);
    socket.data = { code: room.code, team };
    socket.join(room.code);
    touch(room);
  };

  const leaveSeat = (room, team, immediate) => {
    const p = room.players[team];
    if (!p) return;
    const other = team === 'home' ? 'away' : 'home';
    const playing = room.match && room.match.phase !== 'final';
    if (playing) {
      room.match.forfeitTo(other);
      sendRoomState(room);
    }
    if (immediate || !room.match) {
      if (team === 'home') { destroy(room, '방장이 나갔어요'); return; }
      room.players[team] = null;
      if (room.match && room.match.phase === 'final') { room.match.dispose(); room.match = null; }
      sendRoomState(room);
    }
    if (!room.players.home?.connected && !room.players.away?.connected) destroy(room, '모두 나갔어요');
  };

  io.on('connection', (socket) => {
    const hits = new Map();
    const limited = (ev) => {
      const now = Date.now();
      const h = hits.get(ev) || { t: now, n: 0 };
      if (now - h.t > 1000) { h.t = now; h.n = 0; }
      h.n++;
      hits.set(ev, h);
      return h.n > RATE_PER_SEC;
    };
    const on = (ev, fn) => socket.on(ev, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited(ev)) return reply({ ok: false, error: '너무 빨라요' });
      try { fn(payload || {}, reply); } catch (e) { console.error(ev, e); reply({ ok: false, error: '서버 오류' }); }
    });
    const myRoom = () => (socket.data?.code ? rooms.get(socket.data.code) : null);

    on('time:ping', ({ t0 }, reply) => reply({ t0, server: Date.now() }));

    on('room:create', ({ name, sessionId }, reply) => {
      const sid = cleanSession(sessionId);
      if (!sid) return reply({ ok: false, error: '세션 정보가 없어요' });
      if (myRoom()) leaveSeat(myRoom(), socket.data.team, true);
      const room = { code: newCode(), players: { home: null, away: null }, match: null, innings: 3, lastEmote: { home: 0, away: 0 }, rematch: new Set() };
      rooms.set(room.code, room);
      seat(socket, room, 'home', { name: cleanName(name), sessionId: sid });
      reply({ ok: true, code: room.code });
      sendRoomState(room);
    });

    on('room:join', ({ code, name, sessionId }, reply) => {
      const sid = cleanSession(sessionId);
      const room = rooms.get(String(code || '').toUpperCase());
      if (!room) return reply({ ok: false, error: '그런 방이 없어요. 코드를 확인해 주세요' });
      if (!sid) return reply({ ok: false, error: '세션 정보가 없어요' });
      for (const t of ['home', 'away']) {
        if (room.players[t]?.sessionId === sid) {
          seat(socket, room, t, room.players[t]);
          room.match?.resume();
          reply({ ok: true, code: room.code, rejoined: true });
          sendRoomState(room);
          if (room.match) socket.emit('game:phase', room.match.phaseMsg());
          return;
        }
      }
      if (room.players.away) return reply({ ok: false, error: '방이 가득 찼어요' });
      seat(socket, room, 'away', { name: cleanName(name), sessionId: sid });
      reply({ ok: true, code: room.code });
      sendRoomState(room);
    });

    on('room:rejoin', ({ code, sessionId }, reply) => {
      const room = rooms.get(String(code || '').toUpperCase());
      if (!room) return reply({ ok: false, error: '방이 사라졌어요' });
      const team = ['home', 'away'].find((t) => room.players[t]?.sessionId === sessionId);
      if (!team) return reply({ ok: false, error: '이 방의 선수가 아니에요' });
      seat(socket, room, team, room.players[team]);
      reply({ ok: true, code: room.code, team });
      sendRoomState(room);
      if (room.match) {
        socket.emit('game:phase', room.match.phaseMsg());
        const cur = room.match.current;
        if (room.match.phase === 'flight' && cur) socket.emit('pitch:start', { pitchId: room.match.pitchId, stroke: cur.stroke, startAt: cur.startAt });
        const other = team === 'home' ? 'away' : 'home';
        if (room.players[other]?.connected) room.match.resume();
      }
    });

    on('room:leave', (_p, reply) => {
      const room = myRoom();
      if (room) { socket.leave(room.code); leaveSeat(room, socket.data.team, true); }
      socket.data = {};
      reply({ ok: true });
    });

    on('game:start', ({ innings }, reply) => {
      const room = myRoom();
      if (!room) return reply({ ok: false, error: '방에 없어요' });
      if (socket.data.team !== 'home') return reply({ ok: false, error: '방장만 시작할 수 있어요' });
      if (!room.players.away || !room.players.away.connected) return reply({ ok: false, error: '상대를 기다리는 중이에요' });
      if (room.match && room.match.phase !== 'final') return reply({ ok: false, error: '이미 경기 중이에요' });
      const n = Number(innings);
      room.innings = INNING_OPTIONS.includes(n) ? n : 3;
      startMatch(room);
      reply({ ok: true });
    });

    on('game:rematch', (_p, reply) => {
      const room = myRoom();
      if (!room || !room.match || room.match.phase !== 'final') return reply({ ok: false, error: '아직 경기가 안 끝났어요' });
      if (!room.players.home || !room.players.away) return reply({ ok: false, error: '상대가 나갔어요' });
      room.rematch.add(socket.data.team);
      io.to(room.code).emit('game:rematchVotes', { teams: [...room.rematch] });
      if (room.rematch.size === 2) startMatch(room);
      reply({ ok: true });
    });

    const matchCall = (method) => (payload, reply) => {
      const room = myRoom();
      if (!room || !room.match) return reply({ ok: false, error: '경기 중이 아니에요' });
      touch(room);
      const err = room.match[method](socket.data.team, payload);
      reply(err ? { ok: false, error: err } : { ok: true });
    };
    on('pitch:stroke', matchCall('onStroke'));
    on('pitch:swing', matchCall('onSwing'));
    on('pitch:take', matchCall('onTake'));

    on('emote', ({ id }, reply) => {
      const room = myRoom();
      if (!room) return reply({ ok: false, error: '방에 없어요' });
      if (!EMOTES.includes(id)) return reply({ ok: false, error: '없는 이모티콘' });
      const team = socket.data.team;
      const now = Date.now();
      if (now - room.lastEmote[team] < 1000) return reply({ ok: false, error: '잠깐만요' });
      room.lastEmote[team] = now;
      io.to(room.code).emit('emote', { team, id });
      reply({ ok: true });
    });

    socket.on('disconnect', () => {
      const room = myRoom();
      if (!room) return;
      const team = socket.data.team;
      const p = room.players[team];
      if (!p || p.socketId !== socket.id) return;
      p.connected = false;
      p.socketId = null;
      room.match?.pause();
      sendRoomState(room);
      clearTimeout(p.graceTimer);
      p.graceTimer = setTimeout(() => {
        if (!p.connected && rooms.has(room.code)) leaveSeat(room, team, !room.match || room.match.phase === 'final');
      }, disconnectGraceMs);
    });
  });

  return {
    rooms,
    dispose() { for (const r of [...rooms.values()]) destroy(r, '서버 종료'); },
  };
}
