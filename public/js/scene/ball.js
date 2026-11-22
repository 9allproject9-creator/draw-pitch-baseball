import * as THREE from 'three';
import { fenceRadius } from './field.js';

const MAX = 600;

function seamTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf5'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#d6332a'; g.lineWidth = 3;
  for (const off of [0, 64]) {
    g.beginPath();
    for (let x = 0; x <= 64; x += 2) g.lineTo(off + x, 32 + Math.sin((x / 64) * Math.PI * 2) * 18);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createBall(scene) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshLambertMaterial({ map: seamTexture(), emissive: '#222' }));
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(0.5);
  ball.add(glow);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;
  scene.add(shadow);

  // 꼬리선 리본
  const pos = new Float32Array(MAX * 2 * 3);
  const col = new Float32Array(MAX * 2 * 4);
  const idx = [];
  for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  ribbon.frustumCulled = false;
  scene.add(ribbon);

  let pts = [];
  let trailColor = new THREE.Color('#ff7a3d');
  let alpha = 1, fading = false;
  let mode = 'idle';
  let path = null, startNow = 0, stopT = Infinity;
  let hit = null;

  function pushPoint(p) {
    const last = pts[pts.length - 1];
    if (last && last.distanceToSquared(p) < 0.0009) return;
    pts.push(p.clone());
    if (pts.length > MAX) pts.shift();
  }

  function rebuild(camera) {
    const n = pts.length;
    if (n < 2) { geo.setDrawRange(0, 0); return; }
    const side = new THREE.Vector3(), tan = new THREE.Vector3(), view = new THREE.Vector3();
    const screenK = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 2 * 0.0065;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      tan.subVectors(b, a);
      view.subVectors(camera.position, p);
      const dist = view.length();
      side.crossVectors(tan, view).normalize();
      const f = i / (n - 1);
      const w = dist * screenK * (0.3 + 0.7 * f);
      side.multiplyScalar(w);
      pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
      const k = alpha * (0.15 + 0.85 * Math.sqrt(f));
      const r = trailColor.r, g = trailColor.g, bl = trailColor.b;
      col.set([r, g, bl, k, r, g, bl, k], i * 8);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }

  function place(p) {
    ball.position.copy(p);
    shadow.position.set(p.x, 0.04, p.z);
    const h = Math.max(0, p.y);
    shadow.material.opacity = 0.38 / (1 + h * 0.15);
    shadow.scale.setScalar(1 + h * 0.06);
  }

  return {
    mesh: ball,
    clear() {
      pts = []; alpha = 1; fading = false; mode = 'idle';
      ball.visible = false; shadow.visible = false; hit = null; path = null;
      geo.setDrawRange(0, 0);
    },
    playPitch(p, start, color = '#ff7a3d') {
      pts = []; alpha = 1; fading = false;
      trailColor = new THREE.Color(color);
      path = p; startNow = start; stopT = Infinity; mode = 'pitch';
      ball.visible = false; shadow.visible = false;
    },
    // 비행 중 공 위치 (t: 투구 시작 기준 ms)
    pitchTime(now) { return now - startNow; },
    stopAt(t) { stopT = t; },
    playHit(flight, from, start) {
      mode = 'hit';
      const th = THREE.MathUtils.degToRad(flight.spray);
      const dir = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
      let land = dir.clone().multiplyScalar(flight.distance);
      let endY = 0;
      if (flight.kind === 'hr') {
        const fr = fenceRadius(th);
        land = dir.clone().multiplyScalar(Math.max(flight.distance, fr + 12));
        endY = 7;
      }
      hit = { flight, from: new THREE.Vector3(from.x, from.y, from.z), land, endY, start, dir };
      pts = [];
      trailColor = new THREE.Color('#ffffff');
      alpha = 0.8;
      return { landing: land.clone(), landMs: flight.hangMs };
    },
    fade() { fading = true; },
    update(now, camera) {
      if (mode === 'pitch' && path) {
        const t = Math.min(now - startNow, stopT);
        if (t >= 0) {
          ball.visible = true; shadow.visible = true;
          const q = path.positionAt(t);
          const p = new THREE.Vector3(q.x, q.y, q.z);
          place(p);
          if (t <= path.T + 40) pushPoint(p);
        }
      } else if (mode === 'hit' && hit) {
        const { flight, from, land, endY } = hit;
        const s = Math.min(1, (now - hit.start) / flight.hangMs);
        const p = new THREE.Vector3();
        if (flight.kind === 'ground') {
          const e = 1 - Math.pow(1 - s, 2);
          p.lerpVectors(from, land, e);
          p.y = 0.075 + Math.abs(Math.sin(e * Math.PI * 3.5)) * (1 - e) * 1.6;
          if (s < 0.08) p.y = THREE.MathUtils.lerp(from.y, p.y, s / 0.08);
        } else {
          p.lerpVectors(from, land, s);
          p.y = THREE.MathUtils.lerp(from.y, endY + 0.075, s) + 4 * flight.apex * s * (1 - s);
        }
        place(p);
        ball.visible = true; shadow.visible = true;
        if (s < 1) pushPoint(p);
      }
      if (fading) { alpha *= 0.94; if (alpha < 0.02) { alpha = 0; pts = []; fading = false; } }
      if (ball.visible) {
        const d = camera.position.distanceTo(ball.position);
        const sk = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 2;
        glow.scale.setScalar(Math.max(0.3, d * sk * 0.07));
        const bs = Math.max(1, (d * sk * 0.012) / 0.075);
        ball.scale.setScalar(bs);
      }
      rebuild(camera);
    },
  };
}
