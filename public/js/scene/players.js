import * as THREE from 'three';
import { RUBBER_Z, CATCHER_Z } from '/shared/constants.js';
import { BASES, BACKWALL } from './field.js';

export const TEAM_COLORS = { home: '#ff5a36', away: '#2f7dff' };
const SKIN = ['#ffd9b3', '#f1c08f', '#d9a066', '#a8714a'];
const HAIR = ['#2b1d14', '#4a2f1b', '#111111', '#7a4a22'];

// 만화풍 3단 음영
const TOON = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const OUTLINE = new THREE.MeshBasicMaterial({ color: '#15121a', side: THREE.BackSide });

const faceCache = new Map();
function faceTexture(skin, mood = 'happy') {
  const key = skin + mood;
  if (faceCache.has(key)) return faceCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
  const cx = 128; // 구 UV에서 u=0.25 = 정면(+z)
  // 볼터치
  g.fillStyle = 'rgba(255,110,110,0.35)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 36, 150, 15, 9, 0, 0, Math.PI * 2); g.fill(); }
  // 눈
  for (const s of [-1, 1]) {
    const x = cx + s * 24;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 120, 11, 14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1b24'; g.beginPath(); g.ellipse(x + s * 1, 123, 7.5, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * 1 - 2.5, 118, 3, 0, Math.PI * 2); g.fill();
    // 눈썹
    g.strokeStyle = '#2a1d16'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 10, 100 - (mood === 'mad' ? -s * 4 : 0)); g.lineTo(x + 10, 98 + (mood === 'mad' ? s * 4 : 0)); g.stroke();
  }
  // 입
  g.strokeStyle = '#7a2b2b'; g.lineWidth = 4.5; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, 150, 13, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faceCache.set(key, t);
  return t;
}

