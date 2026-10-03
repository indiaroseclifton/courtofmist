// Under the Mountain: a prison carved into rock, used only for the three trials of Act 1.
// Torchlight, wet stone, a throne hall, a mud labyrinth, a chamber with a descending ceiling.
import * as THREE from 'three';
import { makeRegion, person, act, v3 } from './region.js';
import { box, torch, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export const ROOMS = {
  cells: [-3, 3, 0, 40, 5],
  hall: [-30, 30, -60, 0, 18],
  eastway: [30, 62, -33, -27, 6],
  arena: [62, 118, -58, -2, 9],
  westway: [-62, -30, -33, -27, 6],
  riddle: [-82, -62, -42, -18, 10],
};

export function underMountain(ctx) {
  const R = makeRegion('under_mountain', 'Under the Mountain', {
    sky: 'none', sunDir: new THREE.Vector3(0, 1, 0), sunColor: 0x000000, sunIntensity: 0, hemi: [0x2a1e16, 0x0a0806, 0.25],
    fog: [0x0a0806, 0.025], hdr: 'moonless_golf_1k', envIntensity: 0.05, exposure: 1.3,
    lightColor: 0xff8a3a, lightIntensity: 14, lightDistance: 18, weather: 'embers', weatherCount: 300,
  });
  const inRoom = (x, z) => Object.values(ROOMS).find(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  R.ground = (x, z) => (inRoom(x, z) ? 0 : null);
  R.ceiling = (x, z) => (inRoom(x, z)?.[4] ?? 5);
  const rock = pbr('granite', { repeat: [8, 2], color: 0x8a7a6a });
  const floor = pbr('basalt', { repeat: [10, 10], physical: { clearcoat: 0.3, clearcoatRoughness: 0.3 } });
  const mud = pbr('mud', { repeat: [14, 14] });

  for (const [name, [x0, x1, z0, z1, h]] of Object.entries(ROOMS)) {
    const w = x1 - x0, d = z1 - z0;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), name === 'arena' ? mud : floor);
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); f.receiveShadow = true; R.root.add(f);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), rock);
    c.position.set((x0 + x1) / 2, h, (z0 + z1) / 2); R.root.add(c);
  }
  // walls: every room edge, cut where a neighbouring room joins
  const wallMat = pbr('granite', { repeat: [6, 2] });
  const solid = (x, z) => !inRoom(x, z);
  for (const [x0, x1, z0, z1, h] of Object.values(ROOMS)) {
    for (const [ax, az, bx, bz, nx, nz] of [[x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0]]) {
      const len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / 2);
      let runStart = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        const open = !solid(px + nx * 1.5, pz + nz * 1.5);
        if (!open && runStart === null) runStart = t;
        if ((open || i === steps) && runStart !== null) {
          const te = open ? t - 1 / steps : t;
          const sx = ax + (bx - ax) * runStart, sz = az + (bz - az) * runStart, ex = ax + (bx - ax) * te, ez = az + (bz - az) * te;
          const cx = (sx + ex) / 2 + nx * 0.5, cz = (sz + ez) / 2 + nz * 0.5;
          const L = Math.max(1, Math.hypot(ex - sx, ez - sz) + 1);
          box(R.root, nx ? [1, h, L] : [L, h, 1], [cx, h / 2, cz], wallMat, R.colliders);
          runStart = null;
        }
      }
    }
  }
  // the cells: barred alcoves along the corridor
  const iron = plain(0x1a1614, 0.45, { metalness: 0.85 });
  for (let z = 4; z < 38; z += 6) for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) box(R.root, [0.05, 3, 0.05], [s * 3.05, 1.5, z - 1.2 + k * 0.5], iron);
  }
  for (let z = 4; z < 40; z += 8) torch(R.root, R.lanternSpots, { x: 2.4, z, h: 2.4, smoke: R.smokeSpots });

  // the throne hall: a dais, a throne of black stone, a crowd that watches everything
  const dais = box(R.root, [16, 1.2, 8], [0, 0.6, -55], pbr('marble', { repeat: [4, 2], color: 0x6a5a5a }), R.colliders);
  const throne = box(R.root, [2.4, 4.5, 1.4], [0, 3.4, -57.5], pbr('basalt', { repeat: [1, 2] }));
  for (const x of [-26, -14, 14, 26]) for (const z of [-50, -30, -10]) torch(R.root, R.lanternSpots, { x, z, h: 3.5, brazier: true, smoke: R.smokeSpots });
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) box(R.root, [0.4, 0.3, 4], [-24 + i * 6, 6 + j * 3, -60 + 0.6], pbr('ashlar', { color: 0x4a3a30 }));
  R.named.amarantha = person(R, look('amarantha'), 0, -55, 0);
  R.named.amarantha.pos.y = 1.2; R.named.amarantha.fixedY = true;
  R.named.rhysand = person(R, look('rhysand'), 7, -50, -0.4);
  R.named.tamlin = person(R, look('tamlin'), -4, -54, 0.2);
  R.named.lucien = person(R, look('lucien'), 18, -20, -1.2);
  R.named.attor = person(R, look('attor'), -14, -46, 0.6);
  const r = rand(31);
  for (let i = 0; i < 26; i++) {
    const x = -26 + r() * 52, z = -44 + r() * 38;
    if (Math.abs(x) < 6) continue;
    person(R, look('guard', { mask: [0x2a2a2e, 0x9a7a40, 0xc0c4cc, 0x5a1a1a][i % 4], shirt: [0x2a1a1a, 0x1a1a2a, 0x3a2a1a][i % 3], robe: i % 3 ? 0x2a1a24 : null }), x, z, Math.atan2(-x, -55 - z));
  }
  // three hooded figures for the last trial, hidden until then
  R.hooded = [-3, 0, 3].map((x, i) => {
    const p = person(R, look('villager', { shirt: 0x2a2620, robe: 0x2a2620, mask: 0x1a1816 }), x, -46, 0);
    p.rig.root.visible = false; p.kneel = true;
    return p;
  });

  // trial one: a labyrinth of mud trenches in the arena; the thing in the mud is the combat module's
  const [ax0, , az0] = ROOMS.arena;
  const N = 8, C = 7;
  const seen = new Set(), walls = new Set();
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { walls.add(`${i},${j},E`); walls.add(`${i},${j},S`); }
  const stack = [[0, 3]]; seen.add('0,3');
  const rr = rand(77);
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']].map(([di, dj, d]) => [i + di, j + dj, d]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(`${a},${b}`));
    if (!nb.length) { stack.pop(); continue; }
    const [a, b, d] = nb[(rr() * nb.length) | 0];
    if (d === 'E') walls.delete(`${i},${j},E`); if (d === 'W') walls.delete(`${a},${b},E`);
    if (d === 'S') walls.delete(`${i},${j},S`); if (d === 'N') walls.delete(`${a},${b},S`);
    seen.add(`${a},${b}`); stack.push([a, b]);
  }
  const mazeMat = pbr('mud', { repeat: [2, 1], color: 0x8a7a68 });
  for (const k of walls) {
    const [i, j, d] = k.split(','); const ci = +i, cj = +j;
    if (d === 'E' && ci === N - 1 && cj === 4) continue; // the exit
    const x = ax0 + 0.5 + ci * C + (d === 'E' ? C : C / 2), z = az0 + 0.5 + cj * C + (d === 'S' ? C : C / 2);
    box(R.root, d === 'E' ? [0.8, 3.2, C + 0.8] : [C + 0.8, 3.2, 0.8], [x, 1.6, z], mazeMat, R.colliders);
  }
  R.maze = { start: v3(ax0 + 1.5, 0, az0 + 0.5 + 3.5 * C), exit: v3(ax0 + N * C - 1, 0, az0 + 0.5 + 4.5 * C), cell: C, origin: v3(ax0 + 0.5, 0, az0 + 0.5) };
  for (const [x, z] of [[70, -6], [110, -6], [70, -54], [110, -54], [90, -30]]) torch(R.root, R.lanternSpots, { x, z, h: 4.5, brazier: true });

  // trial two: a chamber whose ceiling of spikes comes down while you think
  const [rx0, rx1, rz0, rz1] = ROOMS.riddle;
  const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.15, 1.2, 6).rotateX(Math.PI), iron, 300);
  let k = 0;
  for (let x = rx0 + 0.6; x < rx1 && k < 300; x += 1.15) for (let z = rz0 + 0.6; z < rz1 && k < 300; z += 1.15) spikes.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x, 0, z));
  spikes.count = k;
  const spikeGroup = new THREE.Group(); spikeGroup.add(spikes); spikeGroup.position.y = 9.3;
  R.root.add(spikeGroup);
  R.spikes = spikeGroup;
  R.levers = [-6, 0, 6].map((dz, i) => {
    const lever = box(R.root, [0.1, 0.9, 0.1], [rx0 + 0.8, 1.4, (rz0 + rz1) / 2 + dz], iron);
    lever.rotation.z = 0.5;
    return { mesh: lever, pos: v3(rx0 + 1.4, 0, (rz0 + rz1) / 2 + dz), glyph: ['a crowned heart', 'a closed eye', 'a broken key'][i] };
  });
  for (const z of [rz0 + 3, rz1 - 3]) torch(R.root, R.lanternSpots, { x: rx1 - 1, z, h: 3 });

  R.spawn = { pos: v3(0, 0, 35), heading: Math.PI };
  R.places = {
    cell: { pos: v3(0, 0, 35), heading: Math.PI },
    hall: { pos: v3(0, 0, -20), heading: Math.PI },
    maze: { pos: R.maze.start.clone(), heading: Math.PI / 2 },
    riddle: { pos: v3(rx1 - 3, 0, (rz0 + rz1) / 2), heading: -Math.PI / 2 },
    shot: { pos: v3(2, 0, -14), heading: Math.PI, yaw: 0.15, pitch: 0.05 },
  };
  return R;
}
