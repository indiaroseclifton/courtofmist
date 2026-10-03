// The mortal village south of the Wall, in deep winter: a starving village, the cottage
// Feyre kept her family alive in, the forest where she hunts, and the faint Wall to the north.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { terrain, hills, forest, house, box, torch, theWall, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function mortalVillage(ctx) {
  const sunDir = new THREE.Vector3(0.3, 0.35, -0.6).normalize();
  const R = makeRegion('mortal_village', 'The mortal village', {
    sky: 'snowday', sunDir, sunColor: 0xd8dce8, sunIntensity: 1.1, hemi: [0xb8c4d4, 0x4a4a50, 0.9],
    fog: [0xa8b0bc, 0.008], hdr: 'pedestrian_overpass_1k', envIntensity: 0.9, exposure: 0.95,
    lightColor: 0xffa860, lightIntensity: 6, weather: 'snow', weatherCount: 2200,
  });
  const base = hills(5, 1 / 180, 11);
  // flatten the village and the cottage clearing; the forest rises north and east
  const ground = (x, z) => {
    const village = Math.max(0, 1 - Math.hypot(x, z) / 70);
    const rise = Math.max(0, (-z - 60) * 0.08) + Math.max(0, (x - 80) * 0.05);
    return base(x, z) * (1 - village) + rise;
  };
  R.ground = (x, z) => (Math.abs(x) > 240 || Math.abs(z) > 240 ? null : ground(x, z));
  terrain(R.root, { size: 500, seg: 220, height: ground, material: pbr('snow', { repeat: [120, 120] }) });
  // a trodden path of mud through the snow, from the estate road to the forest
  const pathMat = pbr('mud', { repeat: [2, 40] });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 240, 4, 120).rotateX(-Math.PI / 2), pathMat);
  const pp = path.geometry.attributes.position;
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) + Math.sin(pp.getZ(i) * 0.03) * 6, z = pp.getZ(i); pp.setX(i, x); pp.setY(i, ground(x, z) + 0.04); }
  path.geometry.computeVertexNormals();
  path.receiveShadow = true;
  R.root.add(path);

  // the village: cottages around a square with a well
  const r = rand(7);
  const homes = [[-24, -10, 0.2], [-16, 14, Math.PI], [12, 18, Math.PI], [22, -8, 0], [30, 10, -Math.PI / 2], [-34, 4, Math.PI / 2], [6, -22, 0], [-8, -26, 0]];
  for (const [x, z, f] of homes) {
    house(R.root, R.colliders, { x, z, y: ground(x, z), w: 6 + r() * 2, d: 5 + r() * 2, h: 3.4, facing: f, wall: 'plaster', wallColor: 0x9a9286, roof: 'thatch', lit: 0.5, seed: (x * 7 + z) | 0, smokeSpots: R.smokeSpots });
  }
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.9, 20, 1, true), pbr('ashlar', { repeat: [3, 0.5], side: THREE.DoubleSide }));
  well.position.set(0, ground(0, 0) + 0.45, 0); well.castShadow = true; R.root.add(well);
  collider(R.colliders, 0, 0, 2, 2, 0);
  for (const [x, z] of [[-6, 4], [8, -4], [-3, -12]]) torch(R.root, R.lanternSpots, { x, z, y: ground(x, z), smoke: R.smokeSpots });

  // the family cottage at the forest edge, roof half stripped by the winter
  const CX = -52, CZ = -36;
  house(R.root, R.colliders, { x: CX, z: CZ, y: ground(CX, CZ), w: 7, d: 6, h: 3.2, facing: 0.0, wall: 'plaster', wallColor: 0x8a8278, roof: 'thatch', lit: 0.7, seed: 99, smokeSpots: R.smokeSpots, chimney: true });
  const holes = [];
  for (let i = 0; i < 5; i++) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), plain(0x0c0a08, 1));
    const hx = CX - 2 + i * 1.0, hz = CZ + 1.2 + (i % 2) * 0.6;
    hole.position.set(hx, ground(CX, CZ) + 3.2 + 0.85 + (i % 2) * 0.3, hz);
    hole.rotation.x = -Math.PI / 2 + 0.75;
    R.root.add(hole);
    holes.push(hole);
  }
  R.cottage = { x: CX, z: CZ, holes };
  const ladder = box(R.root, [0.5, 4, 0.1], [CX + 3.7, ground(CX, CZ) + 2, CZ + 3.1], pbr('timber'));
  ladder.rotation.x = -0.3;
  // a stack of fresh thatch bundles by the door
  R.thatchPile = v3(CX + 5, ground(CX + 5, CZ + 5), CZ + 5);
  for (let i = 0; i < 6; i++) box(R.root, [1.2, 0.35, 0.5], [R.thatchPile.x + (i % 3) * 0.2, R.thatchPile.y + 0.18 + Math.floor(i / 3) * 0.36, R.thatchPile.z + (i % 2) * 0.3], pbr('thatch', { repeat: [1, 0.3] }));

  // the family's estate on the sea road: where the mortal queens are received in Act 2
  const EX = 40, EZ = 120;
  house(R.root, R.colliders, { x: EX, z: EZ, y: ground(EX, EZ), w: 22, d: 14, h: 9, facing: Math.PI, wall: 'ashlar', roof: 'slate', roofKind: 'hip', lit: 0.6, seed: 4, smokeSpots: R.smokeSpots, windowsOn: 'all' });
  for (const dx of [-6, 0, 6]) torch(R.root, R.lanternSpots, { x: EX + dx, z: EZ - 9, y: ground(EX + dx, EZ - 9), brazier: true });

  // the forest: snow-laden pines north and east, where she hunts
  forest(R.root, { kind: 'snowpine', count: 650, area: [-230, 230, -230, -55], ground, seed: 3, avoid: (x, z) => Math.abs(x + 52) < 12 && Math.abs(z + 36) < 12 });
  forest(R.root, { kind: 'pine', count: 260, area: [90, 230, -60, 200], ground, seed: 4 });
  forest(R.root, { kind: 'snowpine', count: 200, area: [-230, -80, -60, 200], ground, seed: 5 });

  // the Wall: faint, to the north, a shimmer in the cold air
  const wall = theWall(R.root, { z: -220, width: 520, height: 140 });
  R.updaters.push((dt, t) => wall.userData.update(t));

  // villagers who barely look up from their own hunger
  for (let i = 0; i < 8; i++) {
    const p = person(R, look('villager', { shirt: [0x5a5048, 0x4a4238, 0x6a5a48][i % 3], robe: i % 2 ? 0x4a4038 : null }), -10 + i * 3, 6 - i, r() * 6);
    route(p, [[-12 + i, 8], [10 - i, -6], [i * 2, 12]]);
  }
  R.named.nesta = person(R, look('nesta', { robe: 0x4a4a52 }), CX + 2, CZ + 5, Math.PI);
  R.named.elain = person(R, look('elain', { robe: 0x8a7a6a }), CX - 3, CZ + 4.5, 0.6);
  R.named.father = person(R, look('father'), CX + 1, CZ + 3.6, 0.2);
  R.named.family = person(R, look('villager', { shirt: 0x6a5a48, height: 1.72 }), CX + 4, CZ + 7, Math.PI);

  R.spawn = { pos: v3(-50, 0, -30), heading: Math.PI };
  Object.assign(R.marks, { cottage_gate: v3(CX + 2, 0, CZ + 6), village_square: v3(0, 0, 3), family_estate: v3(EX, 0, EZ - 12) });
  R.places = {
    cottage: { pos: v3(CX + 3, 0, CZ + 8), heading: Math.PI },
    forest: { pos: v3(-40, 0, -95), heading: Math.PI },
    estate: { pos: v3(EX, 0, EZ - 16), heading: 0 },
    shot: { pos: v3(-30, 0, -6), heading: -2.2, yaw: 0.9, pitch: 0.08 },
  };
  for (const m of Object.values(R.marks)) m.y = ground(m.x, m.z);
  act(R, R.marks.village_square, 'E — draw water at the well', async () => {
    await ctx.ui.say('', '<i>The rope is stiff with frost. The bucket comes up half ice.</i>', 2200); ctx.ui.clearSay();
  }, { r: 2.2 });
  return R;
}