function jerseyTexture(number, letter) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 256); // 흰 바탕 → 재질 색으로 팀색이 됨
  // 옆 파이핑
  g.fillStyle = '#d8d8d8';
  g.fillRect(122, 0, 10, 256); g.fillRect(380, 0, 10, 256);
  // 등번호 (u=0.5 = 등)
  g.font = '900 120px Arial Black, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.strokeText(String(number), 256, 118);
  g.fillStyle = '#1a1c2c'; g.fillText(String(number), 256, 118);
  // 가슴 글자 (u=0 = 정면, 양 끝에 나눠 그림)
  g.font = '900 54px Arial Black, Arial, sans-serif';
  for (const x of [0, 512]) { g.lineWidth = 8; g.strokeStyle = '#fff'; g.strokeText(letter, x, 96); g.fillStyle = '#1a1c2c'; g.fillText(letter, x, 96); }
  // 단추 줄
  g.fillStyle = '#9a9aa8';
  for (const x of [0, 512]) for (let y = 130; y < 250; y += 28) { g.beginPath(); g.arc(x + (x ? -6 : 6), y, 4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeChar({ color, skin = SKIN[0], role = 'fielder', outline = role !== 'fielder' }) {
  const mats = [];
  const teamMats = [];
  const outlines = [];
  const M = (c, opts = {}) => { const m = new THREE.MeshToonMaterial({ color: c, gradientMap: TOON, ...opts }); mats.push(m); return m; };
  const number = 1 + Math.floor(Math.random() * 99);
  const isUmp = role === 'umpire';
  const uni = M(isUmp ? '#1f2433' : color, isUmp ? {} : { map: jerseyTexture(number, 'G') });
  const sleeveM = M(isUmp ? '#1f2433' : color);
  const capM = M(isUmp ? '#1f2433' : color);
  const sockM = M(isUmp ? '#1f2433' : color);
  if (!isUmp) teamMats.push(uni, sleeveM, capM, sockM);
  const skinM = M(skin);
  const faceM = M('#ffffff', { map: faceTexture(skin) });
  const hairM = M(HAIR[Math.floor(Math.random() * HAIR.length)]);
  const pants = M(isUmp ? '#7b8090' : '#f2f1ea');
  const dark = M('#1c1c26');
  const sole = M('#f5f5f5');
  const glove = M('#9a5524');
  const gloveDark = M('#6e3a16');
  const gear = M('#2a3350');

  const add = (geo, mat, parent, pos, rot, scale, line = true) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    parent.add(m);
    if (outline && line) {
      geo.computeBoundingSphere();
      const r = geo.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z);
      const k = Math.min(1.3, Math.max(1.03, 1 + 0.022 / r));
      const o = new THREE.Mesh(geo, OUTLINE);
      o.scale.setScalar(k);
      o.castShadow = false;
      m.add(o);
      outlines.push(o);
    }
    return m;
  };

  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.82; root.add(hips);
  // 다리: 바지(흰) + 양말(팀색) + 스파이크
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(0.17 * s, 0, 0); hips.add(g);
    add(new THREE.CapsuleGeometry(0.16, 0.3, 6, 12), pants, g, [0, -0.25, 0]);
    add(new THREE.CapsuleGeometry(0.12, 0.22, 6, 12), sockM, g, [0, -0.57, 0]);
    add(new THREE.BoxGeometry(0.22, 0.11, 0.36, 1, 1, 2), dark, g, [0, -0.77, 0.06]);
    add(new THREE.BoxGeometry(0.23, 0.03, 0.37), sole, g, [0, -0.83, 0.06], null, null, false);
    if (role === 'catcher' || isUmp) add(new THREE.CapsuleGeometry(0.135, 0.3, 4, 10), gear, g, [0, -0.5, 0.05]);
    return g;
  });

  // 몸통: 원통형 유니폼(Lathe) + 벨트
  const torso = new THREE.Group(); hips.add(torso);
  const prof = [[0.001, -0.02], [0.3, 0.0], [0.36, 0.12], [0.39, 0.32], [0.41, 0.52], [0.38, 0.66], [0.26, 0.76], [0.001, 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(prof, 28), uni, torso, [0, 0.06, 0]);
  add(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24), dark, torso, [0, 0.12, 0], null, null, false);
  add(new THREE.BoxGeometry(0.1, 0.08, 0.04), M('#d9b44a'), torso, [0, 0.12, 0.35], null, null, false);
  if (role === 'catcher' || isUmp) add(new THREE.BoxGeometry(0.62, 0.55, 0.16, 2, 2, 1), gear, torso, [0, 0.45, 0.33], null, [1, 1, 1]);

  // 머리: 얼굴 텍스처 + 귀 + 머리카락 + 모자/헬멧
  const head = new THREE.Group(); head.position.y = 1.1; torso.add(head);
  add(new THREE.SphereGeometry(0.33, 32, 20), faceM, head);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.075, 10, 8), skinM, head, [0.32 * s, -0.02, 0], null, [0.6, 1, 0.8]);
  add(new THREE.SphereGeometry(0.335, 24, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.32), hairM, head, [0, 0, -0.02], [0.25, 0, 0], null, false);
  let cap, brim;
  if (role === 'batter' || role === 'runner') {
    // 타자 헬멧: 광택 + 귀덮개
    const helmM = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1 });
    mats.push(helmM); teamMats.push(helmM);
    cap = add(new THREE.SphereGeometry(0.37, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), helmM, head, [0, 0.04, -0.01]);
    brim = add(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 18, 1, false, 0, Math.PI), helmM, head, [0, 0.03, 0.3], [0, -Math.PI / 2, 0], [1, 1, 1.25]);
    add(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmM, head, [-0.3, -0.06, 0.02], [0, 0, Math.PI / 2], [1, 0.6, 1]);
  } else {
    cap = add(new THREE.SphereGeometry(0.345, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), capM, head, [0, 0.06, 0]);
    brim = add(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 18, 1, false, 0, Math.PI), capM, head, [0, 0.07, 0.28], [0.12, -Math.PI / 2, 0], [1, 1, 1.45]);
    add(new THREE.SphereGeometry(0.035, 8, 6), capM, head, [0, 0.4, 0], null, null, false);
    if (!isUmp) {
      const lt = document.createElement('canvas'); lt.width = lt.height = 64;
      const lg = lt.getContext('2d'); lg.font = '900 50px Arial Black, Arial'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
      lg.lineWidth = 6; lg.strokeStyle = '#1a1c2c'; lg.strokeText('G', 32, 34); lg.fillStyle = '#fff'; lg.fillText('G', 32, 34);
      const tex = new THREE.CanvasTexture(lt); tex.colorSpace = THREE.SRGBColorSpace;
      const logoM = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
      mats.push(logoM);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), logoM);
      logo.position.set(0, 0.22, 0.3); logo.rotation.x = -0.45;
      head.add(logo);
    }
  }
  if (role === 'catcher' || isUmp) {
    const cage = new THREE.Group(); cage.position.set(0, -0.02, 0.31); head.add(cage);
    add(new THREE.TorusGeometry(0.2, 0.022, 6, 18), dark, cage, null, null, [1, 1.2, 1], false);
    for (const y of [-0.08, 0, 0.08]) add(new THREE.BoxGeometry(0.34, 0.02, 0.02), dark, cage, [0, y, 0.02], null, null, false);
    add(new THREE.BoxGeometry(0.02, 0.4, 0.02), dark, cage, [0, 0, 0.03], null, null, false);
  }

  // 팔: 소매(팀색) + 팔뚝 + 손 / 왼손 글러브
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(0.46 * s, 0.64, 0); torso.add(g);
    add(new THREE.SphereGeometry(0.15, 14, 10), sleeveM, g, [0, -0.02, 0]);
    add(new THREE.CapsuleGeometry(0.115, 0.14, 4, 10), sleeveM, g, [0, -0.16, 0]);
    add(new THREE.CapsuleGeometry(0.095, 0.2, 4, 10), skinM, g, [0, -0.36, 0]);
    if (s < 0 && !isUmp && role !== 'batter' && role !== 'runner') {
      const gl = new THREE.Group(); gl.position.set(0, -0.58, 0.02); g.add(gl);
      add(new THREE.SphereGeometry(0.15, 14, 10), glove, gl, null, null, [1.25, 1.35, 0.75]);
      add(new THREE.CapsuleGeometry(0.05, 0.12, 4, 8), gloveDark, gl, [0.13, 0.02, 0.03], [0, 0, -0.5], null, false);
      add(new THREE.BoxGeometry(0.2, 0.12, 0.04), gloveDark, gl, [0, 0.12, 0.06], null, null, false);
    } else {
      add(new THREE.SphereGeometry(0.1, 12, 10), skinM, g, [0, -0.55, 0]);
    }
    return g;
  });

  let bat = null;
  if (role === 'batter') {
    bat = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#d9a86c', roughness: 0.4 });
    mats.push(wood);
    const pts = [[0.001, 0], [0.022, 0.0], [0.024, 0.02], [0.018, 0.04], [0.02, 0.3], [0.035, 0.6], [0.047, 0.85], [0.045, 0.94], [0.001, 0.95]].map(([x, y]) => new THREE.Vector2(x, y));
    add(new THREE.LatheGeometry(pts, 14), wood, bat, [0, 0, 0]);
    add(new THREE.CylinderGeometry(0.023, 0.023, 0.2, 10), dark, bat, [0, 0.12, 0], null, null, false);
    torso.add(bat);
  }
  return { root, hips, torso, head, legs, arms, bat, uni, capM, mats, teamMats, outlines, role, cap, brim, anim: { run: 0 } };
}

