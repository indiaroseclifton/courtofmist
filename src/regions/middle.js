// The Middle: old dark woods between the courts. The Weaver's cottage. The Suriel's clearing.
import * as THREE from 'three';
import { makeRegion, person, act, v3 } from './region.js';
import { terrain, hills, forest, house, box, torch, rand, collider } from '../world/kit.js';
import { pbr, plain } from '../engine/assets.js';
import { look } from '../game/cast.js';

export function theMiddle(ctx) {
  const sunDir = new THREE.Vector3(0.2, 0.6, 0.3).normalize();
  const R = makeRegion('the_middle', 'The Middle', {
    sky: 'overcast', sunDir, sunColor: 0x8a9a88, sunIntensity: 0.35, hemi: [0x4a5a4a, 0x14180e, 0.5],
    fog: [0x3a4438, 0.022], hdr: 'pedestrian_overpass_1k', envIntensity: 0.25, exposure: 1.1,
    lightColor: 0xffa060, lightIntensity: 5,
  });
  const base = hills(4, 1 / 120, 121);
  R.ground = (x, z) => (Math.abs(x) > 180 || Math.abs(z) > 180 ? null : base(x, z));
  terrain(R.root, { size: 380, seg: 160, height: base, material: pbr('leaves', { repeat: [70, 70], color: 0x6a6a50 }) });
  forest(R.root, { kind: 'pine', count: 900, area: [-175, 175, -175, 175], ground: base, seed: 122, scale: [1.2, 2.2], avoid: (x, z) => Math.hypot(x, z + 60) < 14 || Math.hypot(x - 50, z - 40) < 16 || Math.abs(x) < 3 });
  forest(R.root, { kind: 'summer', count: 300, area: [-175, 175, -175, 175], ground: base, seed: 123, scale: [1.4, 2.4], avoid: (x, z) => Math.hypot(x, z + 60) < 14 || Math.hypot(x - 50, z - 40) < 16 || Math.abs(x) < 3 });

  // the Weaver's cottage: a hearth, a loom, a spinning wheel, and silence
  const WX = 0, WZ = -60;
  house(R.root, R.colliders, { x: WX, z: WZ, y: base(WX, WZ), w: 8, d: 7, h: 3.2, facing: 0, wall: 'timber', roof: 'thatch', lit: 0.8, litColor: 0xff8a40, seed: 124, smokeSpots: R.smokeSpots });
  R.weaverDoor = v3(WX, base(WX, WZ + 4), WZ + 4.2);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 32), pbr('oak'));
  wheel.position.set(WX + 2.5, base(WX, WZ) + 1.0, WZ + 4.6); R.root.add(wheel);
  R.updaters.push((dt) => { wheel.rotation.z += dt * (R.weaverSpinning === false ? 0 : 2); });
  R.named.weaver = person(R, look('weaver'), WX + 1.6, WZ + 4.8, Math.PI);
  R.named.weaver.fixedY = false;
  R.weaverPrize = v3(WX - 2.6, base(WX - 2.6, WZ + 4.5), WZ + 4.5);
  box(R.root, [0.4, 0.3, 0.3], [R.weaverPrize.x, R.weaverPrize.y + 0.9, R.weaverPrize.z], plain(0xc8a040, 0.3, { metalness: 0.9 }));
  box(R.root, [0.8, 0.9, 0.5], [R.weaverPrize.x, R.weaverPrize.y + 0.45, R.weaverPrize.z], pbr('oak'));

  // the Suriel's clearing: a ring of standing stones
  const SX = 50, SZ = 40;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    box(R.root, [0.9, 2.6, 0.6], [SX + Math.cos(a) * 9, base(SX + Math.cos(a) * 9, SZ + Math.sin(a) * 9) + 1.2, SZ + Math.sin(a) * 9], pbr('granite'), null, a);
  }
  R.named.suriel = person(R, look('suriel'), SX, SZ, Math.PI);
  R.snare = v3(SX - 3, base(SX - 3, SZ + 3), SZ + 3);
  torch(R.root, R.lanternSpots, { x: WX + 4, z: WZ + 6, y: base(WX + 4, WZ + 6), h: 1.6 });

  R.spawn = { pos: v3(0, 0, 40), heading: Math.PI };
  R.places = {
    path: { pos: v3(0, 0, 40), heading: Math.PI },
    cottage: { pos: v3(WX, 0, WZ + 14), heading: Math.PI },
    clearing: { pos: v3(SX - 12, 0, SZ), heading: Math.PI / 2 },
    shot: { pos: v3(2, 0, WZ + 16), heading: Math.PI, yaw: 0.15, pitch: 0.06 },
  };
  return R;
}
