import * as THREE from 'three';
import { PITCH_CAM, PITCH_CAM_TARGET, BAT_CAM, BAT_CAM_TARGET, BOX } from '/shared/constants.js';

const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

const VIEWS = {
  pitcher: { pos: v3(PITCH_CAM), target: v3(PITCH_CAM_TARGET) },
  batter: { pos: v3(BAT_CAM), target: v3(BAT_CAM_TARGET) },
  overview: { pos: new THREE.Vector3(-26, 22, 26), target: new THREE.Vector3(0, 0, -30) },
  lobby: { pos: new THREE.Vector3(30, 9, 18), target: new THREE.Vector3(0, 2, -30) },
};

export function createStage(container) {
  const isMobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  camera.position.copy(VIEWS.lobby.pos);
  camera.lookAt(VIEWS.lobby.target);

  const curTarget = VIEWS.lobby.target.clone();
  let viewName = 'lobby';
  let trans = null; // {fromPos, fromTarget, toPos, toTarget, t, dur}
  let follow = null;
  const frameCbs = [];
  const resizeCbs = [];
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let width = 1, height = 1;

  function fitFov() {
    const aspect = width / height;
    let fov = 50;
    if (viewName === 'pitcher') {
      // BOX 네 모서리가 화면 안 (여백 포함)에 들어오도록
      const tmp = new THREE.PerspectiveCamera(50, aspect, 0.1, 900);
      tmp.position.copy(VIEWS.pitcher.pos);
      tmp.lookAt(VIEWS.pitcher.target);
      tmp.updateMatrixWorld();
      const inv = tmp.matrixWorldInverse;
      let needV = 0;
      for (const [x, y] of [[BOX.xMin, BOX.yMin], [BOX.xMax, BOX.yMin], [BOX.xMin, BOX.yMax], [BOX.xMax, BOX.yMax]]) {
        const c = new THREE.Vector3(x, y, 0).applyMatrix4(inv);
        const ay = Math.atan(Math.abs(c.y) / -c.z);
        const ax = Math.atan(Math.tan(Math.atan(Math.abs(c.x) / -c.z)) / aspect);
        needV = Math.max(needV, ay, ax);
      }
      const marginTop = 1.22; // 위쪽 HUD 공간
      fov = THREE.MathUtils.radToDeg(Math.atan(Math.tan(needV) * marginTop) * 2);
      fov = Math.max(fov, 8);
    } else if (viewName === 'batter') {
      const hf = THREE.MathUtils.degToRad(46);
      fov = Math.max(44, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / aspect)));
    } else {
      const hf = THREE.MathUtils.degToRad(60);
      fov = Math.max(50, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / aspect)));
    }
    camera.fov = Math.min(fov, 100);
    camera.updateProjectionMatrix();
  }

  function resize() {
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = width + 'px';
    renderer.domElement.style.height = height + 'px';
    camera.aspect = width / height;
    fitFov();
    for (const cb of resizeCbs) cb(width, height);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  function setView(name, { instant = false, duration = 0.7 } = {}) {
    follow = null;
    viewName = name;
    const v = VIEWS[name];
    fitFov();
    if (instant) {
      trans = null;
      camera.position.copy(v.pos);
      curTarget.copy(v.target);
      camera.lookAt(curTarget);
      return;
    }
    trans = { fromPos: camera.position.clone(), fromTarget: curTarget.clone(), toPos: v.pos.clone(), toTarget: v.target.clone(), t: 0, dur: duration };
  }

  function followTarget(obj) {
    follow = obj;
    if (obj) { viewName = 'follow'; trans = null; fitFov(); }
  }

  const isSettled = () => !trans && !follow;

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (trans) {
      trans.t += dt / trans.dur;
      const k = trans.t >= 1 ? 1 : 1 - Math.pow(1 - trans.t, 3);
      camera.position.lerpVectors(trans.fromPos, trans.toPos, k);
      curTarget.lerpVectors(trans.fromTarget, trans.toTarget, k);
      if (trans.t >= 1) { camera.position.copy(trans.toPos); curTarget.copy(trans.toTarget); trans = null; }
    } else if (follow) {
      const p = follow.position;
      const desired = new THREE.Vector3(p.x * 0.55, Math.max(7, p.y * 0.6 + 6), p.z * 0.55 + 16);
      camera.position.lerp(desired, 1 - Math.pow(0.02, dt));
      curTarget.lerp(p, 1 - Math.pow(0.0005, dt));
    }
    camera.lookAt(curTarget);
    for (const cb of frameCbs) cb(dt, now);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  const ndc = (px, py) => new THREE.Vector2((px / width) * 2 - 1, -(py / height) * 2 + 1);

  return {
    renderer, scene, camera, isMobile,
    get view() { return viewName; },
    get size() { return { width, height }; },
    setView, followTarget, isSettled,
    plateRayFromScreen(px, py) {
      raycaster.setFromCamera(ndc(px, py), camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return { x: hit.x, y: hit.y };
    },
    screenRayDir(px, py) {
      raycaster.setFromCamera(ndc(px, py), camera);
      const d = raycaster.ray.direction;
      return { x: d.x, y: d.y, z: d.z };
    },
    projectToScreen(p) {
      const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
      return { px: (v.x + 1) / 2 * width, py: (1 - v.y) / 2 * height, behind: v.z > 1 };
    },
    onFrame(cb) { frameCbs.push(cb); },
    onResize(cb) { resizeCbs.push(cb); },
    start() { resize(); requestAnimationFrame((t) => { last = t; loop(t); }); },
    resize,
  };
}
