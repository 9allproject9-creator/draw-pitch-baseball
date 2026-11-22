// 파일 없이 WebAudio로 합성하는 효과음
let ctx = null;
let master = null;
let enabled = (() => { try { return localStorage.getItem('gd.sound') !== 'off'; } catch { return true; } })();

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(sec) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noise({ dur = 0.3, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.005, freqEnd, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

function tone({ freq = 440, freqEnd, dur = 0.2, type = 'sine', gain = 0.3, delay = 0, attack = 0.005 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  click: () => tone({ freq: 880, freqEnd: 1320, dur: 0.07, type: 'triangle', gain: 0.18 }),
  whoosh: () => noise({ dur: 0.35, type: 'bandpass', freq: 400, freqEnd: 2400, q: 2, gain: 0.35, attack: 0.08 }),
  swing: () => noise({ dur: 0.22, type: 'bandpass', freq: 1800, freqEnd: 500, q: 1.5, gain: 0.4, attack: 0.02 }),
  mitt: () => { noise({ dur: 0.12, type: 'lowpass', freq: 900, gain: 0.9, attack: 0.002 }); tone({ freq: 140, freqEnd: 60, dur: 0.12, gain: 0.6 }); },
  crack: () => { noise({ dur: 0.18, type: 'highpass', freq: 1800, gain: 1.0, attack: 0.001 }); tone({ freq: 1250, freqEnd: 600, dur: 0.09, type: 'square', gain: 0.25 }); tone({ freq: 320, freqEnd: 120, dur: 0.15, gain: 0.5 }); },
  cheer: () => { noise({ dur: 2.4, type: 'bandpass', freq: 900, q: 0.6, gain: 0.45, attack: 0.3 }); noise({ dur: 2.0, type: 'bandpass', freq: 2200, q: 0.8, gain: 0.2, attack: 0.4, delay: 0.1 }); },
  boo: () => { noise({ dur: 1.4, type: 'lowpass', freq: 380, gain: 0.5, attack: 0.25 }); tone({ freq: 160, freqEnd: 110, dur: 1.2, type: 'sawtooth', gain: 0.05, attack: 0.3 }); },
  strike: () => { tone({ freq: 660, dur: 0.12, type: 'square', gain: 0.12 }); tone({ freq: 990, dur: 0.18, type: 'square', gain: 0.12, delay: 0.1 }); },
  strikeout: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'square', gain: 0.12, delay: i * 0.09 })),
  homerun: () => {
    [392, 523, 659, 784, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'sawtooth', gain: 0.09, delay: i * 0.13 }));
    SOUNDS.cheer();
  },
  ball: () => tone({ freq: 330, dur: 0.15, type: 'triangle', gain: 0.15 }),
  bonk: () => { tone({ freq: 520, freqEnd: 110, dur: 0.28, type: 'square', gain: 0.22 }); noise({ dur: 0.08, type: 'lowpass', freq: 700, gain: 0.8 }); tone({ freq: 1400, freqEnd: 1800, dur: 0.5, type: 'sine', gain: 0.07, delay: 0.15 }); },
  boom: () => { noise({ dur: 0.9, type: 'lowpass', freq: 600, freqEnd: 60, gain: 1.0, attack: 0.005 }); tone({ freq: 90, freqEnd: 35, dur: 0.7, type: 'sine', gain: 0.8 }); },
  thud: () => { noise({ dur: 0.18, type: 'lowpass', freq: 400, gain: 0.9, attack: 0.002 }); tone({ freq: 120, freqEnd: 50, dur: 0.18, gain: 0.6 }); },
  boing: () => tone({ freq: 180, freqEnd: 620, dur: 0.35, type: 'sine', gain: 0.18 }),
  tick: () => tone({ freq: 1500, dur: 0.03, type: 'square', gain: 0.06 }),
  pop: () => tone({ freq: 600, freqEnd: 1200, dur: 0.1, type: 'sine', gain: 0.2 }),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.15, delay: i * 0.12 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.15, delay: i * 0.18 })),
};

export const audio = {
  unlock() { if (enabled) ensure(); },
  play(name) {
    if (!enabled) return;
    if (!ensure()) return;
    try { SOUNDS[name]?.(); } catch { /* 무시 */ }
  },
  get enabled() { return enabled; },
  setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('gd.sound', on ? 'on' : 'off'); } catch { /* 무시 */ }
    if (on) ensure();
  },
};