function setGhost(c, on) {
  for (const m of c.mats) {
    m.transparent = on;
    m.opacity = on ? 0.28 : 1;
    m.depthWrite = !on;
  }
  for (const o of c.outlines) o.visible = !on;
  c.root.traverse((o) => { if (o.isMesh && o.material !== OUTLINE) o.castShadow = !on; });
}

function resetPose(c) {
  c.hips.position.y = 0.82;
  c.hips.rotation.set(0, 0, 0);
  c.torso.rotation.set(0, 0, 0);
  c.legs.forEach((l) => l.rotation.set(0, 0, 0));
  c.arms.forEach((a) => a.rotation.set(0, 0, 0));
}

const ease = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));

function pitcherPose(c, p) {
  resetPose(c);
  const [legL, legR] = c.legs;
  const [armL, armR] = c.arms;
  if (p <= 0) { armL.rotation.x = -0.4; armR.rotation.x = -0.4; return; }
  const lift = ease(seg(p, 0, 0.4)) * (1 - ease(seg(p, 0.55, 0.75)));
  legL.rotation.x = -1.4 * lift;
  c.torso.rotation.x = -0.25 * lift;
  c.torso.rotation.y = 0.6 * lift;
  armL.rotation.x = -1.2 * lift - 0.3;
  const back = ease(seg(p, 0.35, 0.78));
  const fwd = ease(seg(p, 0.78, 1.0));
  armR.rotation.x = 2.8 * back - 4.2 * fwd;
  armR.rotation.z = -0.4 * back;
  const stride = ease(seg(p, 0.6, 0.95));
  legL.rotation.x += -0.7 * stride;
  legR.rotation.x = 0.5 * stride;
  c.torso.rotation.x += 0.55 * fwd;
  c.hips.position.y = 0.82 - 0.12 * stride;
}

