import * as THREE from 'three';
import { RUBBER_Z, CATCHER_Z } from '/shared/constants.js';
import { BASES } from './field.js';

export const TEAM_COLORS = { home: '#ff5a36', away: '#2f7dff' };
const SKIN = ['#ffd9b3', '#f1c08f', '#d9a066', '#a8714a'];

function makeChar({ color, skin = SKIN[0], role = 'fielder' }) {
  const mats = [];
  const M = (c) => { const m = new THREE.MeshLambertMaterial({ color: c }); mats.push(m); return m; };
  const uni = M(color), capM = M(color), skinM = M(skin), pants = M('#f4f4f0'), dark = M('#1d1d24'), glove = M('#8b4a22');
  const mesh = (geo, mat, parent, pos) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.82; root.add(hips);
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(0.17 * s, 0, 0); hips.add(g);
    mesh(new THREE.CapsuleGeometry(0.15, 0.42, 4, 10), pants, g, [0, -0.36, 0]);
    mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), dark, g, [0, -0.76, 0.06]);
    return g;
  });
  const torso = new THREE.Group(); hips.add(torso);
  mesh(new THREE.CapsuleGeometry(0.36, 0.34, 6, 14), uni, torso, [0, 0.4, 0]);
  mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 14), dark, torso, [0, 0.08, 0]);
  const head = new THREE.Group(); head.position.y = 1.08; torso.add(head);
  mesh(new THREE.SphereGeometry(0.32, 18, 14), skinM, head);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.045, 8, 6), dark, head, [0.11 * s, 0.03, 0.29]);
  const cap = mesh(new THREE.SphereGeometry(0.335, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM, head, [0, 0.06, 0]);
  const brim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16, 1, false, 0, Math.PI), capM, head, [0, 0.08, 0.27]);
  brim.rotation.y = -Math.PI / 2;
  brim.scale.set(1, 1, 1.4);
  if (role === 'catcher' || role === 'umpire') {
    const mask = mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14), dark, head, [0, 0, 0.3]);
    mask.scale.set(1, 1.2, 1);
  }
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(0.46 * s, 0.62, 0); torso.add(g);
    mesh(new THREE.CapsuleGeometry(0.11, 0.36, 4, 10), uni, g, [0, -0.26, 0]);
    const hand = mesh(new THREE.SphereGeometry(0.12, 10, 8), s < 0 && role !== 'umpire' ? glove : skinM, g, [0, -0.56, 0]);
    if (s < 0 && role !== 'umpire') hand.scale.set(1.5, 1.5, 1.1);
    return g;
  });
  if (role === 'umpire') { uni.color.set('#22252f'); capM.color.set('#22252f'); pants.color.set('#6b6f7a'); }

  let bat = null;
  if (role === 'batter') {
    bat = new THREE.Group();
    const wood = M('#d9a86c');
    const b = mesh(new THREE.CylinderGeometry(0.045, 0.022, 0.95, 10), wood, bat, [0, 0.47, 0]);
    b.castShadow = true;
    torso.add(bat);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, hips, torso, head, legs, arms, bat, uni, capM, mats, role, anim: { run: 0 } };
}

function setGhost(c, on) {
  for (const m of c.mats) {
    m.transparent = on;
    m.opacity = on ? 0.28 : 1;
    m.depthWrite = !on;
  }
  c.root.traverse((o) => { if (o.isMesh) o.castShadow = !on; });
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
  const batter = add({ color: TEAM_COLORS.away, role: 'batter', skin: SKIN[2] }, new THREE.Vector3(-0.95, 0, 0.05));
  batter.root.rotation.y = Math.PI / 2;
  const catcher = add({ color: TEAM_COLORS.home, role: 'catcher', skin: SKIN[0] }, new THREE.Vector3(0, 0, CATCHER_Z + 0.25));
  catcher.root.rotation.y = Math.PI;
  const umpire = add({ color: '#22252f', role: 'umpire', skin: SKIN[3] }, new THREE.Vector3(0.15, 0, CATCHER_Z + 1.3));
  umpire.root.rotation.y = Math.PI;

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

  function setTeams({ batting, fielding }) {
    teams = { batting, fielding };
    const fc = new THREE.Color(TEAM_COLORS[fielding]), bc = new THREE.Color(TEAM_COLORS[batting]);
    for (const c of [pitcher, catcher, ...Object.values(fielders)]) { c.uni.color.copy(fc); c.capM.color.copy(fc); }
    for (const c of [batter, ...runners]) { c.uni.color.copy(bc); c.capM.color.copy(bc); }
  }

  function resetField() {
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
      const start = b === -1 ? new THREE.Vector3(-0.95, 0, 0.05) : BASE_PATH[b + 1].clone();
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
      setGhost(batter, view === 'batter');
    },
    playWindup(durMs, startAt = performance.now()) { pitchAnim = { start: startAt, dur: durMs }; },
    playSwing(atNow) { swingAnim = { start: atNow }; },
    setGlove(target) { gloveTarget = target ? new THREE.Vector3(target.x, target.y, target.z) : null; },
    showBatter(on) { batter.root.visible = on; },
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
      // 타자
      if (swingAnim) batterPose(batter, (now - swingAnim.start) / 260 + 0.45);
      else batterPose(batter, -1);
      if (swingAnim && now - swingAnim.start > 1800) swingAnim = null;
      catcherPose(catcher, gloveTarget);
      idlePose(umpire, t, 0.6);
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
