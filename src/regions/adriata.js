// Adriata: the Summer Court's harbor at golden hour. White stone, blue water, nets on frames,
// the palace on its island across the bay.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { house, box, boat, torch, column, waterPlane, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function adriata(ctx) {
  const sunDir = new THREE.Vector3(-0.2, 0.16, 0.95).normalize(); // low over the sea
  const R = makeRegion('adriata', 'Adriata', {
    sky: 'golden', sunDir, sunColor: 0xffc08a, sunIntensity: 3.0, hemi: [0x8aa8d0, 0x6a5040, 0.7],
    fog: [0xc8a088, 0.0014], hdr: 'venice_sunset_1k', envIntensity: 0.8, exposure: 0.72,
    lightColor: 0xffb070, lightIntensity: 6,
  });
  const QUAY = 1.6;
  const land = (x, z) => QUAY + Math.max(0, -z - 6) * 0.14;
  const onPier = (x, z) => [[-30, 2.5], [10, 2.5], [45, 2.5]].some(([px, hw]) => Math.abs(x - px) < hw && z > 0 && z < 36);
  R.ground = (x, z) => {
    if (Math.abs(x) > 160 || z < -160 || z > 400) return null;
    if (z < 0) return land(x, z);
    if (onPier(x, z)) return QUAY;
    return null;
  };
  R.water = { y: 0.2, bounds: [-150, 150, 2, 300] };
  R.safeGround = (p) => v3(p.x, QUAY, -3);
  waterPlane(R.root, { size: 900, y: 0.2, z: 200, sunDir, sunColor: 0xffd0a0, color: 0x0a3a48, distortion: 3.0 }).then((w) => {
    R.waterObj = w;
    R.updaters.push((dt, t) => { w.material.uniforms.time.value = t * 0.5; });
  });
  // the town: a stepped slope of white stone
  const slope = new THREE.PlaneGeometry(320, 160, 80, 40).rotateX(-Math.PI / 2);
  const sp = slope.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, land(sp.getX(i), sp.getZ(i) - 80));
  slope.computeVertexNormals();
  const slopeMesh = new THREE.Mesh(slope, pbr('setts', { repeat: [100, 50], color: 0xd8c8b0 }));
  slopeMesh.position.z = -80; slopeMesh.receiveShadow = true; R.root.add(slopeMesh);
  box(R.root, [320, QUAY + 2, 2], [0, QUAY / 2 - 1, -1], pbr('ashlar', { repeat: [60, 1], color: 0xe0d8c8 }));
  for (const [px] of [[-30], [10], [45]]) {
    box(R.root, [5, 0.4, 36], [px, QUAY - 0.2, 18], pbr('timber', { repeat: [1, 8] }));
    for (let z = 2; z < 36; z += 4) for (const s of [-2.2, 2.2]) box(R.root, [0.3, QUAY + 3, 0.3], [px + s, (QUAY - 3) / 2, z], pbr('timber'));
  }

  const r = rand(71);
  for (let row = 0; row < 6; row++) {
    let x = -150;
    while (x < 150) {
      const w = 6 + r() * 6, d = 8, h = 6 + r() * 6;
      const z = -10 - row * 16 - r() * 3;
      if (!(row === 0 && Math.abs(x + w / 2) < 8)) {
        house(R.root, R.colliders, { x: x + w / 2, z, y: land(x, z) - 0.2, w, d, h, facing: 0, wall: 'plaster', wallColor: 0xf4ece0, roof: 'slate', roofKind: 'flat', lit: 0.3, litColor: 0xffc080, seed: (x * 13 + row) | 0 });
        // blue shutters, the Summer Court's colour
        if (r() < 0.7) box(R.root, [0.5, 1.6, 0.06], [x + w / 2 - 1.1, land(x, z) + 1.7, z + d / 2 + 0.06], plain(0x1a4a7a, 0.6));
      }
      x += w + 1 + r() * 2;
    }
  }
  // boats along the piers
  for (let i = 0; i < 10; i++) {
    const b = boat(R.root, { x: -40 + i * 10 + r() * 3, z: 10 + r() * 22, y: 0.1, rotY: r() * 0.4 - 0.2 + Math.PI / 2, len: 5 + r() * 3 });
    R.updaters.push((dt, t) => { b.position.y = 0.05 + Math.sin(t * 1.1 + i) * 0.06; b.rotation.z = Math.sin(t * 0.8 + i) * 0.03; });
  }
  // the palace on its island
  const island = new THREE.Mesh(new THREE.CylinderGeometry(40, 55, 8, 40), pbr('granite', { repeat: [8, 2], color: 0xb8a890 }));
  island.position.set(30, 0, 260); R.root.add(island);
  const palMat = pbr('marble', { repeat: [4, 4] });
  for (const [dx, dz, w, h] of [[0, 0, 40, 18], [-18, 10, 12, 26], [18, 10, 12, 26]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 24), palMat); b.position.set(30 + dx, 4 + h / 2, 260 + dz); b.castShadow = true; R.root.add(b);
  }
  const domeM = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), plain(0x2a6a8a, 0.3, { metalness: 0.6 }));
  domeM.position.set(30, 22, 260); R.root.add(domeM);

  // the net quay: frames of torn nets after the storm
  R.nets = [];
  for (let i = 0; i < 5; i++) {
    const x = -70 + i * 9, z = -3.5;
    box(R.root, [0.15, 3, 0.15], [x - 2, QUAY + 1.5, z], pbr('timber'));
    box(R.root, [0.15, 3, 0.15], [x + 2, QUAY + 1.5, z], pbr('timber'));
    box(R.root, [4.2, 0.15, 0.15], [x, QUAY + 3, z], pbr('timber'));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6, 24, 16), new THREE.MeshStandardMaterial({ color: 0x8a7a60, wireframe: true }));
    net.position.set(x, QUAY + 1.6, z); R.root.add(net);
    R.nets.push({ pos: v3(x, QUAY, z + 1.5), net, tears: 3, mended: 0 });
  }
  for (let x = -140; x < 140; x += 18) torch(R.root, R.lanternSpots, { x, z: -2, y: QUAY, h: 2.6 });

  R.named.tarquin = person(R, look('tarquin'), 20, -30, Math.PI);
  R.named.netmender = person(R, look('sailor', { shirt: 0x8a8070 }), -66, -4.5, Math.PI);
  for (let i = 0; i < 16; i++) {
    const p = person(R, look('sailor', { shirt: [0xd8d0c0, 0x3a5a6a, 0xe8e0d0][i % 3], skin: [0x8a5a3a, 0x6a4028, 0xb07a58][i % 3] }), -120 + r() * 240, -4 - r() * 20, r() * 6);
    route(p, [[-120 + r() * 240, -3 - r() * 4], [-120 + r() * 240, -6 - r() * 20], [-120 + r() * 240, -3 - r() * 3]]);
  }

  R.spawn = { pos: v3(0, QUAY, -5), heading: 0 };
  Object.assign(R.marks, { adriata_quay: v3(-60, QUAY, -2) });
  R.places = {
    quay: { pos: v3(-60, QUAY, -2), heading: 0 },
    hall: { pos: v3(20, 0, -26), heading: Math.PI },
    shot: { pos: v3(10, QUAY, 24), heading: Math.PI + 0.25, yaw: 0.35, pitch: 0.1 },
  };
  return R;
}
