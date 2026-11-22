import { BOX, ZONE, STROKE_LIMITS } from '/shared/constants.js';
import { plateToBox, boxToPlate, strokeInk } from '/shared/stroke.js';

// 투구 그리기 오버레이 + 타격 입력이 같이 쓰는 2D 캔버스
export function createOverlay(stage, canvas) {
  const g = canvas.getContext('2d');
  let dpr = 1, W = 1, H = 1;
  const layers = new Set();
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.size.width; H = stage.size.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  stage.onResize(resize);
  stage.onFrame((dt, now) => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const l of layers) l(g, W, H, now);
  });
  resize();
  return {
    canvas, g,
    get size() { return { W, H }; },
    add(fn) { layers.add(fn); return () => layers.delete(fn); },
    setActive(on) { canvas.classList.toggle('active', on); },
  };
}

const proj = (stage, x, y) => stage.projectToScreen({ x, y, z: 0 });

function polyFor(stage, r) {
  return [proj(stage, r.xMin, r.yMin), proj(stage, r.xMax, r.yMin), proj(stage, r.xMax, r.yMax), proj(stage, r.xMin, r.yMax)];
}

function roundPoly(g, pts, rad) {
  g.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1 = { x: p0.px - p1.px, y: p0.py - p1.py }, v2 = { x: p2.px - p1.px, y: p2.py - p1.py };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    const r = Math.min(rad, l1 / 2, l2 / 2);
    const a = { x: p1.px + (v1.x / l1) * r, y: p1.py + (v1.y / l1) * r };
    const b = { x: p1.px + (v2.x / l2) * r, y: p1.py + (v2.y / l2) * r };
    if (i === 0) g.moveTo(a.x, a.y); else g.lineTo(a.x, a.y);
    g.quadraticCurveTo(p1.px, p1.py, b.x, b.y);
  }
  g.closePath();
}

