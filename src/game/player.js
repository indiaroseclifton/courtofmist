// Feyre's controller: inertia, turn-rate limits and ground following give her weight.
import * as THREE from 'three';
import { groundHeight, WATER_Y } from '../world/velaris.js';

const WALK = 1.45, RUN = 4.3, FLY = 10;

export class Player {
  constructor(rig, colliders, state) {
    this.rig = rig;
    this.colliders = colliders;
    this.state = state;
    this.pos = new THREE.Vector3(-30, 0, 20);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI; // facing -Z, toward the river and the cliff
    this.turn = 0;
    this.accel = 0;
    this.alt = 0; // height above ground while flying
    this.boat = null;
    this.locked = false; // scripted scenes hold her still
    this.stairs = 0;
  }

  // Resolve circle-vs-box overlaps so she slides along walls.
  collide(p, r = 0.32) {
    for (const b of this.colliders) {
      if (p.x < b.minX - r || p.x > b.maxX + r || p.z < b.minZ - r || p.z > b.maxZ + r) continue;
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      let dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-5) {
        // centre inside: push out along the shallowest axis
        const opts = [[b.minX - r - p.x, 0], [b.maxX + r - p.x, 0], [0, b.minZ - r - p.z], [0, b.maxZ + r - p.z]];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        p.x += opts[0][0]; p.z += opts[0][1];
      } else {
        dx /= d; dz /= d;
        p.x = cx + dx * r; p.z = cz + dz * r;
      }
    }
  }

  update(dt, input, camYaw) {
    const flying = this.state.flying;
    const prevHeading = this.heading;
    let want = new THREE.Vector3();
    if (!this.locked) {
      const f = (input.f ? 1 : 0) - (input.b ? 1 : 0);
      const s = (input.r ? 1 : 0) - (input.l ? 1 : 0);
      if (f || s) {
        const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        want.addScaledVector(fwd, f).addScaledVector(right, s).normalize();
        want.multiplyScalar(flying ? FLY : this.boat ? 3.2 : input.run ? RUN : WALK);
      }
    }
    // Inertia: a body takes time to get going and to stop. Faster to stop than to start.
    const k = want.lengthSq() > this.vel.lengthSq() ? (flying ? 1.2 : 3.2) : (flying ? 1.0 : 5.5);
    const prevSpeed = this.vel.length();
    this.vel.lerp(want, 1 - Math.exp(-k * dt));
    const speed = this.vel.length();
    this.accel = (speed - prevSpeed) / Math.max(dt, 1e-4);

    // turn toward travel at a limited rate
    if (speed > 0.15) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxTurn = (flying ? 2.2 : 6.5 - Math.min(3.5, speed)) * dt;
      this.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
    this.turn = Math.atan2(Math.sin(this.heading - prevHeading), Math.cos(this.heading - prevHeading)) / Math.max(dt, 1e-4);

    const next = this.pos.clone().addScaledVector(this.vel, dt);
    if (this.boat) {
      // the skiff stays on the river, between the quay walls
      next.z = Math.max(-12.2, Math.min(12.2, next.z));
      next.x = Math.max(-220, Math.min(220, next.x));
      next.y = WATER_Y + 0.15;
      this.pos.copy(next);
      this.boat.position.set(next.x, WATER_Y + 0.05, next.z);
      this.boat.rotation.y = this.heading;
      return { speed: 0, flying: false };
    }

    if (flying) {
      this.alt += ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * 6 * dt;
      this.alt = Math.max(2, Math.min(60, this.alt));
      this.pos.x = next.x; this.pos.z = next.z;
      const g = groundHeight(this.pos.x, this.pos.z);
      const floor = g ?? WATER_Y;
      this.pos.y += ((floor + this.alt) - this.pos.y) * Math.min(1, dt * 2);
      return { speed, flying: true };
    }

    // on foot: only walk where there is ground, slide along edges where there isn't
    const tryMove = (x, z) => {
      const g = groundHeight(x, z);
      if (g === null || g - this.pos.y > 0.7) return false;
      this.pos.x = x; this.pos.z = z;
      return true;
    };
    if (!tryMove(next.x, next.z)) {
      if (!tryMove(next.x, this.pos.z)) tryMove(this.pos.x, next.z);
    }
    this.collide(this.pos);
    const g = groundHeight(this.pos.x, this.pos.z);
    if (g === null) {
      // landed somewhere impossible (e.g. wings gave out over the river): wade to the quay
      this.pos.z = this.pos.z > 0 ? 15 : -15; this.pos.y = 0;
    } else {
      const dy = g - this.pos.y;
      const ga = groundHeight(this.pos.x + Math.sin(this.heading) * 0.5, this.pos.z + Math.cos(this.heading) * 0.5) ?? g;
      this.stairs = Math.max(0, Math.min(1, (ga - g) / 0.3)) * Math.min(1, speed);
      this.pos.y += dy * Math.min(1, dt * 14);
      if (this.pos.y > g + 0.5) this.pos.y = g; // landing
    }
    return { speed, flying: false };
  }

  takeOff() {
    if (this.boat) return false;
    if (!this.state.takeOff()) return false;
    this.alt = 2;
    return true;
  }

  land() { this.state.flying = false; }
}