function batterPose(c, p) {
  resetPose(c);
  const [legL, legR] = c.legs;
  const [armL, armR] = c.arms;
  c.hips.position.y = 0.76;
  legL.rotation.z = 0.18; legR.rotation.z = -0.18;
  // p<0: 대기 자세, 0..1: 스윙
  const s = p < 0 ? 0 : ease(Math.min(1, p));
  const turn = 1.25 - 3.0 * s;
  c.torso.rotation.y = turn * 0.55;
  armL.rotation.x = -1.6 + 0.4 * s; armR.rotation.x = -1.4 + 0.3 * s;
  armL.rotation.z = 0.5; armR.rotation.z = -0.5;
  if (c.bat) {
    c.bat.position.set(-0.05, 0.75, 0.42);
    // 대기: 배트 세움(어깨 뒤), 스윙: 수평으로 돌며 앞으로
    const swingAng = 1.9 - 4.3 * s;
    c.bat.rotation.set(0, 0, 0);
    c.bat.rotation.order = 'YZX';
    c.bat.rotation.y = swingAng;
    c.bat.rotation.z = (1 - Math.sin(Math.min(1, s * 1.2) * Math.PI) * 0.95) * 0.35 + Math.sin(Math.min(1, s * 1.2) * Math.PI) * 1.45;
  }
}

function catcherPose(c, gloveTarget) {
  resetPose(c);
  c.hips.position.y = 0.48;
  c.legs[0].rotation.set(-1.3, 0, 0.35);
  c.legs[1].rotation.set(-1.3, 0, -0.35);
  c.torso.rotation.x = 0.15;
  c.arms[1].rotation.x = -0.4;
  if (gloveTarget) {
    // 글러브 팔을 목표 쪽으로
    const local = c.root.worldToLocal(gloveTarget.clone());
    const sh = new THREE.Vector3(-0.46, 0.48 + 0.62, 0);
    const d = local.sub(sh);
    c.arms[0].rotation.x = -Math.atan2(d.z, -d.y);
    c.arms[0].rotation.z = Math.atan2(d.x, Math.hypot(d.y, d.z)) * 0.9;
  } else c.arms[0].rotation.x = -1.2;
}

function runPose(c, t, speed = 1) {
  resetPose(c);
  const a = Math.sin(t * 12 * speed) * 0.9;
  c.legs[0].rotation.x = a; c.legs[1].rotation.x = -a;
  c.arms[0].rotation.x = -a; c.arms[1].rotation.x = a;
  c.torso.rotation.x = 0.25;
  c.hips.position.y = 0.82 + Math.abs(Math.cos(t * 12 * speed)) * 0.08;
}

function idlePose(c, t, crouch = 0) {
  resetPose(c);
  c.hips.position.y = 0.82 - crouch * 0.2;
  c.torso.rotation.x = crouch * 0.4;
  c.legs[0].rotation.set(-crouch * 0.5, 0, 0.25 * crouch);
  c.legs[1].rotation.set(-crouch * 0.5, 0, -0.25 * crouch);
  c.arms[0].rotation.x = -0.5 * crouch - 0.1;
  c.arms[1].rotation.x = -0.5 * crouch - 0.1;
  c.torso.rotation.z = Math.sin(t * 1.6) * 0.03;
}

const faceHome = (c) => { c.root.rotation.y = Math.atan2(-c.root.position.x, -c.root.position.z); };
const BASE_PATH = [BASES.home, BASES.first, BASES.second, BASES.third, BASES.home];

