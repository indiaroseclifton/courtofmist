// Beron's forest court: a keep of dark red stone in a forest that is always turning.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { terrain, hills, forest, house, box, torch, column, arch, rand } from '../world/kit.js';
import { pbr } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function autumnForest(ctx) {
  const sunDir = new THREE.Vector3(0.6, 0.22, -0.5).normalize();
  const R = makeRegion('autumn_forest', 'The Forest Court', {
    sky: 'golden', sunDir, sunColor: 0xffb070, sunIntensity: 2.2, hemi: [0xc89a6a, 0x3a2414, 0.65],
    fog: [0xb08a62, 0.007], hdr: 'spruit_sunrise_1k', envIntensity: 0.8, exposure: 0.85,
    lightColor: 0xff9a50, lightIntensity: 8, weather: 'leaves', weatherCount: 900,
  });
  const base = hills(7, 1 / 170, 81);
  const ground = (x, z) => base(x, z) * Math.min(1, Math.hypot(x, z + 40) / 60);
  R.ground = (x, z) => (Math.abs(x) > 240 || Math.abs(z) > 240 ? null : ground(x, z));
  terrain(R.root, { size: 500, seg: 200, height: ground, material: pbr('leaves', { repeat: [80, 80] }) });

  // the keep
  const stone = pbr('ashlar', { repeat: [6, 4], color: 0xa8604a });
  const KZ = -45;
  house(R.root, R.colliders, { x: 0, z: KZ, w: 36, d: 24, h: 16, facing: 0, wall: 'ashlar', wallColor: 0xa8604a, roof: 'slate', roofKind: 'hip', lit: 0.45, litColor: 0xff9040, seed: 81, windowsOn: 'all', smokeSpots: R.smokeSpots, floorsH: 4 });
  for (const [x, z] of [[-20, KZ - 13], [20, KZ - 13], [-20, KZ + 13], [20, KZ + 13]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 26, 24), stone);
    tower.position.set(x, 13, z); tower.castShadow = true; R.root.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.8, 7, 24), pbr('slate', { repeat: [4, 2] }));
    cap.position.set(x, 29.5, z); R.root.add(cap);
  }
  arch(R.root, { x: 0, z: KZ + 26, span: 6, h: 8, depth: 2, mat: stone });
  for (const x of [-9, 9]) box(R.root, [12, 10, 2], [x, 5, KZ + 26], stone, R.colliders);
  for (const dz of [0, 8, 16]) for (const x of [-4, 4]) torch(R.root, R.lanternSpots, { x, z: KZ + 30 + dz, y: ground(x, KZ + 30 + dz), h: 2.4, brazier: true, smoke: R.smokeSpots });

  // the forest: copper and rust and gold
  forest(R.root, { kind: 'autumn', count: 900, area: [-230, 230, -230, 230], ground, seed: 82, avoid: (x, z) => Math.abs(x) < 34 && z > -75 && z < 40 });

  R.named.beron = person(R, look('beron'), 0, KZ + 14, 0);
  R.named.eris = person(R, look('eris'), 6, KZ + 18, -0.5);
  const r = rand(83);
  for (let i = 0; i < 12; i++) route(person(R, look('autumnfolk', { shirt: [0x7a3a14, 0x8a5a1a, 0x5a2a10][i % 3] }), -20 + r() * 40, -10 + r() * 40, r() * 6), [[-20 + r() * 40, -10 + r() * 40], [-20 + r() * 40, -10 + r() * 40]]);

  R.spawn = { pos: v3(0, 0, 30), heading: Math.PI };
  Object.assign(R.marks, { autumn_gate: v3(0, 0, KZ + 34) });
  R.places = {
    gate: { pos: v3(0, 0, KZ + 34), heading: Math.PI },
    hall: { pos: v3(0, 0, KZ + 20), heading: Math.PI },
    shot: { pos: v3(-8, 0, 20), heading: Math.PI + 0.25, yaw: 0.35, pitch: 0.1 },
  };
  for (const m of Object.values(R.marks)) m.y = ground(m.x, m.z);
  return R;
}
