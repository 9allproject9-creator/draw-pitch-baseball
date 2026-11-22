import * as THREE from 'three';
import { HIT_ZONE, ZONE } from '/shared/constants.js';

const COLORS = ['#ff5a36', '#ffd23f', '#2f7dff', '#7ae582', '#ff8fb1', '#ffffff'].map((c) => new THREE.Color(c));

export function createEffects(scene) {
  const bursts = [];

  function burst(origin, { count = 160, speed = 14, size = 0.6, gravity = 6, life = 2.2, spread = 1 } = {}) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), c = new Float32Array(count * 3), v = [];
    for (let i = 0; i < count; i++) {
      p.set([origin.x, origin.y, origin.z], i * 3);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3 * (1 - spread), Math.random() - 0.5).normalize();
      v.push(dir.multiplyScalar(speed * (0.5 + Math.random() * 0.5)));
      const col = COLORS[Math.floor(Math.random() * COLORS.length)];
      c.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    bursts.push({ pts, v, life, age: 0, gravity });
  }

  // 타격 구역 링
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color: '#fff36b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.position.set(0, (ZONE.yMin + ZONE.yMax) / 2, HIT_ZONE.ideal);
  scene.add(ring);
  let ringOn = false, ringA = 0;

  // 스트라이크 존 프레임 (타자 시점에서 은은하게)
  const zoneFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(ZONE.xMax - ZONE.xMin, ZONE.yMax - ZONE.yMin)),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0 }),
  );
  zoneFrame.position.set(0, (ZONE.yMin + ZONE.yMax) / 2, 0);
  scene.add(zoneFrame);

  return {
    fireworks(pos) {
      for (let k = 0; k < 5; k++) {
        setTimeout(() => burst(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 50, 35 + Math.random() * 20, pos.z + (Math.random() - 0.5) * 30), { count: 220, speed: 16, size: 1.4, gravity: 4, life: 2.6 }), k * 280);
      }
    },
    sparks(pos) { burst(pos, { count: 60, speed: 5, size: 0.12, gravity: 9, life: 0.7 }); },
    dust(pos) { burst(pos, { count: 40, speed: 2, size: 0.25, gravity: 2, life: 0.8 }); },
    zoneRing(on) { ringOn = on; },
    zoneFrame(on) { zoneFrame.material.opacity = on ? 0.55 : 0; },
    update(dt, now) {
      ringA += ((ringOn ? 1 : 0) - ringA) * Math.min(1, dt * 14);
      ring.material.opacity = ringA * (0.6 + 0.4 * Math.sin(now / 60));
      ring.scale.setScalar(1 + 0.08 * Math.sin(now / 80));
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += dt;
        const arr = b.pts.geometry.attributes.position.array;
        for (let j = 0; j < b.v.length; j++) {
          b.v[j].y -= b.gravity * dt;
          b.v[j].multiplyScalar(1 - 0.6 * dt);
          arr[j * 3] += b.v[j].x * dt; arr[j * 3 + 1] += b.v[j].y * dt; arr[j * 3 + 2] += b.v[j].z * dt;
        }
        b.pts.geometry.attributes.position.needsUpdate = true;
        b.pts.material.opacity = Math.max(0, 1 - b.age / b.life);
        if (b.age >= b.life) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
      }
    },
  };
}
