// The Spring Court manor: pale stone, endless roses, a garden that never quite dries.
// Overcast daylight, mud on the gravel and on the lowest blooms.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { terrain, hills, forest, house, box, column, roses, torch, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function springManor(ctx) {
  const sunDir = new THREE.Vector3(-0.2, 0.75, 0.4).normalize();
  const R = makeRegion('spring_manor', 'The Spring Court', {
    sky: 'overcast', sunDir, sunColor: 0xdfe2e4, sunIntensity: 0.9, hemi: [0xc4ccd0, 0x3a4028, 1.0],
    fog: [0x9aa2a4, 0.006], hdr: 'pedestrian_overpass_1k', envIntensity: 1.0, exposure: 0.95,
    lightColor: 0xffb070, lightIntensity: 7,
  });
  const base = hills(6, 1 / 200, 21);
  const ground = (x, z) => {
    const grounds = Math.max(0, 1 - Math.hypot(x * 0.8, z) / 110);
    return base(x, z) * (1 - grounds) + 0.0;
  };
  R.ground = (x, z) => (Math.abs(x) > 240 || Math.abs(z) > 240 ? null : ground(x, z));
  terrain(R.root, { size: 500, seg: 200, height: ground, material: pbr('grass', { repeat: [90, 90] }) });

  // gravel walks: muddy after rain that never quite stops
  const walk = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), pbr('mud', { repeat: [w / 4, d / 4] }));
    m.position.set(x, ground(x, z) + 0.03, z); m.receiveShadow = true; R.root.add(m);
  };
  walk(0, 20, 6, 80); walk(0, 30, 70, 5); walk(-25, 30, 5, 30); walk(25, 30, 5, 30);

  // the manor
  const MZ = -26;
  house(R.root, R.colliders, { x: 0, z: MZ, w: 46, d: 20, h: 13, facing: 0, wall: 'plaster', wallColor: 0xe8e0d0, roof: 'slate', roofKind: 'hip', lit: 0.25, seed: 3, windowsOn: 'all', smokeSpots: R.smokeSpots, floorsH: 4.2 });
  for (const dx of [-26, 26]) house(R.root, R.colliders, { x: dx, z: MZ + 4, w: 10, d: 14, h: 10, facing: 0, wall: 'plaster', wallColor: 0xe0d8c8, roof: 'slate', roofKind: 'hip', lit: 0.2, seed: dx, door: false });
  const marble = pbr('marble', { repeat: [1, 3] });
  for (let i = 0; i < 6; i++) column(R.root, -7.5 + i * 3, MZ + 13, 9, 0.45, marble, R.colliders);
  box(R.root, [18, 0.6, 6], [0, 9.3, MZ + 12.5], marble);
  for (let s = 0; s < 6; s++) box(R.root, [16 - s * 0.6, 0.18, 1], [0, 0.09 + s * 0.18, MZ + 17.5 - s * 0.9], marble);

  // the fountain at the cross of the walks
  const fount = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.8, 32), marble);
  fount.position.set(0, ground(0, 30) + 0.4, 30); fount.castShadow = true; R.root.add(fount);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.7, 32).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x1a2a2a, roughness: 0.05, transmission: 0, metalness: 0.1 }));
  pool.position.set(0, ground(0, 30) + 0.75, 30); R.root.add(pool);
  column(R.root, 0, 30, 2.6, 0.3, marble, null, ground(0, 30));
  collider(R.colliders, 0, 30, 8.6, 8.6, 0);

  // rose beds along every walk
  const r = rand(17);
  const spots = [];
  for (let z = 0; z < 60; z += 1.6) for (const x of [-4, 4]) if (Math.abs(z - 30) > 6) spots.push(v3(x + (r() - 0.5) * 0.5, ground(x, z), z));
  for (let x = -34; x < 34; x += 1.6) for (const z of [26.5, 33.5]) if (Math.abs(x) > 6) spots.push(v3(x, ground(x, z), z + (r() - 0.5) * 0.5));
  for (let i = 0; i < 60; i++) { const x = -40 + r() * 80, z = 40 + r() * 30; spots.push(v3(x, ground(x, z), z)); }
  roses(R.root, spots, { colors: [0x8a0f1e, 0xb02a3a, 0xd8a0a8, 0xe8d0c0], mud: true });

  // the stables
  house(R.root, R.colliders, { x: -60, z: 0, w: 18, d: 10, h: 5, facing: Math.PI / 2, wall: 'timber', roof: 'slate', lit: 0.1, seed: 8 });
  // hedges at the garden edge
  const hedgeMat = plain(0x22381a, 0.9);
  for (const [x, z, w, d] of [[-40, 30, 1.4, 60], [40, 30, 1.4, 60], [0, 62, 80, 1.4]]) box(R.root, [w, 2.2, d], [x, ground(x, z) + 1.1, z], hedgeMat, R.colliders);

  // the woods beyond, green and too quiet
  const avoid = (x, z) => Math.abs(x) < 70 && z > -50 && z < 70;
  forest(R.root, { kind: 'spring', count: 520, area: [-230, 230, -230, 230], ground, seed: 21, avoid });
  // Calanmai: the fire-night glade in the woods to the east
  const glade = v3(120, 0, 40); glade.y = ground(glade.x, glade.z);
  const pyre = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3.5, 7), pbr('bark'));
    log.position.set(glade.x, glade.y + 1.4, glade.z); log.rotation.set(0.5, (i / 12) * Math.PI * 2, 0, 'YXZ'); log.translateY(0); pyre.add(log);
  }
  R.root.add(pyre);
  R.fireNight = { pos: glade, fire: torch(R.root, R.lanternSpots, { x: glade.x, z: glade.z, y: glade.y, h: 0.1, brazier: false, smoke: R.smokeSpots }) };
  R.fireNight.fire.scale.set(8, 10, 8); R.fireNight.fire.visible = false;

  R.named.tamlin = person(R, look('tamlin'), 2, MZ + 16, 0);
  R.named.lucien = person(R, look('lucien'), -4, 20, Math.PI);
  R.named.alis = person(R, look('alis'), 10, MZ + 15, -0.4);
  route(R.named.lucien, [[-4, 20], [-20, 30], [-4, 45], [4, 10]]);
  for (let i = 0; i < 5; i++) route(person(R, look('villager', { mask: [0x7a9a5a, 0xc8a040, 0x9a7040][i % 3], shirt: 0x5a6a3a }), -20 + i * 8, 40, 0), [[-20 + i * 8, 40], [-10 + i * 6, 10], [i * 5, 50]]);

  R.spawn = { pos: v3(0, 0, 50), heading: Math.PI };
  Object.assign(R.marks, { manor_roses: v3(0, 0, 40), manor_steps: v3(0, 0, MZ + 20) });
  R.places = {
    steps: { pos: v3(0, 0, MZ + 21), heading: Math.PI },
    garden: { pos: v3(10, 0, 38), heading: -2.6 },
    woods: { pos: v3(95, 0, 40), heading: Math.PI / 2 },
    glade: { pos: v3(112, 0, 40), heading: Math.PI / 2 },
    shot: { pos: v3(6, 0, 52), heading: Math.PI + 0.1, yaw: 0.05, pitch: 0.06 },
  };
  for (const m of Object.values(R.marks)) m.y = ground(m.x, m.z);
  act(R, v3(0, 0, 35), 'E — look at the roses', async () => {
    await ctx.ui.say('', '<i>Every bloom perfect, and every one spattered with mud from the path. Nobody here seems to notice.</i>', 3200); ctx.ui.clearSay();
  }, { r: 3 });
  return R;
}
