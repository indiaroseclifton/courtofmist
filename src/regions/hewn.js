// The Hewn City: a court carved into the mountain under Velaris. Torch, wet basalt, masks.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { box, torch, rand, column, arch } from '../world/kit.js';
import { pbr, plain, emissive } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function hewnCity(ctx) {
  const R = makeRegion('hewn_city', 'The Hewn City', {
    sky: 'none', sunDir: new THREE.Vector3(0, 1, 0), sunColor: 0x000000, sunIntensity: 0, hemi: [0x4a3020, 0x0a0806, 0.45],
    fog: [0x120c08, 0.012], hdr: 'moonless_golf_1k', envIntensity: 0.2, exposure: 1.6,
    lightColor: 0xff8a3a, lightIntensity: 16, lightDistance: 20, weather: 'embers', weatherCount: 400,
  });
  // the cavern floor slopes down from the gate (z = 70) to the throne room (z = -70)
  const floorY = (z) => Math.max(0, Math.min(6, (z + 20) * 0.075));
  const inside = (x, z) => Math.abs(x) < 70 && z > -95 && z < 80;
  R.ground = (x, z) => (inside(x, z) ? floorY(z) : null);
  R.ceiling = () => 34;
  const basaltWet = pbr('basalt', { repeat: [40, 50], physical: { clearcoat: 0.6, clearcoatRoughness: 0.18 } });
  const fg = new THREE.PlaneGeometry(140, 175, 40, 50).rotateX(-Math.PI / 2);
  const fp = fg.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, floorY(fp.getZ(i) - 7.5));
  fg.computeVertexNormals();
  const floor = new THREE.Mesh(fg, basaltWet); floor.position.z = -7.5; floor.receiveShadow = true; R.root.add(floor);

  // the cavern itself: a flattened dome of black rock
  const dome = new THREE.Mesh(new THREE.SphereGeometry(110, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), pbr('basalt', { repeat: [30, 12], side: THREE.BackSide }));
  dome.scale.set(0.75, 0.32, 0.95); dome.position.set(0, -2, -7);
  R.root.add(dome);

  // carved facades along both cavern walls: doors and windows lit from inside
  const carve = pbr('granite', { repeat: [3, 4], color: 0x6a5850 }); // carved faces are lighter than the raw rock
  const lit = emissive(0xff8a3a, 5);
  const r = rand(41);
  for (const side of [-1, 1]) {
    for (let z = -80; z < 70; z += 9 + r() * 4) {
      const h = 8 + r() * 14, w = 7 + r() * 3;
      const x = side * (58 + r() * 4);
      box(R.root, [6, h, w], [x, floorY(z) + h / 2, z], carve, R.colliders);
      for (let f = 0; f < Math.floor(h / 4); f++) {
        if (r() < 0.7) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8), lit);
          win.position.set(x - side * 3.01, floorY(z) + 2 + f * 4, z + (r() - 0.5) * (w - 2));
          win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          R.root.add(win);
        }
      }
    }
  }
  for (const side of [-1, 1]) for (let z = -70; z < 70; z += 16) torch(R.root, R.lanternSpots, { x: side * 53, z, y: floorY(z), h: 3.2, smoke: R.smokeSpots });
  // the avenue: braziers down both sides, the masked crowd walking it
  for (let z = -60; z < 70; z += 14) for (const x of [-12, 12]) torch(R.root, R.lanternSpots, { x, z, y: floorY(z), h: 2.4, brazier: true, smoke: R.smokeSpots });
  const masks = [0xc0c4cc, 0x9a7a40, 0x2a2a2e, 0x6a1a1a, 0xe0d8c0];
  for (let i = 0; i < 34; i++) {
    const p = person(R, look('guard', { mask: masks[i % masks.length], shirt: [0x1a1a1e, 0x2a1220, 0x101418][i % 3], robe: i % 2 ? [0x1a0a14, 0x0a0a10][i % 2] : null, height: 1.65 + r() * 0.3 }), -20 + r() * 40, -40 + r() * 100, r() * 6);
    route(p, [[-20 + r() * 40, -40 + r() * 100], [-20 + r() * 40, -40 + r() * 100], [-20 + r() * 40, -40 + r() * 100]]);
  }

  // Keir's throne room: an inner hall at the cavern's foot
  const TZ = -78;
  const obsidian = pbr('basalt', { repeat: [2, 2], roughness: 0.6, physical: { clearcoat: 1, clearcoatRoughness: 0.05 } });
  for (const x of [-20, 20]) box(R.root, [1.5, 24, 34], [x, 12, TZ], carve, R.colliders);
  box(R.root, [42, 24, 1.5], [0, 12, TZ - 17], carve, R.colliders);
  for (const x of [-15, 15]) box(R.root, [10, 24, 1.5], [x, 12, TZ + 17], carve, R.colliders);
  arch(R.root, { x: 0, z: TZ + 17, span: 8, h: 12, depth: 1.6, mat: carve });
  box(R.root, [12, 1.6, 7], [0, 0.8, TZ - 12], obsidian, R.colliders);
  box(R.root, [3, 6, 1.6], [0, 4.6, TZ - 14.5], obsidian);
  for (const z of [TZ - 10, TZ, TZ + 10]) for (const x of [-16, 16]) column(R.root, x, z, 22, 0.8, obsidian, R.colliders, 0);
  for (const z of [TZ - 6, TZ + 6]) for (const x of [-12, 12]) torch(R.root, R.lanternSpots, { x, z, h: 2.8, brazier: true, smoke: R.smokeSpots });
  R.named.keir = person(R, look('keir'), 0, TZ - 12, 0);
  R.named.keir.pos.y = 1.6; R.named.keir.fixedY = true;
  for (let i = 0; i < 12; i++) person(R, look('guard', { mask: masks[i % 5], robe: 0x14080c }), (i % 2 ? -1 : 1) * (6 + (i % 3) * 3), TZ - 6 + Math.floor(i / 2) * 3, i % 2 ? Math.PI / 2 : -Math.PI / 2);

  // the singer's stage: a lit niche in a hall on the east side
  const SX = 40, SZ = 10;
  box(R.root, [10, 1, 6], [SX, floorY(SZ) + 0.5, SZ], obsidian, R.colliders);
  for (const dz of [-3, 3]) torch(R.root, R.lanternSpots, { x: SX - 4, z: SZ + dz, y: floorY(SZ) + 1, h: 2, brazier: true });
  R.stage = v3(SX, floorY(SZ) + 1, SZ);
  for (let i = 0; i < 10; i++) person(R, look('guard', { mask: masks[(i + 2) % 5], robe: 0x2a0a18 }), SX - 12 - (i % 4) * 2, SZ - 6 + (i % 5) * 3, Math.PI / 2);

  // confession hour: a row of cells off the western wall, a bench, a grate
  const CX = -42, CZ = -20;
  const iron = plain(0x1a1614, 0.45, { metalness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const z = CZ - 12 + i * 8;
    box(R.root, [6, 5, 0.6], [CX - 3, floorY(z) + 2.5, z - 3.5], carve, R.colliders);
    for (let k = 0; k < 10; k++) box(R.root, [0.05, 4, 0.05], [CX, floorY(z) + 2, z - 3 + k * 0.6], iron);
  }
  R.confessionBench = v3(CX + 2.5, floorY(CZ), CZ);
  box(R.root, [0.6, 0.5, 3], [CX + 2.5, floorY(CZ) + 0.25, CZ], pbr('oak'));
  torch(R.root, R.lanternSpots, { x: CX + 4, z: CZ + 5, y: floorY(CZ + 5), h: 2.2 });

  R.spawn = { pos: v3(0, 0, 66), heading: Math.PI };
  Object.assign(R.marks, { hewn_gate: v3(0, floorY(66), 66), keir_hall: v3(0, 0, TZ + 22) });
  R.places = {
    gate: { pos: v3(0, 0, 66), heading: Math.PI },
    throne: { pos: v3(0, 0, TZ + 8), heading: Math.PI },
    stage: { pos: v3(SX - 6, 0, SZ), heading: Math.PI / 2 },
    cells: { pos: v3(CX + 4, 0, CZ), heading: -Math.PI / 2 },
    shot: { pos: v3(44, 0, 34), heading: Math.PI - 0.25, yaw: -0.35, pitch: 0.14 },
  };
  for (const m of Object.values(R.marks)) m.y = floorY(m.z);
  return R;
}