export function createPlayers(scene) {
  const all = [];
  const add = (opts, pos) => { const c = makeChar(opts); c.root.position.copy(pos); scene.add(c.root); all.push(c); return c; };

  const pitcher = add({ color: TEAM_COLORS.home, role: 'pitcher', skin: SKIN[1] }, new THREE.Vector3(0, 0.25, RUBBER_Z + 0.2));
  const batter = add({ color: TEAM_COLORS.away, role: 'batter', skin: SKIN[2] }, new THREE.Vector3(-1.15, 0, 0.05));
  batter.root.rotation.y = Math.PI / 2;
  const catcher = add({ color: TEAM_COLORS.home, role: 'catcher', skin: SKIN[0] }, new THREE.Vector3(0, 0, CATCHER_Z + 0.25));
  catcher.root.rotation.y = Math.PI;
  const umpire = add({ color: '#22252f', role: 'umpire', skin: SKIN[3] }, new THREE.Vector3(0.15, 0, CATCHER_Z + 1.3));
  umpire.root.rotation.y = Math.PI;
  for (const c of [batter, catcher, umpire]) { c.basePos = c.root.position.clone(); c.baseRot = c.root.rotation.clone(); }

  const FPOS = {
    p1b: [16.5, -23.5], p2b: [7.5, -32], ss: [-7.5, -32], p3b: [-16.5, -23.5],
    lf: [-32, -72], cf: [0, -86], rf: [32, -72],
  };
  const fielders = {};
  for (const [k, [x, z]] of Object.entries(FPOS)) {
    const c = add({ color: TEAM_COLORS.home, role: 'fielder', skin: SKIN[Math.floor(Math.random() * 4)] }, new THREE.Vector3(x, 0, z));
    c.home = new THREE.Vector3(x, 0, z);
    faceHome(c);
    fielders[k] = c;
  }

  const runners = [0, 1, 2, 3].map(() => {
    const c = add({ color: TEAM_COLORS.away, role: 'runner', skin: SKIN[Math.floor(Math.random() * 4)] }, BASES.first.clone());
    c.root.visible = false;
    c.runPath = null;
    return c;
  });

  let pitchAnim = null;   // {start, dur}
  let swingAnim = null;   // {start}
  let gloveTarget = null;
  let chasing = [];
  let teams = { batting: 'away', fielding: 'home' };
  let knock = null;   // 사구 맞은 타자
  let cele = null;    // 투수 세리머니
  let stomp = null;   // 타자 발 구르기
  const flyers = [];  // 날아가는 모자/배트
  const BATTER_HOME = new THREE.Vector3(-1.15, 0, 0.05);
  let onImpact = null;
  // 날아가기: 속도·회전을 주면 중력·벽·바닥과 부딪히며 날아감
  function launch(c, vel, spin) {
    c.fly = { vel: vel.clone(), spin: spin.clone(), wall: false, t: 0 };
    if (c.cap && c.cap.visible) {
      spawnFlyer([c.cap, c.brim], new THREE.Vector3(vel.x * 0.6 + (Math.random() - 0.5) * 2, vel.y * 0.9 + 2, vel.z * 0.4), new THREE.Vector3(8, 4, 11));
      c.cap.visible = false; c.brim.visible = false;
    }
  }
  function updateFly(c, dt, now) {
    const f = c.fly;
    f.t += dt;
    f.vel.y -= 9.8 * dt;
    c.root.position.addScaledVector(f.vel, dt);
    c.root.rotation.x += f.spin.x * dt; c.root.rotation.y += f.spin.y * dt; c.root.rotation.z += f.spin.z * dt;
    // 벽
    if (!f.wall && c.root.position.z + 0.5 >= BACKWALL.z && Math.abs(c.root.position.x) < BACKWALL.halfW && c.root.position.y < BACKWALL.h) {
      f.wall = true;
      c.root.position.z = BACKWALL.z - 0.5;
      f.vel.set(f.vel.x * 0.25, Math.min(0, f.vel.y) * 0.2, -Math.abs(f.vel.z) * 0.1);
      f.spin.multiplyScalar(0.15);
      onImpact?.(c.root.position.clone(), 'wall');
    }
    // 바닥
    if (c.root.position.y <= 0) {
      c.root.position.y = 0;
      if (Math.abs(f.vel.y) > 2.5) { f.vel.y = -f.vel.y * 0.3; onImpact?.(c.root.position.clone(), 'ground'); } else f.vel.y = 0;
      f.vel.x *= 0.55; f.vel.z *= 0.55;
      f.spin.multiplyScalar(0.5);
      if (f.vel.lengthSq() < 0.3) { f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); c.root.rotation.x += (-Math.PI / 2 - c.root.rotation.x) * Math.min(1, dt * 6); }
    }
    // 버둥버둥
    resetPose(c);
    const w = f.vel.lengthSq() > 0.3 ? 1 : 0.15;
    c.arms[0].rotation.x = Math.sin(now / 45) * 2.2 * w - 1.5; c.arms[1].rotation.x = Math.cos(now / 50) * 2.2 * w - 1.5;
    c.arms[0].rotation.z = 0.6; c.arms[1].rotation.z = -0.6;
    c.legs[0].rotation.x = Math.sin(now / 55) * 1.2 * w; c.legs[1].rotation.x = -Math.sin(now / 55) * 1.2 * w;
  }
  const flyers3 = () => [batter, catcher, umpire];
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ffe14d' }));
    stars.add(st);
  }
  stars.visible = false;
  scene.add(stars);

  function spawnFlyer(parts, vel, spin) {
    const g = new THREE.Group();
    const anchor = new THREE.Vector3();
    parts[0].getWorldPosition(anchor);
    const q = new THREE.Quaternion();
    parts[0].getWorldQuaternion(q);
    g.position.copy(anchor);
    g.quaternion.copy(q);
    for (const src of parts) {
      const m = src.clone();
      const wp = new THREE.Vector3(); src.getWorldPosition(wp);
      const wq = new THREE.Quaternion(); src.getWorldQuaternion(wq);
      m.position.copy(wp.sub(anchor).applyQuaternion(q.clone().invert()));
      m.quaternion.copy(q.clone().invert().multiply(wq));
      m.scale.copy(src.getWorldScale(new THREE.Vector3()));
      m.material = src.material.clone();
      m.material.transparent = false; m.material.opacity = 1; m.material.depthWrite = true;
      g.add(m);
    }
    scene.add(g);
    flyers.push({ g, vel, spin, age: 0 });
  }

  function setTeams({ batting, fielding }) {
    teams = { batting, fielding };
    const fc = new THREE.Color(TEAM_COLORS[fielding]), bc = new THREE.Color(TEAM_COLORS[batting]);
    for (const c of [pitcher, catcher, ...Object.values(fielders)]) c.teamMats.forEach((m) => m.color.copy(fc));
    for (const c of [batter, ...runners]) c.teamMats.forEach((m) => m.color.copy(bc));
  }

  function resetField() {
    knock = null; cele = null; stomp = null; stars.visible = false;
    for (const c of flyers3()) {
      c.fly = null;
      c.root.position.copy(c.basePos);
      c.root.rotation.copy(c.baseRot);
      c.cap.visible = true; c.brim.visible = true;
    }
    batter.root.position.copy(BATTER_HOME);
    batter.cap.visible = true; batter.brim.visible = true;
    if (batter.bat) batter.bat.visible = true;
    for (const f of Object.values(fielders)) { f.root.position.copy(f.home); faceHome(f); f.target = null; }
    chasing = [];
    swingAnim = null;
    gloveTarget = null;
  }

  function showBases(bases) {
    runners.forEach((r, i) => {
      r.runPath = null;
      if (i < 3 && bases[i]) {
        r.root.visible = true;
        r.root.position.copy(BASE_PATH[i + 1]).add(new THREE.Vector3(i === 0 ? -1.2 : 0, 0, i === 1 ? 1 : 0));
        faceHome(r);
      } else r.root.visible = false;
    });
  }

  // 주자 이동: before/after 베이스, 득점 수 → 높은 베이스부터 짝지어 이동
  function animateRunners(before, after, runs) {
    const from = [];
    for (let i = 2; i >= 0; i--) if (before[i]) from.push(i);
    from.push(-1); // 타자
    const to = [];
    for (let k = 0; k < runs; k++) to.push(3);
    for (let i = 2; i >= 0; i--) if (after[i]) to.push(i);
    runners.forEach((r) => { r.root.visible = false; r.runPath = null; });
    from.forEach((b, idx) => {
      const r = runners[idx];
      const start = b === -1 ? new THREE.Vector3(-1.15, 0, 0.05) : BASE_PATH[b + 1].clone();
      r.root.position.copy(start);
      r.root.visible = true;
      if (idx >= to.length) { r.fade = 1; r.runPath = null; return; } // 아웃된 주자
      const dest = to[idx];
      const pts = [start];
      for (let k = Math.max(0, b + 1); k <= dest; k++) pts.push(BASE_PATH[k + 1].clone());
      r.runPath = { pts, i: 1, done: dest === 3 };
      r.fade = 0;
    });
    batter.root.visible = false;
  }

  return {
    pitcher, batter, catcher, umpire, fielders, runners,
    setTeams, resetField, showBases, animateRunners,
    setGhosts(view) {
      pitcher.root.visible = view !== 'pitcher';
      catcher.root.visible = view !== 'batter';
      umpire.root.visible = view !== 'batter';
      setGhost(catcher, view === 'pitcher');
      setGhost(umpire, view === 'pitcher');
      setGhost(batter, view === 'batter');
    },
    playWindup(durMs, startAt = performance.now()) { pitchAnim = { start: startAt, dur: durMs }; },
    playSwing(atNow) { swingAnim = { start: atNow }; },
    setGlove(target) { gloveTarget = target ? new THREE.Vector3(target.x, target.y, target.z) : null; },
    showBatter(on) { batter.root.visible = on; },
    knockBatter() {
      swingAnim = null;
      launch(batter, new THREE.Vector3(-2.5 - Math.random() * 1.5, 7 + Math.random() * 2, 8 + Math.random() * 3), new THREE.Vector3(-6, 3, 9));
      knock = { start: performance.now(), stars: true };
    },
    launchAll() {
      swingAnim = null;
      const r = () => Math.random();
      launch(batter, new THREE.Vector3(-3 - r() * 2, 8 + r() * 3, 9 + r() * 4), new THREE.Vector3(-7, 4, 10));
      launch(catcher, new THREE.Vector3(1 + r() * 2, 9 + r() * 3, 11 + r() * 4), new THREE.Vector3(9, -3, -8));
      launch(umpire, new THREE.Vector3(2.5 + r() * 2, 10 + r() * 3, 12 + r() * 4), new THREE.Vector3(-8, 5, 12));
    },
    onImpact(fn) { onImpact = fn; },
    batFlip() {
      if (!batter.bat || !batter.bat.visible) return;
      spawnFlyer(batter.bat.children, new THREE.Vector3(-1.2, 8, 1.5), new THREE.Vector3(2, 1, 16));
      batter.bat.visible = false;
    },
    celebrate() { cele = { start: performance.now() }; },
    stomp() { stomp = { start: performance.now() }; },
    runFielderTo(pos, ms) {
      // 가장 가까운 수비수 1~2명 달려감
      const list = Object.values(fielders).sort((a, b) => a.root.position.distanceToSquared(pos) - b.root.position.distanceToSquared(pos));
      chasing = list.slice(0, 2).map((f) => { f.target = new THREE.Vector3(pos.x, 0, pos.z); return f; });
    },
    update(dt, now) {
      const t = now / 1000;
      // 투수
      if (pitchAnim) {
        const p = (now - pitchAnim.start) / pitchAnim.dur;
        pitcherPose(pitcher, Math.min(p, 1.25));
        if (p > 2.2) pitchAnim = null;
      } else pitcherPose(pitcher, 0);
      if (cele) {
        const k = (now - cele.start) / 1000;
        if (k > 1.4) { cele = null; pitcher.root.position.y = 0.25; }
        else {
          pitcher.root.position.y = 0.25 + Math.abs(Math.sin(k * Math.PI * 2.2)) * 0.45;
          pitcher.arms[1].rotation.x = -2.9; pitcher.arms[1].rotation.z = -0.3;
          pitcher.arms[0].rotation.x = -1.2 + Math.sin(k * 18) * 0.5;
        }
      }
      for (let i = flyers.length - 1; i >= 0; i--) {
        const fl = flyers[i];
        fl.age += dt;
        fl.vel.y -= 9.8 * dt;
        fl.g.position.addScaledVector(fl.vel, dt);
        fl.g.rotation.x += fl.spin.x * dt; fl.g.rotation.y += fl.spin.y * dt; fl.g.rotation.z += fl.spin.z * dt;
        if (fl.g.position.y < 0.08) { fl.g.position.y = 0.08; fl.vel.y *= -0.35; fl.vel.x *= 0.6; fl.vel.z *= 0.6; fl.spin.multiplyScalar(0.5); }
        if (fl.age > 3.5) { scene.remove(fl.g); flyers.splice(i, 1); }
      }
      // 타자
      for (const c of flyers3()) if (c.fly) updateFly(c, dt, now);
      if (knock && knock.stars) {
        const k = (now - knock.start) / 1000;
        stars.visible = k > 0.9 && k < 3.2 && batter.fly && batter.fly.vel.lengthSq() < 4;
        if (stars.visible) {
          const hp = new THREE.Vector3(); batter.head.getWorldPosition(hp);
          stars.position.copy(hp).add(new THREE.Vector3(0, 0.5, 0));
          stars.children.forEach((s, i) => { const a = now / 180 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.35, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.35); s.rotation.y = a * 2; });
        }
      } else if (batter.fly) {
        // 날아가는 중 (위에서 처리)
      } else if (knock) {
        const k = (now - knock.start) / 1000;
        resetPose(batter);
        const fly = Math.min(1, k / 0.45);
        const e = 1 - Math.pow(1 - fly, 2);
        const up = k < 1.6 ? 1 : Math.max(0, 1 - (k - 1.6) / 0.5);
        batter.root.position.set(BATTER_HOME.x - 1.0 * e * up, Math.sin(Math.PI * fly) * 0.55 * (k < 0.45 ? 1 : 0), BATTER_HOME.z);
        batter.hips.rotation.x = -1.45 * e * up;
        batter.hips.position.y = 0.82 - 0.45 * e * up;
        batter.arms[0].rotation.x = -2.6 * e * up + Math.sin(now / 60) * 0.4 * (k < 0.5 ? 1 : 0);
        batter.arms[1].rotation.x = -2.4 * e * up;
        batter.legs[0].rotation.x = -0.9 * e * up; batter.legs[1].rotation.x = -0.4 * e * up;
        stars.visible = k > 0.35 && k < 1.7;
        if (stars.visible) {
          const hp = new THREE.Vector3(); batter.head.getWorldPosition(hp);
          stars.position.copy(hp).add(new THREE.Vector3(0, 0.45, 0));
          stars.children.forEach((s, i) => { const a = now / 180 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.35, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.35); s.rotation.y = a * 2; });
        }
        if (k > 2.2) { knock = null; stars.visible = false; batter.root.position.copy(BATTER_HOME); }
      } else if (stomp && now - stomp.start < 1200) {
        batterPose(batter, -1);
        const k = (now - stomp.start) / 1000;
        batter.root.position.y = Math.abs(Math.sin(k * Math.PI * 4)) * 0.18;
        batter.torso.rotation.z = Math.sin(k * 20) * 0.15;
      } else if (swingAnim) batterPose(batter, (now - swingAnim.start) / 260 + 0.45);
      else { batterPose(batter, -1); if (!knock) batter.root.position.y = 0; }
      if (swingAnim && now - swingAnim.start > 1800) swingAnim = null;
      if (!catcher.fly) catcherPose(catcher, gloveTarget);
      if (!umpire.fly) idlePose(umpire, t, 0.6);
      // 수비수
      for (const f of Object.values(fielders)) {
        if (f.target) {
          const d = f.target.clone().sub(f.root.position); d.y = 0;
          const L = d.length();
          if (L > 0.6) {
            d.normalize();
            f.root.position.addScaledVector(d, Math.min(L, 8.5 * dt));
            f.root.rotation.y = Math.atan2(d.x, d.z);
            runPose(f, t, 1.1);
          } else idlePose(f, t, 0.3);
        } else idlePose(f, t, 0.8);
      }
      // 주자
      for (const r of runners) {
        if (!r.root.visible) continue;
        if (r.fade > 0) {
          r.fade -= dt * 0.8;
          r.root.position.y = 0;
          r.root.scale.setScalar(Math.max(0.01, r.fade));
          if (r.fade <= 0) { r.root.visible = false; r.root.scale.setScalar(1); }
          continue;
        }
        r.root.scale.setScalar(1);
        if (r.runPath && r.runPath.i < r.runPath.pts.length) {
          const tgt = r.runPath.pts[r.runPath.i];
          const d = tgt.clone().sub(r.root.position); d.y = 0;
          const L = d.length();
          const step = 8.5 * dt;
          if (L <= step) { r.root.position.copy(tgt); r.runPath.i++; }
          else { d.normalize(); r.root.position.addScaledVector(d, step); r.root.rotation.y = Math.atan2(d.x, d.z); }
          runPose(r, t);
          if (r.runPath.i >= r.runPath.pts.length && r.runPath.done) { r.fade = 1; }
        } else idlePose(r, t, 0.4);
      }
    },
  };
}
