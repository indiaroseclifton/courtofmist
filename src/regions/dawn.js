// The Dawn Court's infirmary: rose-white arcades on a sea cliff, facing the sunrise.
import * as THREE from 'three';
import { makeRegion, person, route, act, v3 } from './region.js';
import { box, column, arch, torch, waterPlane, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';
import { fbm } from '../world/textures.js';

export function dawnInfirmary(ctx) {
  const sunDir = new THREE.Vector3(0.1, 0.12, 1).normalize(); // rising out of the sea
  const R = makeRegion('dawn_infirmary', 'The Dawn Court', {
    sky: 'sunrise', sunDir, sunColor: 0xffb8a0, sunIntensity: 2.8, hemi: [0xb0a0c8, 0x5a4a50, 0.75],
    fog: [0xe0b8b0, 0.003], hdr: 'blouberg_sunrise_2_1k', envIntensity: 1.0, exposure: 0.8,
    lightColor: 0xffc8a0, lightIntensity: 5,
  });
  const TOP = 60;
  const ground = (x, z) => {
    if (z > 30) return null; // the cliff edge
    return TOP + (fbm(x / 200 + 1, z / 200 + 1, 4, 4, 5) - 0.5) * 6 * Math.min(1, Math.max(0, -z - 20) / 40);
  };
  R.ground = (x, z) => (Math.abs(x) > 200 || z < -200 ? null : ground(x, z));
  R.water = { y: 0, bounds: [-200, 200, 40, 300] };
  R.safeGround = (p) => v3(p.x, TOP, 20);
  // the clifftop and its face
  const top = new THREE.Mesh(new THREE.PlaneGeometry(400, 230, 100, 60).rotateX(-Math.PI / 2), pbr('grass', { repeat: [80, 46], color: 0xc8b8a0 }));
  const tp = top.geometry.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, ground(tp.getX(i), tp.getZ(i) - 85) ?? TOP);
  top.geometry.computeVertexNormals();
  top.position.z = -85; top.receiveShadow = true; R.root.add(top);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(400, TOP + 10, 80, 20), pbr('granite', { repeat: [40, 8], color: 0xd8b8a8 }));
  const fp = face.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, (fbm(fp.getX(i) / 60 + 2, fp.getY(i) / 60 + 2, 4, 5, 7) - 0.5) * 8);
  face.geometry.computeVertexNormals();
  face.position.set(0, (TOP - 10) / 2, 30); R.root.add(face);
  waterPlane(R.root, { size: 1200, y: 0, z: 400, sunDir, sunColor: 0xffc0a0, color: 0x1a3a50, distortion: 3.5 }).then((w) => {
    R.updaters.push((dt, t) => { w.material.uniforms.time.value = t * 0.4; });
  });

  // the infirmary: arcaded wings around a courtyard open to the sea
  const rose = pbr('marble', { repeat: [2, 4], color: 0xf0d8d0 });
  const IZ = -10;
  for (const [x, z, w, d, rot] of [[-22, IZ, 6, 40, 0], [22, IZ, 6, 40, 0], [0, IZ - 22, 50, 6, 0]]) {
    box(R.root, [w, 9, d], [x, TOP + 4.5, z], pbr('plaster', { repeat: [w / 3, 3], color: 0xf4e0d8 }), R.colliders, rot);
    box(R.root, [w + 1, 0.6, d + 1], [x, TOP + 9.3, z], pbr('slate', { repeat: [w / 2, d / 2], color: 0xc8a8a0 }));
  }
  for (let z = IZ - 18; z <= IZ + 18; z += 4) for (const x of [-17, 17]) column(R.root, x, z, 6, 0.35, rose, R.colliders, TOP);
  for (let x = -16; x <= 16; x += 4) column(R.root, x, IZ - 17, 6, 0.35, rose, R.colliders, TOP);
  // beds under awnings along the arcade, healers moving between them
  R.beds = [];
  for (let z = IZ - 14; z <= IZ + 14; z += 4) for (const x of [-14, 14]) {
    box(R.root, [2, 0.6, 1], [x, TOP + 0.3, z], pbr('linen', { repeat: [2, 1] }));
    R.beds.push(v3(x, TOP, z));
  }
  R.named.thesan = person(R, look('thesan'), 0, IZ - 12, 0);
  const r = rand(101);
  for (let i = 0; i < 10; i++) route(person(R, look('healer', { skin: [0xc89070, 0x7a4a30, 0xe0b090][i % 3] }), -14 + r() * 28, IZ - 14 + r() * 28, r() * 6), [[-12 + r() * 24, IZ - 14 + r() * 28], [-12 + r() * 24, IZ - 14 + r() * 28]]);
  R.patients = R.beds.slice(0, 6).map((b, i) => { const p = person(R, look('villager', { shirt: 0xe8e0d8 }), b.x, b.z, 0); p.downed = true; p.fixedY = true; p.pos.y = TOP + 0.6; return p; });

  R.spawn = { pos: v3(0, TOP, 18), heading: Math.PI };
  Object.assign(R.marks, { dawn_terrace: v3(0, TOP, 20) });
  R.places = {
    terrace: { pos: v3(0, TOP, 18), heading: Math.PI },
    court: { pos: v3(0, TOP, IZ), heading: Math.PI },
    shot: { pos: v3(-6, TOP, IZ + 6), heading: 0.4, yaw: Math.PI + 0.35, pitch: 0.06 },
  };
  return R;
}