export function createDrawPad(stage, overlay, { color = '#ff5a36' } = {}) {
  let active = false;
  let drawing = false;
  let pts = [];
  let t0 = 0;
  let clockEndsAt = 0;
  let onThrow = null;
  let shown = null; // {stroke, startNow, T, fadeAt}
  let penColor = color;
  let hint = true;
  let lastTick = 0;
  let tickCb = null;

  const toBox = (px, py) => {
    const p = stage.plateRayFromScreen(px, py);
    if (!p) return null;
    const b = plateToBox(p.x, p.y);
    return [Math.min(1, Math.max(0, b.u)), Math.min(1, Math.max(0, b.v))];
  };
  const toScreen = (u, v) => { const p = boxToPlate(u, v); return proj(stage, p.x, p.y); };

  function inkUsed() { return pts.length > 1 ? strokeInk({ pts }) : 0; }

  function finish() {
    if (!drawing && !pts.length) return;
    drawing = false;
    const stroke = { pts: pts.map((p) => [round(p[0]), round(p[1]), Math.round(p[2] * 10) / 10]) };
    const cb = onThrow;
    stop(false);
    shown = { stroke, startNow: null, T: 0, fadeAt: null };
    cb?.(stroke);
  }
  const round = (n) => Math.round(n * 10000) / 10000;

  function addPoint(e) {
    const b = toBox(e.clientX, e.clientY);
    if (!b) return;
    const t = Math.max(0, (e.timeStamp || performance.now()) - t0);
    const last = pts[pts.length - 1];
    if (last && t - last[2] < 8 && pts.length > 1) { last[0] = b[0]; last[1] = b[1]; last[2] = Math.max(last[2], t); }
    else pts.push([b[0], b[1], last ? Math.max(t, last[2]) : 0]);
    if (inkUsed() >= STROKE_LIMITS.inkMax || t >= STROKE_LIMITS.maxDurationMs) finish();
  }

  function insideBox(px, py) {
    const p = stage.plateRayFromScreen(px, py);
    if (!p) return false;
    const m = 0.25; // 약간 바깥에서 시작해도 허용
    return p.x >= BOX.xMin - m && p.x <= BOX.xMax + m && p.y >= BOX.yMin - m && p.y <= BOX.yMax + m;
  }

  const onDown = (e) => {
    if (!active || drawing) return;
    if (!insideBox(e.clientX, e.clientY)) return;
    e.preventDefault();
    try { overlay.canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    drawing = true;
    hint = false;
    pts = [];
    t0 = e.timeStamp || performance.now();
    addPoint(e);
  };
  const onMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (list.length ? list : [e])) { if (drawing) addPoint(ev); }
  };
  const onUp = (e) => { if (drawing) { e.preventDefault(); addPoint(e); finish(); } };

  overlay.canvas.addEventListener('pointerdown', onDown, { passive: false });
  overlay.canvas.addEventListener('pointermove', onMove, { passive: false });
  overlay.canvas.addEventListener('pointerup', onUp, { passive: false });
  overlay.canvas.addEventListener('pointercancel', onUp, { passive: false });

  function strokePath(g, list, upto = Infinity) {
    g.beginPath();
    let started = false;
    for (const p of list) {
      if (p[2] > upto) break;
      const s = toScreen(p[0], p[1]);
      if (!started) { g.moveTo(s.px, s.py); started = true; } else g.lineTo(s.px, s.py);
    }
    return started;
  }

  overlay.add((g, W, H, now) => {
    const pen = Math.max(4, Math.min(W, H) * 0.012);
    if (active) {
      const box = polyFor(stage, BOX);
      const zone = polyFor(stage, ZONE);
      // 박스 밖 살짝 어둡게
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-out';
      roundPoly(g, box, 18); g.fill();
      g.restore();
      // 박스 테두리
      g.save();
      g.setLineDash([12, 10]);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      roundPoly(g, box, 18); g.stroke();
      g.restore();
      // 스트라이크 존
      g.save();
      g.fillStyle = 'rgba(255,210,63,0.13)';
      g.strokeStyle = 'rgba(255,210,63,0.95)';
      g.lineWidth = 2.5;
      g.beginPath(); zone.forEach((p, i) => (i ? g.lineTo(p.px, p.py) : g.moveTo(p.px, p.py))); g.closePath();
      g.fill(); g.stroke();
      // 존 3x3 칸
      g.strokeStyle = 'rgba(255,210,63,0.35)'; g.lineWidth = 1;
      for (const f of [1 / 3, 2 / 3]) {
        const x = ZONE.xMin + (ZONE.xMax - ZONE.xMin) * f, y = ZONE.yMin + (ZONE.yMax - ZONE.yMin) * f;
        const a = proj(stage, x, ZONE.yMin), b = proj(stage, x, ZONE.yMax);
        g.beginPath(); g.moveTo(a.px, a.py); g.lineTo(b.px, b.py); g.stroke();
        const c = proj(stage, ZONE.xMin, y), d = proj(stage, ZONE.xMax, y);
        g.beginPath(); g.moveTo(c.px, c.py); g.lineTo(d.px, d.py); g.stroke();
      }
      g.restore();

      const top = Math.min(box[2].py, box[3].py);
      const left = Math.min(box[0].px, box[3].px), right = Math.max(box[1].px, box[2].px);
      const bottom = Math.max(box[0].py, box[1].py);
      const fs = Math.max(13, Math.min(20, W * 0.035));
      // 안내 문구
      if (hint) {
        g.save();
        g.font = `800 ${fs}px Pretendard, sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
        const cy = (top + bottom) / 2;
        const bob = Math.sin(now / 250) * 4;
        g.fillText('✏️ 박스 안에 한 붓으로 그려서 던져요!', (left + right) / 2, top + fs * 1.6 + bob);
        g.font = `600 ${fs * 0.8}px Pretendard, sans-serif`;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillText('선이 끝나는 곳이 노란 존 안이면 스트라이크', (left + right) / 2, bottom - fs * 0.9);
        g.restore();
      }
      // 잉크 게이지
      const ink = drawing ? inkUsed() / STROKE_LIMITS.inkMax : 0;
      const gw = (right - left) * 0.7, gx = (left + right) / 2 - gw / 2, gy = bottom + 12;
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(gx - 2, gy - 2, gw + 4, 12);
      g.fillStyle = ink > 0.8 ? '#ff4d4d' : penColor;
      g.fillRect(gx, gy, gw * (1 - ink), 8);
      g.font = `700 ${Math.max(11, fs * 0.65)}px Pretendard, sans-serif`;
      g.fillStyle = '#fff';
      g.textAlign = 'right';
      g.fillText('잉크', gx - 8, gy + 8);
      g.restore();
      // 투구 시계
      const remain = Math.max(0, clockEndsAt - now);
      const sec = Math.ceil(remain / 1000);
      if (!drawing) {
        g.save();
        const cx = right - 26, cy = top + 26, r = 18;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
        g.beginPath(); g.moveTo(cx, cy);
        g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (remain / STROKE_LIMITS.clockMs) * Math.PI * 2);
        g.closePath(); g.fillStyle = sec <= 5 ? 'rgba(255,77,77,0.85)' : 'rgba(255,255,255,0.3)'; g.fill();
        g.font = `800 15px Pretendard, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.fillText(String(sec), cx, cy + 1);
        g.restore();
        if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; tickCb?.(); }
      }
      // 그리는 중인 선
      if (pts.length) {
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        strokePath(g, pts); g.strokeStyle = penColor; g.lineWidth = pen * 2.2; g.globalAlpha = 0.35; g.stroke();
        g.globalAlpha = 1; strokePath(g, pts); g.strokeStyle = '#fff'; g.lineWidth = pen; g.stroke();
        g.restore();
      }
    }
    // 던진 뒤: 그린 선을 보여주고 공 위치까지 진하게
    if (shown) {
      const { stroke, startNow, T } = shown;
      let alpha = 1;
      if (shown.fadeAt) alpha = Math.max(0, 1 - (now - shown.fadeAt) / 700);
      if (alpha <= 0) { shown = null; return; }
      const D = stroke.pts[stroke.pts.length - 1][2] || 1;
      const prog = startNow == null ? -1 : Math.min(1, Math.max(0, (now - startNow) / T));
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.globalAlpha = 0.45 * alpha;
      strokePath(g, stroke.pts); g.strokeStyle = '#ffffff'; g.lineWidth = pen * 0.7; g.setLineDash([pen * 1.2, pen * 1.2]); g.stroke();
      g.setLineDash([]);
      if (prog > 0) {
        g.globalAlpha = 0.9 * alpha;
        strokePath(g, stroke.pts, prog * D); g.strokeStyle = penColor; g.lineWidth = pen * 1.1; g.stroke();
      }
      g.restore();
    }
  });

  function stop(clear = true) {
    active = false;
    drawing = false;
    pts = [];
    overlay.setActive(false);
    if (clear) shown = null;
  }

  return {
    start({ clockEndsAt: ce, onThrow: cb, color: c }) {
      active = true; drawing = false; pts = []; hint = true; lastTick = 0;
      clockEndsAt = ce; onThrow = cb;
      if (c) penColor = c;
      shown = null;
      overlay.setActive(true);
    },
    stop,
    get drawing() { return drawing; },
    // 투구 시작 시 공 진행에 맞춰 선을 채움
    replay(stroke, startNow, T) { shown = { stroke, startNow, T, fadeAt: null }; },
    fadeShown(now) { if (shown && !shown.fadeAt) shown.fadeAt = now; },
    clearShown() { shown = null; },
    onTick(cb) { tickCb = cb; },
    forceFinish() { if (drawing) finish(); },
  };
}

