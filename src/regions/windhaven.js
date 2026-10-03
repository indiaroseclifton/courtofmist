// Windhaven: Illyrian war camp on a high steppe; wind, hide tents, cook smoke, a training ring,
// Emerie's shop, a sheep pass to the east and the black peak of Ramiel to the north.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { terrain, hills, forest, house, tent, torch, box, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';
import { fbm } from '../world/textures.js';

export function windhaven(ctx) {
  const sunDir = new THREE.Vector3(0.7, 0.32, 0.35).normalize();
  const R = makeRegion('windhaven', 'Windhaven', {
    sky: 'afternoon', sunDir, sunColor: 0xffe2b8, sunIntensity: 2.4, hemi: [0x9ab0c8, 0x4a3e30, 0.7],
    fog: [0xa8b4c0, 0.0028], hdr: 'quarry_01_1k', envIntensity: 0.8, exposure: 0.85,
    lightColor: 0xffa050, lightIntensity: 5, weather: 'spray', weatherCount: 700,
  });
  const base = hills(10, 1 / 260, 31);
  const ground = (x, z) => {
    let y = base(x, z);
    const d = Math.hypot(x, z);
    y += Math.max(0, d - 160) * 0.6 * (0.6 + fbm(x / 400 + 3, z / 400 + 3, 4, 4, 2)); // peaks ring the steppe
    // Ramiel: a lone dark peak to the north
    const rd = Math.hypot(x - 10, z + 230);
    y += Math.max(0, 140 - rd) * 1.3;
    // the sheep pass: a valley cut east
    if (x > 90) y -= Math.max(0, 30 - Math.abs(z - 20)) * 0.6 * Math.min(1, (x - 90) / 40);
    return y * Math.min(1, 0.25 + d / 120);
  };
  R.ground = (x, z) => (Math.abs(x) > 300 || Math.abs(z) > 300 ? null : ground(x, z));
  terrain(R.root, { size: 600, seg: 240, height: ground, material: pbr('grass', { repeat: [110, 110], color: 0xb8b0a0 }) });
  // bare rock and snow on the high ground, laid over the turf
  const rockLayer = terrain(R.root, { size: 600, seg: 160, height: (x, z) => ground(x, z) + 0.05, material: pbr('granite', { repeat: [80, 80] }) });
  rockLayer.material = rockLayer.material.clone();
  rockLayer.material.transparent = false;
  rockLayer.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vH < 22.0) discard;');
  };

  // the camp
  const r = rand(51);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 20 + r() * 45;
    const x = Math.cos(a) * d, z = Math.sin(a) * d + 10;
    if (Math.hypot(x, z) < 16) continue;
    tent(R.root, R.colliders, { x, z, y: ground(x, z) - 0.1, r: 2 + r(), h: 2.6 + r(), rotY: r() * 6, color: [0x8a7a62, 0x6a5a48, 0x9a8a70][i % 3] });
    if (r() < 0.4) torch(R.root, R.lanternSpots, { x: x + 3, z: z + 2, y: ground(x + 3, z + 2), h: 0.3, brazier: true, smoke: R.smokeSpots });
  }

  // the training ring: packed earth inside a ring of posts
  const RC = v3(0, ground(0, 0), 0);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(12, 48).rotateX(-Math.PI / 2), pbr('mud', { repeat: [4, 4] }));
  ring.position.set(0, RC.y + 0.05, 0); ring.receiveShadow = true; R.root.add(ring);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    box(R.root, [0.25, 1.4, 0.25], [Math.cos(a) * 12, RC.y + 0.7, Math.sin(a) * 12], pbr('timber'));
  }

  // the village edge: Emerie's shop and a row of stone houses
  const VX = -60, VZ = 40;
  house(R.root, R.colliders, { x: VX, z: VZ, y: ground(VX, VZ), w: 8, d: 7, h: 4.5, facing: Math.PI / 2, wall: 'ashlar', roof: 'slate', lit: 0.6, seed: 61, smokeSpots: R.smokeSpots });
  for (let i = 1; i < 5; i++) house(R.root, R.colliders, { x: VX - 2, z: VZ + i * 11, y: ground(VX - 2, VZ + i * 11), w: 7, d: 7, h: 4, facing: Math.PI / 2, wall: 'ashlar', roof: 'slate', lit: 0.4, seed: 61 + i, smokeSpots: R.smokeSpots });
  R.shopCounter = v3(VX + 4.6, ground(VX + 4.6, VZ), VZ);
  box(R.root, [1, 1, 3], [VX + 5, ground(VX + 5, VZ) + 0.5, VZ], pbr('oak'), R.colliders);

  // the sheep pass to the east, and a pen at its mouth
  R.pass = { mouth: v3(70, 0, 20), far: v3(200, 0, 20) };
  R.pen = v3(55, ground(55, 32), 32);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i === 0) continue; // the gate faces the pass
    box(R.root, [0.15, 1.1, 2.3], [R.pen.x + Math.cos(a) * 6, R.pen.y + 0.55, R.pen.z + Math.sin(a) * 6], pbr('timber'), null, -a);
  }
  // Ramiel's foot: the Blood Rite begins here and ends at the cairn on the summit
  R.ramiel = { foot: v3(10, 0, -110), summit: v3(10, 0, -230) };
  R.ramiel.foot.y = ground(10, -110); R.ramiel.summit.y = ground(10, -230);
  const cairn = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.5, 7), pbr('granite'));
  cairn.position.set(10, R.ramiel.summit.y + 1.2, -230); R.root.add(cairn);
  forest(R.root, { kind: 'pine', count: 300, area: [-280, 280, -280, 280], ground, seed: 33, avoid: (x, z) => Math.hypot(x, z) < 90 || ground(x, z) > 40 || (x > 60 && Math.abs(z - 20) < 30) });

  // Illyrians: warriors at the ring, the females whose wings were clipped working at the tents
  R.named.cassian = person(R, look('cassian'), 4, 4, -0.8);
  R.named.emerie = person(R, look('emerie'), VX + 6, VZ + 1, -Math.PI / 2);
  R.clipped = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 22 + r() * 35;
    const p = person(R, look('emerie', { shirt: [0x5a4a3a, 0x4a3e30, 0x6a5848][i % 3], hair: [0x1a120c, 0x2a1a10, 0x101010][i % 3], height: 1.62 + r() * 0.12 }), Math.cos(a) * d, Math.sin(a) * d + 10, r() * 6);
    p.clipped = i % 3 !== 2; // not all of them; the ledger is for counting honestly
    R.clipped.push(p);
  }
  for (let i = 0; i < 10; i++) {
    const p = person(R, look('illyrian', { height: 1.85 + r() * 0.15 }), (r() - 0.5) * 30, (r() - 0.5) * 30, r() * 6);
    route(p, [[(r() - 0.5) * 20, (r() - 0.5) * 20], [(r() - 0.5) * 20, (r() - 0.5) * 20]]);
  }
  R.named.quartermaster = person(R, look('illyrian', { shirt: 0x4a3a2a }), -14, 22, 0.5);
  R.named.shepherd = person(R, look('villager', { height: 1.4, shirt: 0x6a5a48 }), 62, 24, Math.PI / 2);

  R.spawn = { pos: v3(0, 0, 18), heading: Math.PI };
  Object.assign(R.marks, { windhaven_ring: v3(0, 0, 14), emerie_shop: v3(VX + 8, 0, VZ) });
  R.places = {
    ring: { pos: v3(0, 0, 9), heading: Math.PI },
    shop: { pos: v3(VX + 8, 0, VZ), heading: -Math.PI / 2 },
    pass: { pos: v3(66, 0, 22), heading: Math.PI / 2 },
    ramiel: { pos: R.ramiel.foot.clone(), heading: Math.PI },
    shot: { pos: v3(-6, 0, 26), heading: Math.PI - 0.3, yaw: -0.25, pitch: 0.1 },
  };
  for (const m of Object.values(R.marks)) m.y = ground(m.x, m.z);
  return R;
}
