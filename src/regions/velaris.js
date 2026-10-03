// Velaris: the open night city on the Sidra, the stair, and the House of Wind above it.
import * as THREE from 'three';
import { buildVelaris, groundHeight, WATER_Y, RIVER_HALF, STAIR } from '../world/velaris.js';
import { buildCrowd } from '../game/npcs.js';
import { setupMissions } from '../game/missions.js';
import { makeRegion, person, act, v3 } from './region.js';
import { look } from '../game/cast.js';
import { pbr } from '../engine/assets.js';
import { torch } from '../world/kit.js';

export const MOON_DIR = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();

export function velaris(ctx) {
  const R = makeRegion('velaris', 'Velaris', {
    sky: 'night', sunDir: MOON_DIR, sunColor: 0x9fb3d8, sunIntensity: 0.75, hemi: [0x2a3856, 0x0d0a08, 0.55],
    fog: [0x1a2130, 0.0105], hdr: 'moonless_golf_1k', envIntensity: 0.35, exposure: 1.15, lightColor: 0xffa860, lightIntensity: 9,
  });
  const world = buildVelaris(R.root, MOON_DIR);
  R.world = world;
  R.ground = groundHeight;
  R.colliders.push(...world.colliders);
  R.lanternSpots.push(...world.lanternSpots);
  R.smokeSpots.push(...world.smokeSpots);
  R.water = { y: WATER_Y, bounds: [-220, 220, -12.2, 12.2], obj: world.water };
  R.spawn = { pos: v3(-30, 0, 20), heading: Math.PI };
  R.safeGround = (p) => v3(p.x, 0, p.z > 0 ? RIVER_HALF + 1.5 : -RIVER_HALF - 1.5);
  Object.assign(R.marks, {
    rainbow_steps: world.marks.rainbow_steps, palace_thread: world.marks.palace_thread, sidra_dock: world.marks.sidra_dock,
    townhouse: world.marks.townhouse, stair_foot: world.marks.stair_foot,
    house_of_wind: v3(0, STAIR.top, STAIR.z1 - 10),
  });
  R.places = {
    townhouse: { pos: v3(-30, 0, -RIVER_HALF - 6), heading: 0 },
    quay: { pos: v3(-30, 0, 20), heading: Math.PI },
    house: { pos: v3(0, STAIR.top, STAIR.z1 - 8), heading: Math.PI },
    ring: { pos: v3(11, STAIR.top, STAIR.z1 - 9), heading: -Math.PI / 2 },
    shot: { pos: v3(-14, 0, 17.6), heading: Math.PI / 2 + 0.15, yaw: -Math.PI / 2 - 0.35, pitch: 0.06 },
  };

  for (const p of buildCrowd(R.root, 30)) R.people.push(p);
  // a live view of the shared context (not a copy), with this region's root and world
  const missions = setupMissions(Object.create(ctx, { scene: { value: R.root }, world: { value: world } }));
  R.missions = missions;
  R.people.push(...missions.named);
  R.interactables.push(...missions.interactables);
  R.updaters.push((dt, t) => { missions.update(dt, t); world.update(t, 1); });

  // the townhouse door and the war table inside it
  act(R, R.marks.townhouse, 'E — the war table', () => ctx.openTable());

  // House of Wind terrace: the training ring Nesta comes to hate, then needs
  const ringC = v3(15, STAIR.top, STAIR.z1 - 9);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 48).rotateX(-Math.PI / 2), pbr('timber', { repeat: [8, 1] }));
  ring.position.set(ringC.x, STAIR.top + 0.02, ringC.z); R.root.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), pbr('timber'));
    post.position.set(ringC.x + Math.cos(a) * 6, STAIR.top + 0.55, ringC.z + Math.sin(a) * 6); R.root.add(post);
  }
  for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) torch(R.root, R.lanternSpots, { x: ringC.x + dx, z: ringC.z + dz, y: STAIR.top, brazier: true, smoke: R.smokeSpots });
  R.named.cassian = person(R, look('cassian'), ringC.x + 3, ringC.z, -Math.PI / 2);
  R.named.gwyn = person(R, look('gwyn'), ringC.x - 10, ringC.z + 4, Math.PI / 2);
  R.named.rhysand = person(R, look('rhysand'), -27, -RIVER_HALF - 5, 0);
  R.named.amren = person(R, look('amren'), -33, -RIVER_HALF - 4, 0.4);
  R.named.mor = person(R, look('mor'), -24, -RIVER_HALF - 4, -0.3);
  R.named.azriel = person(R, look('azriel'), -36, -RIVER_HALF - 6, 0.7);
  R.named.elain = person(R, look('elain'), -20, -RIVER_HALF - 6, -0.2);
  for (const k of ['cassian', 'gwyn', 'rhysand', 'amren', 'mor', 'azriel', 'elain']) R.named[k].pos.y = R.ground(R.named[k].pos.x, R.named[k].pos.z) ?? 0;

  // Solstice: garlands of lanterns strung across the quays, only in the Solstice week
  const solstice = new THREE.Group();
  const garlandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2) });
  for (let x = -100; x < 100; x += 6) {
    for (const zz of [RIVER_HALF + 5, -RIVER_HALF - 5]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), garlandMat);
      m.position.set(x, 4.2 + Math.sin(x * 0.5) * 0.3, zz); solstice.add(m);
    }
  }
  solstice.visible = false;
  R.root.add(solstice);
  R.setSolstice = (on) => { solstice.visible = on; };
  return R;
}