export function createBatInput(stage, overlay) {
  let armed = null;
  const onDown = (e) => {
    if (!armed) return;
    e.preventDefault();
    const a = armed;
    armed = null;
    overlay.setActive(false);
    const now = e.timeStamp || performance.now();
    a.onSwing({ t: now - a.startNow, ray: stage.screenRayDir(e.clientX, e.clientY), px: e.clientX, py: e.clientY, now });
  };
  overlay.canvas.addEventListener('pointerdown', onDown, { passive: false });
  let tap = null;
  overlay.add((g, W, H, now) => {
    if (armed) {
      const fs = Math.max(13, Math.min(18, W * 0.032));
      g.save();
      g.font = `800 ${fs}px Pretendard, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 6;
      g.fillText('🏏 공이 홈 근처에 오면 공을 터치!', W / 2, H - Math.max(70, H * 0.12));
      g.restore();
    }
    if (tap) {
      const a = 1 - (now - tap.at) / 450;
      if (a <= 0) { tap = null; return; }
      g.save();
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 3;
      g.beginPath(); g.arc(tap.x, tap.y, 18 + (1 - a) * 26, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  });
  return {
    arm({ startNow, onSwing }) { armed = { startNow, onSwing: (s) => { tap = { x: s.px, y: s.py, at: performance.now() }; onSwing(s); } }; overlay.setActive(true); },
    disarm() { armed = null; overlay.setActive(false); },
    get armed() { return !!armed; },
  };
}
