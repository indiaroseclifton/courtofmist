// Townsfolk and named people. The city is lived in: people stroll the quays, cross bridges,
// stop at stalls. Named people stand where their stories are and turn to face you.
import * as THREE from 'three';
import { buildHuman, animateHuman } from '../world/character.js';
import { groundHeight, RIVER_HALF, BRIDGES, mulberry } from '../world/velaris.js';

const SKINS = [0xe2b49a, 0xc98e6c, 0x9a6448, 0x6e4430, 0xf0c8b0, 0xb07656, 0x553222];
const HAIR = [0x1a120c, 0x3a2416, 0x6b4a2c, 0xb08a58, 0x2a1a10, 0x8a8a8a, 0x101010];
const CLOTH = [0x2a2f3a, 0x4a2a2a, 0x1f3a3a, 0x3a3326, 0x5a4a6a, 0x23262b, 0x6a4a2a, 0x2c3d2a];
const SILK = [0x7a1f2b, 0x1f3a6a, 0x2f5a46, 0x5a2a6a, 0x8a6a3a, 0x1a1a24];

export class Person {
  constructor(scene, opts, pos) {
    this.rig = buildHuman(opts);
    this.pos = pos.clone();
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.target = null;
    this.walkSpeed = opts.walkSpeed ?? (1.1 + Math.random() * 0.4);
    this.route = null;
    this.routeIdx = 0;
    this.pause = 0;
    this.talking = 0;
    this.lookAt = null;
    scene.add(this.rig.root);
    if (this.rig.hair) this.rig.hair.attach(scene);
  }

  goTo(p) { this.target = p.clone(); }

  update(dt, t) {
    let accel = 0, turn = 0;
    if (!this.target && this.route) {
      if (this.pause > 0) this.pause -= dt;
      else { this.target = this.route[this.routeIdx]; this.routeIdx = (this.routeIdx + 1) % this.route.length; }
    }
    let want = 0;
    if (this.target) {
      const d = new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
      const dist = d.length();
      if (dist < 0.4) { this.target = null; this.pause = this.route ? 1 + Math.random() * 6 : 0; }
      else {
        want = this.walkSpeed * Math.min(1, dist / 1.2);
        const h = Math.atan2(d.x, d.z);
        let dh = Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading));
        const step = Math.max(-3 * dt, Math.min(3 * dt, dh));
        this.heading += step; turn = step / dt;
      }
    } else if (this.lookAt) {
      const h = Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z);
      const dh = Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading));
      this.heading += dh * Math.min(1, dt * 3);
    }
    const prev = this.speed;
    this.speed += (want - this.speed) * Math.min(1, dt * 3);
    accel = (this.speed - prev) / Math.max(dt, 1e-4);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const g = groundHeight(this.pos.x, this.pos.z);
    if (g !== null) this.pos.y += (g - this.pos.y) * Math.min(1, dt * 10);
    const ahead = groundHeight(this.pos.x + Math.sin(this.heading) * 0.5, this.pos.z + Math.cos(this.heading) * 0.5) ?? this.pos.y;
    const stairs = Math.max(0, Math.min(1, (ahead - this.pos.y) / 0.3)) * Math.min(1, this.speed);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.heading;
    animateHuman(this.rig, dt, { speed: this.speed, accel, turn, t, talking: this.talking, stairs });
  }
}

export function buildCrowd(scene, count = 30) {
  const rnd = mulberry(99);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const people = [];
  // routes: along each quay promenade, over a bridge, up to a stall and away
  const sq = RIVER_HALF + 3.2, nq = -RIVER_HALF - 3.2;
  const routes = [
    [new THREE.Vector3(-100, 0, sq), new THREE.Vector3(-30, 0, sq + 1), new THREE.Vector3(30, 0, sq), new THREE.Vector3(70, 0, sq + 2)],
    [new THREE.Vector3(BRIDGES[1], 0, sq), new THREE.Vector3(BRIDGES[1], 0, 0), new THREE.Vector3(BRIDGES[1], 0, nq), new THREE.Vector3(-40, 0, nq), new THREE.Vector3(-62, 0, nq), new THREE.Vector3(BRIDGES[0], 0, 0), new THREE.Vector3(-62, 0, sq)],
    [new THREE.Vector3(-90, 0, nq - 1), new THREE.Vector3(60, 0, nq - 1)],
    [new THREE.Vector3(-80, 0, sq + 6), new THREE.Vector3(-40, 0, sq + 6), new THREE.Vector3(-58, 0, sq + 9)],
    [new THREE.Vector3(20, 0, sq + 1.5), new THREE.Vector3(60, 0, sq + 2), new THREE.Vector3(92, 0, sq), new THREE.Vector3(92, 0, nq), new THREE.Vector3(20, 0, nq)],
  ];
  for (let i = 0; i < count; i++) {
    const route = routes[i % routes.length];
    const fancy = rnd() < 0.4;
    const opts = {
      skin: pick(SKINS), hair: pick(HAIR), shirt: fancy ? pick(SILK) : 0xcfc6b4, vest: pick(CLOTH), trousers: pick(CLOTH),
      boots: 0x1e1610, shirtKind: fancy ? 'silk' : 'linen', vestKind: rnd() < 0.5 ? 'leather' : 'linen',
      robe: rnd() < 0.4 ? pick(SILK) : null, hairLen: rnd() < 0.5 ? 0.35 : 0.05, height: 1.58 + rnd() * 0.3,
      walkSpeed: 0.95 + rnd() * 0.45,
    };
    const start = route[Math.floor(rnd() * route.length)].clone();
    start.x += (rnd() - 0.5) * 6;
    const p = new Person(scene, opts, start);
    p.route = route.map((v) => v.clone().add(new THREE.Vector3((rnd() - 0.5) * 2.5, 0, (rnd() - 0.5) * 1.6)));
    p.routeIdx = Math.floor(rnd() * route.length);
    people.push(p);
  }
  // people standing at stalls, talking in pairs
  for (let i = 0; i < 6; i++) {
    const x = -22 + ((i * 2) % 9) * 6.4;
    for (const dz of [-1.6, -2.6]) {
      const p = new Person(scene, { skin: pick(SKINS), hair: pick(HAIR), shirt: pick(SILK), shirtKind: 'silk', vest: pick(CLOTH), robe: rnd() < 0.5 ? pick(SILK) : null, hairLen: 0.3 }, new THREE.Vector3(x + (rnd() - 0.5), 0, RIVER_HALF + 6.5 + dz));
      p.heading = dz < -2 ? 0 : Math.PI;
      p.talking = rnd() < 0.6 ? 1 : 0;
      people.push(p);
    }
  }
  return people;
}
