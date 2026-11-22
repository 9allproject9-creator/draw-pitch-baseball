import * as THREE from 'three';
import { RUBBER_Z } from '/shared/constants.js';

const D45 = Math.PI / 4;
export const BASES = {
  home: new THREE.Vector3(0, 0, 0),
  first: new THREE.Vector3(19.4, 0, -19.4),
  second: new THREE.Vector3(0, 0, -38.8),
  third: new THREE.Vector3(-19.4, 0, -19.4),
};
// 각도 θ (0 = 중견수 방향, + = 1루 쪽) 에서 펜스 거리
export const fenceRadius = (theta) => 100 + 22 * Math.cos(2 * theta);
export const FENCE_H = 3.2;

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#3f9d4a' : '#4aad55';
    g.fillRect(0, i * 32, 512, 32);
  }
  // 잔디 노이즈
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.5;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c48a5a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(120,70,40,0.25)' : 'rgba(230,180,130,0.25)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const flat = (geo, mat, y) => {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
};

export function buildField(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // 하늘
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#2c6fd6') }, mid: { value: new THREE.Color('#8fc7ff') }, bottom: { value: new THREE.Color('#ffe2b8') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.5, h)) : bottom; c = mix(bottom, c, smoothstep(-0.02, 0.12, h)); gl_FragColor = vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog('#bfdcf5', 160, 520);

  // 조명
  scene.add(new THREE.HemisphereLight('#dff1ff', '#3d6b35', 1.1));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(-30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 50, bottom: -50, near: 1, far: 160 });
  sun.target.position.set(0, 0, -22);
  scene.add(sun, sun.target);

  // 잔디 바닥
  root.add(flat(new THREE.CircleGeometry(260, 64), new THREE.MeshLambertMaterial({ map: stripeTexture() }), 0));

  // 내야 흙: 마운드 중심 원 (페어 지역 쪽) + 홈 원 + 베이스 주변
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTexture() });
  const infield = new THREE.Shape();
  const R = 29;
  infield.moveTo(0, 0);
  for (let a = -D45 - 0.02; a <= D45 + 0.02; a += 0.02) {
    infield.lineTo(Math.sin(a) * (R + 9), Math.cos(a) * (R + 9) * 1.0 - 0);
  }
  infield.lineTo(0, 0);
  const inf = flat(new THREE.ShapeGeometry(infield, 40), dirtMat, 0.01);
  root.add(inf);
  // 홈 주변 흙
  root.add(flat(new THREE.CircleGeometry(4.2, 40), dirtMat, 0.012));

  // 내야 잔디 (다이아몬드 안쪽)
  const gMat = new THREE.MeshLambertMaterial({ color: '#4aad55' });
  const diamond = new THREE.Shape();
  const s = 27.43 - 3.2;
  diamond.moveTo(0, 2.6);
  diamond.lineTo(s * Math.SQRT1_2 + 0.0, 2.6 + s * Math.SQRT1_2);
  diamond.lineTo(0, 2.6 + s * Math.SQRT2);
  diamond.lineTo(-s * Math.SQRT1_2, 2.6 + s * Math.SQRT1_2);
  diamond.closePath();
  const dg = flat(new THREE.ShapeGeometry(diamond), gMat, 0.02);
  root.add(dg);

  // 마운드
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.75, 0.25, 32), dirtMat);
  mound.position.set(0, 0.125, RUBBER_Z);
  mound.receiveShadow = true;
  root.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.04, 0.15), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  rubber.position.set(0, 0.27, RUBBER_Z);
  root.add(rubber);

  // 베이스
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  for (const k of ['first', 'second', 'third']) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), white);
    b.position.copy(BASES[k]).setY(0.05);
    b.rotation.y = D45;
    b.castShadow = true;
    root.add(b);
    const pad = flat(new THREE.CircleGeometry(2.6, 24), dirtMat, 0.015);
    pad.position.set(BASES[k].x, 0.015, BASES[k].z);
    root.add(pad);
  }
  // 홈플레이트 (오각형)
  const hp = new THREE.Shape();
  hp.moveTo(-0.216, 0); hp.lineTo(0.216, 0); hp.lineTo(0.216, -0.216); hp.lineTo(0, -0.43); hp.lineTo(-0.216, -0.216); hp.closePath();
  const plate = flat(new THREE.ShapeGeometry(hp), white, 0.03);
  root.add(plate);

  // 흰 선: 파울라인, 타석
  const lineMat = new THREE.MeshBasicMaterial({ color: '#f8f8f0' });
  const strip = (x1, z1, x2, z2, w = 0.08) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(x2 - x1, -(z2 - z1));
    m.position.set((x1 + x2) / 2, 0.035, (z1 + z2) / 2);
    root.add(m);
  };
  const fl = fenceRadius(D45);
  strip(0.25, -0.25, Math.sin(D45) * fl, -Math.cos(D45) * fl);
  strip(-0.25, -0.25, -Math.sin(D45) * fl, -Math.cos(D45) * fl);
  for (const side of [-1, 1]) {
    const x0 = side * 0.45, x1 = side * 1.65;
    strip(x0, -0.9, x1, -0.9, 0.06); strip(x0, 0.9, x1, 0.9, 0.06);
    strip(x0, -0.9, x0, 0.9, 0.06); strip(x1, -0.9, x1, 0.9, 0.06);
  }

  // 외야 펜스
  const fenceMat = new THREE.MeshLambertMaterial({ color: '#1f5c3a', side: THREE.DoubleSide });
  const padMat = new THREE.MeshLambertMaterial({ color: '#f2c94c' });
  const segs = 90;
  const fpos = [], fidx = [];
  for (let i = 0; i <= segs; i++) {
    const th = -D45 + (i / segs) * 2 * D45;
    const r = fenceRadius(th);
    const x = Math.sin(th) * r, z = -Math.cos(th) * r;
    fpos.push(x, 0, z, x, FENCE_H, z);
    if (i < segs) { const a = i * 2; fidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  fg.setIndex(fidx);
  fg.computeVertexNormals();
  root.add(new THREE.Mesh(fg, fenceMat));
  // 펜스 위 노란 띠
  const topPos = [];
  for (let i = 0; i <= segs; i++) {
    const th = -D45 + (i / segs) * 2 * D45;
    const r = fenceRadius(th);
    topPos.push(new THREE.Vector3(Math.sin(th) * r, FENCE_H, -Math.cos(th) * r));
  }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPos), 120, 0.12, 6), padMat);
  root.add(tube);
  // 파울폴
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 22, 8), padMat);
    pole.position.set(side * Math.sin(D45) * fl, 11, -Math.cos(D45) * fl);
    root.add(pole);
  }

  // 관중석 + 관중
  const standMat = new THREE.MeshLambertMaterial({ color: '#5b6577' });
  const crowdColors = ['#ff5a36', '#2f7dff', '#ffffff', '#ffd23f', '#ff8fb1', '#7ae582', '#222831', '#f4a261'].map((c) => new THREE.Color(c));
  const seats = [];
  const tiers = 9;
  const addStandArc = (thFrom, thTo, rFn, baseH, n) => {
    for (let t = 0; t < tiers; t++) {
      const geo = [];
      for (let i = 0; i < n; i++) {
        const th = thFrom + ((i + 0.5) / n) * (thTo - thFrom);
        const r = rFn(th) + 3 + t * 1.6;
        const y = baseH + t * 1.1;
        geo.push({ th, r, y });
        if (Math.random() < 0.82) seats.push(new THREE.Vector3(Math.sin(th) * r, y + 0.45, -Math.cos(th) * r));
      }
      const r0 = rFn((thFrom + thTo) / 2) + 3 + t * 1.6;
      const shape = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.8, r0 + 0.8, 1.1, 64, 1, true, Math.PI - thTo, thTo - thFrom), standMat);
      shape.position.y = baseH + t * 1.1 - 0.55;
      root.add(shape);
    }
  };
  addStandArc(-D45 - 0.35, D45 + 0.35, () => 128, FENCE_H + 0.5, 140);
  // 홈 뒤 관중석
  const behind = (th) => 32;
  for (let t = 0; t < tiers; t++) {
    for (let i = 0; i < 60; i++) {
      const th = Math.PI - 1.15 + (i / 59) * 2.3;
      const r = behind(th) + t * 1.6;
      if (Math.random() < 0.85) seats.push(new THREE.Vector3(Math.sin(th) * r, 1.4 + t * 1.1, -Math.cos(th) * r));
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(32 + t * 1.6, 32 + t * 1.6, 1.1, 64, 1, true, -1.15, 2.3), standMat);
    ring.position.y = 0.85 + t * 1.1;
    root.add(ring);
  }
  // 백네트
  const net = new THREE.Mesh(new THREE.CylinderGeometry(30.5, 30.5, 9, 48, 1, true, -1.0, 2.0),
    new THREE.MeshBasicMaterial({ color: '#202020', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  net.position.y = 4.5;
  root.add(net);

  const crowdGeo = new THREE.BoxGeometry(0.55, 0.9, 0.45);
  const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshLambertMaterial(), seats.length);
  const m4 = new THREE.Matrix4();
  seats.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    crowd.setMatrixAt(i, m4);
    crowd.setColorAt(i, crowdColors[Math.floor(Math.random() * crowdColors.length)]);
  });
  root.add(crowd);

  // 조명탑
  const poleMat = new THREE.MeshLambertMaterial({ color: '#8a919e' });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe6' });
  for (const th of [-1.1, -0.45, 0.45, 1.1]) {
    const r = 150;
    const x = Math.sin(th) * r, z = -Math.cos(th) * r;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 40, 8), poleMat);
    pole.position.set(x, 20, z);
    root.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.8), lampMat);
    lamp.position.set(x, 41, z);
    lamp.lookAt(0, 0, -30);
    root.add(lamp);
  }

  // 전광판 (외야 중앙 뒤)
  const board = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 1), new THREE.MeshLambertMaterial({ color: '#1b1f2a' }));
  board.position.set(0, 21, -150);
  root.add(board);

  // 관중 들썩임
  let cheer = 0;
  return {
    root,
    cheer(power = 1) { cheer = Math.max(cheer, power); },
    update(dt, now) {
      if (cheer > 0.01) {
        cheer *= Math.pow(0.35, dt);
        crowd.position.y = Math.abs(Math.sin(now / 90)) * 0.35 * cheer;
      } else crowd.position.y = 0;
    },
  };
}
