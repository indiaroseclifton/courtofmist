// The Winter Court's glasshouse: a cathedral of glass and frost on an open snowfield,
// green and warm inside while the snow falls on the panes.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { terrain, hills, forest, box, column, roses, torch, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function winterGlasshouse(ctx) {
  const sunDir = new THREE.Vector3(-0.4, 0.45, 0.6).normalize();
  const R = makeRegion('winter_glasshouse', 'The Winter Court', {
    sky: 'snowday', sunDir, sunColor: 0xe8f0ff, sunIntensity: 1.6, hemi: [0xc8d8e8, 0x8090a0, 1.0],
    fog: [0xb8c4d0, 0.0022], hdr: 'san_giuseppe_bridge_2k', envIntensity: 0.7, exposure: 0.62,
    lightColor: 0xffc890, lightIntensity: 3, weather: 'snow', weatherCount: 2400,
  });
  const base = hills(4, 1 / 220, 91);
  const ground = (x, z) => base(x, z) * Math.min(1, Math.hypot(x, z) / 70);
  R.ground = (x, z) => (Math.abs(x) > 240 || Math.abs(z) > 240 ? null : ground(x, z));
  terrain(R.root, { size: 500, seg: 160, height: ground, material: pbr('snow', { repeat: [110, 110], color: 0xb8c0cc }) });

  // the glasshouse: iron-and-ice ribs, glass panes, a long nave and a domed crossing
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xd0e4f0, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.08, ior: 1.5, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const frost = plain(0x2a3440, 0.35, { metalness: 0.8 });
  const L = 60, W = 22, H = 14;
  const nave = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, L, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), glass);
  nave.position.set(0, H - W / 2, 0); R.root.add(nave);
  for (let z = -L / 2; z <= L / 2; z += 5) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 0.12, 8, 32, Math.PI), frost);
    rib.position.set(0, H - W / 2, z); R.root.add(rib);
    for (const s of [-1, 1]) box(R.root, [0.25, H - W / 2, 0.25], [s * W / 2, (H - W / 2) / 2, z], frost);
  }
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H - W / 2), glass);
    wall.rotation.y = Math.PI / 2; wall.position.set(s * W / 2, (H - W / 2) / 2, 0); R.root.add(wall);
    collider(R.colliders, s * W / 2, 0, 0.4, L, 0.1);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  dome.position.set(0, H - 2, -L / 2 - 10); R.root.add(dome);
  // inside: a warm garden, winter roses, a fountain frozen at the rim
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L + 30).rotateX(-Math.PI / 2), pbr('marble', { repeat: [6, 24], color: 0xd8e4ec }));
  floor.position.set(0, 0.03, -10); floor.receiveShadow = true; R.root.add(floor);
  const r = rand(92);
  const spots = [];
  for (let z = -L / 2 + 3; z < L / 2 - 3; z += 1.4) for (const x of [-7, 7]) spots.push(v3(x + (r() - 0.5), 0, z));
  roses(R.root, spots, { colors: [0xe8eef4, 0xb8c8e0, 0x8a1a3a], mud: false, seed: 93 });
  for (let z = -L / 2 + 6; z < L / 2; z += 12) for (const x of [-4, 4]) torch(R.root, R.lanternSpots, { x, z, h: 2.2, brazier: true });
  forest(R.root, { kind: 'snowpine', count: 420, area: [-230, 230, -230, 230], ground, seed: 94, avoid: (x, z) => Math.abs(x) < 40 && Math.abs(z + 10) < 70 });

  R.named.kallias = person(R, look('kallias'), 0, -L / 2 - 6, 0);
  R.named.viviane = person(R, look('viviane'), 3, -L / 2 - 5, -0.3);
  for (let i = 0; i < 10; i++) route(person(R, look('winterfolk', { shirt: [0xc8d4dc, 0x8aa0b0, 0xe8f0f4][i % 3] }), (r() - 0.5) * 12, -20 + r() * 40, r() * 6), [[(r() - 0.5) * 12, -25 + r() * 50], [(r() - 0.5) * 12, -25 + r() * 50]]);

  R.spawn = { pos: v3(0, 0, L / 2 + 12), heading: Math.PI };
  Object.assign(R.marks, { glasshouse_door: v3(0, 0, L / 2 + 4) });
  R.places = {
    door: { pos: v3(0, 0, L / 2 + 6), heading: Math.PI },
    crossing: { pos: v3(0, 0, -L / 2), heading: Math.PI },
    shot: { pos: v3(26, 0, L / 2 + 26), heading: Math.PI + 0.6, yaw: 0.75, pitch: 0.12 },
  };
  for (const m of Object.values(R.marks)) m.y = ground(m.x, m.z);
  return R;
}
