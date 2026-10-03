// The Day Court's library: a hall of shelves under skylights, dust turning in the sunbeams.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { box, column, shelves, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function dayLibrary(ctx) {
  const sunDir = new THREE.Vector3(0.25, 0.92, 0.2).normalize();
  const R = makeRegion('day_library', "The Day Court's library", {
    sky: 'noon', sunDir, sunColor: 0xfff0d0, sunIntensity: 3.2, hemi: [0xf0e0c0, 0x5a4a30, 0.55],
    fog: [0x6a5a40, 0.006], hdr: 'quarry_01_1k', envIntensity: 0.6, exposure: 0.85,
    lightColor: 0xffd090, lightIntensity: 6, weather: 'dust', weatherCount: 1400,
  });
  const X0 = -40, X1 = 40, Z0 = -90, Z1 = 20, HH = 26;
  R.ground = (x, z) => (x > X0 && x < X1 && z > Z0 && z < Z1 ? 0 : null);
  R.ceiling = () => HH - 0.5;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2), pbr('marble', { repeat: [16, 22], color: 0xe8dcc0 }));
  floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; R.root.add(floor);
  const stone = pbr('ashlar', { repeat: [20, 8], color: 0xe0d0b0 });
  for (const [x, z, w, d] of [[X0, (Z0 + Z1) / 2, 1, Z1 - Z0], [X1, (Z0 + Z1) / 2, 1, Z1 - Z0], [0, Z0, X1 - X0, 1], [0, Z1, X1 - X0, 1]]) box(R.root, [w, HH, d], [x, HH / 2, z], stone, R.colliders);
  // a coffered ceiling with long skylights; sunlight comes down through them in shafts
  const ceil = new THREE.Group();
  for (let z = Z0; z < Z1; z += 10) {
    for (const x of [-30, -10, 10, 30]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 8), stone);
      panel.position.set(x, HH, z + 5); ceil.add(panel);
    }
  }
  R.root.add(ceil);
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (let z = Z0 + 10; z < Z1; z += 20) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.5, HH, 16, 1, true), shaftMat);
    shaft.position.set(4, HH / 2, z); shaft.rotation.z = -0.25; R.root.add(shaft);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.position.set(-2, 0.02, z); R.root.add(pool);
    R.lanternSpots.push(v3(0, 6, z));
  }
  // the stacks: long rows of shelves; the east wing is the one magic has scrambled
  const marble = pbr('marble', { repeat: [1, 4] });
  for (let z = Z0 + 12; z < Z1 - 6; z += 8) for (const x of [-30, -20, 20, 30]) shelves(R.root, R.colliders, { x, z, w: 7, h: 8, seed: (x * 7 + z) | 0, gaps: x > 0 && z < -20 ? 0.35 : 0.02 });
  for (let z = Z0 + 6; z < Z1; z += 12) for (const x of [-12, 12]) column(R.root, x, z, HH - 1, 0.7, marble, R.colliders);
  // reading tables down the nave
  for (let z = Z0 + 14; z < Z1 - 10; z += 14) box(R.root, [3, 0.9, 6], [0, 0.45, z], pbr('oak', { repeat: [1, 2] }), R.colliders);
  R.cart = v3(14, 0, -30);
  box(R.root, [1.6, 1, 1], [R.cart.x, 0.5, R.cart.z], pbr('oak'), R.colliders);

  R.named.helion = person(R, look('helion'), 0, Z0 + 8, 0);
  R.named.librarian = person(R, look('scribe', { robe: 0xc8b088 }), 12, -28, -Math.PI / 2);
  const r = rand(111);
  for (let i = 0; i < 12; i++) route(person(R, look('scribe', { skin: [0x6a4028, 0xd8a888, 0x8a5a3a][i % 3] }), (r() - 0.5) * 10, Z0 + 10 + r() * 90, r() * 6), [[(r() - 0.5) * 8, Z0 + 10 + r() * 90], [(r() - 0.5) * 8, Z0 + 10 + r() * 90]]);

  R.spawn = { pos: v3(0, 0, Z1 - 4), heading: Math.PI };
  Object.assign(R.marks, { day_stacks: v3(16, 0, -26) });
  R.places = {
    door: { pos: v3(0, 0, Z1 - 4), heading: Math.PI },
    stacks: { pos: v3(16, 0, -26), heading: Math.PI },
    shot: { pos: v3(-4, 0, -10), heading: Math.PI, yaw: -0.15, pitch: 0.2 },
  };
  return R;
}
