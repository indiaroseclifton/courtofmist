// Combat is rare and short: a dagger, the bow on her back, and one earned power.
// Health is never a bar: when she is hurt the picture bleeds red at the edges and slows.
import * as THREE from 'three';
import { Person } from './npcs.js';
import { look } from './cast.js';
import { plain } from '../engine/assets.js';

const KINDS = {
  wolf: { speed: 4.6, reach: 1.6, dmg: 18, hp: 3, cooldown: 1.2 },
  deer: { speed: 5.5, reach: 0, dmg: 0, hp: 1, cooldown: 1, passive: true },
  naga: { speed: 3.0, reach: 1.8, dmg: 14, hp: 3, cooldown: 1.4 },
  wyrm: { speed: 2.4, reach: 2.4, dmg: 35, hp: 999, cooldown: 2.0 },
  illyrian: { speed: 3.4, reach: 2.0, dmg: 12, hp: 4, cooldown: 1.3 },
  spar: { speed: 2.4, reach: 1.9, dmg: 4, hp: 5, cooldown: 1.6 },
  weaver: { speed: 3.9, reach: 1.4, dmg: 0, hp: 999, cooldown: 1, catches: true },
};

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;
    this.enemies = [];
    this.arrows = [];
    this.aiming = false;
    this.hp = 100;
    this.hurt = 0;
    this.swing = 0;
    this.draw = 0;
    this.powerCooldown = 0;
    this.flash = new THREE.PointLight(0xfff4d0, 0, 30, 2);
    ctx.scene.add(this.flash);
    this.arrowGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.8, 5).rotateX(Math.PI / 2);
    this.arrowMat = plain(0x5a4028, 0.6);
  }

  get hasBow() { return this.ctx.playing === 'feyre'; }

  // ---------------------------------------------------------------- spawning
  spawn(R, kind, pos, o = {}) {
    const spec = { ...KINDS[kind], ...o };
    let body = o.body ?? null;
    if (!body) {
      if (kind === 'wolf' || kind === 'deer') body = beast(R, kind, pos);
      else if (kind === 'wyrm') body = wyrm(R, pos);
      else if (kind === 'naga') body = new Person(R.root, look('guard', { skin: 0x3a4a2a, shirt: 0x1a2412, vest: 0x0e140a, trousers: 0x0e140a, mask: 0x2a3a1a, hair: 0x0a0a0a, height: 1.9 }), pos.clone(), R);
      else if (kind === 'illyrian') body = new Person(R.root, look('illyrian', { shirt: 0x2a2018 }), pos.clone(), R);
      if (body instanceof Person) R.people.push(body);
    }
    const e = { kind, tag: o.tag ?? kind, spec, hp: o.hp ?? spec.hp, R, body, cool: 0, stun: 0, dead: false, home: pos.clone() };
    e.pos = body.pos ?? body.position;
    e.pos.y = R.ground(e.pos.x, e.pos.z) ?? e.pos.y;
    this.enemies.push(e);
    return e;
  }

  dead(tag) { const l = this.enemies.filter((e) => e.tag === tag); return l.length > 0 && l.every((e) => e.dead); }

  clear(tag) {
    for (const e of this.enemies.filter((x) => x.tag === tag)) {
      if (!(e.body instanceof Person) || !e.spec.body) e.R.root.remove(e.body.rig?.root ?? e.body);
      if (e.body instanceof Person && !e.spec.body) { const i = e.R.people.indexOf(e.body); if (i >= 0) e.R.people.splice(i, 1); }
      e.body.target = null;
    }
    this.enemies = this.enemies.filter((x) => x.tag !== tag);
  }

  // ---------------------------------------------------------------- the player's moves
  aim(on) { this.aiming = on && this.hasBow && !this.ctx.state.flying; }

  attack() {
    const { player } = this.ctx;
    if (player.locked || this.ctx.busy) return;
    if (this.aiming) { this.shoot(); return; }
    if (this.swing > 0) return;
    this.swing = 0.35;
    const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const target = this.enemies
      .filter((e) => !e.dead && e.R === this.ctx.region)
      .map((e) => [e, e.pos.distanceTo(player.pos)])
      .filter(([e, d]) => d < 2.4 && e.pos.clone().sub(player.pos).setY(0).normalize().dot(fwd) > 0.3)
      .sort((a, b) => a[1] - b[1])[0];
    this.ctx.sound.step(1.4);
    if (target) this.hit(target[0], 1, fwd);
  }

  shoot() {
    if (this.draw < 0.35) return; // a bow needs drawing
    const cam = this.ctx.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const from = this.ctx.player.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(dir, 0.6);
    const m = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    m.position.copy(from);
    this.ctx.scene.add(m);
    this.arrows.push({ m, v: dir.multiplyScalar(48), life: 6, stuck: false });
    this.draw = 0;
  }

  power() {
    if (!this.ctx.story.flag('power') || this.powerCooldown > 0 || this.ctx.playing !== 'feyre') return;
    this.powerCooldown = 8;
    this.flash.position.copy(this.ctx.player.pos).add(new THREE.Vector3(0, 1.5, 0));
    this.flash.intensity = 400;
    this.ctx.post.cutTo(new THREE.Vector2(0, 1));
    for (const e of this.enemies) if (!e.dead && e.R === this.ctx.region && e.pos.distanceTo(this.ctx.player.pos) < 12) e.stun = 3.5;
  }

  hit(e, dmg, dir) {
    if (e.dead || e.spec.hp >= 999) { e.stun = Math.max(e.stun, 0.8); return; }
    e.hp -= dmg;
    e.stun = 0.4;
    e.pos.addScaledVector(dir.clone().setY(0).normalize(), 0.6);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    e.dead = true;
    if (e.body instanceof Person) { e.body.downed = e.kind !== 'spar'; e.body.target = null; if (e.kind === 'spar') e.body.talking = 0; }
    else { e.body.rotation.z = Math.PI / 2; e.body.position.y += 0.3; }
  }

  // ---------------------------------------------------------------- simulation
  update(dt, t) {
    const { player, region } = this.ctx;
    this.swing = Math.max(0, this.swing - dt);
    this.draw = this.aiming ? Math.min(1, this.draw + dt * 1.6) : 0;
    this.powerCooldown = Math.max(0, this.powerCooldown - dt);
    this.flash.intensity *= Math.exp(-dt * 6);
    this.hurt = Math.max(0, this.hurt - dt * 0.35);
    this.hp = Math.min(100, this.hp + dt * 3);
    this.ctx.post.setHurt?.(Math.max(this.hurt, (100 - this.hp) / 140));

    for (const a of this.arrows) {
      if (a.stuck) { a.life -= dt; continue; }
      a.v.y -= 9.8 * dt;
      a.m.position.addScaledVector(a.v, dt);
      a.m.lookAt(a.m.position.clone().add(a.v));
      a.life -= dt;
      for (const e of this.enemies) {
        if (e.dead || e.R !== region) continue;
        const c = e.pos.clone().add(new THREE.Vector3(0, e.kind === 'wyrm' ? 0.5 : 0.9, 0));
        if (c.distanceTo(a.m.position) < (e.kind === 'wyrm' ? 1.4 : 0.8)) { this.hit(e, 1, a.v); a.stuck = true; a.life = 3; }
      }
      const g = region.ground(a.m.position.x, a.m.position.z);
      if (g !== null && a.m.position.y < g) { a.stuck = true; a.life = 6; }
    }
    this.arrows = this.arrows.filter((a) => { if (a.life <= 0) { this.ctx.scene.remove(a.m); return false; } return true; });

    for (const e of this.enemies) {
      if (e.dead || e.R !== region) continue;
      e.cool = Math.max(0, e.cool - dt);
      if (e.stun > 0) { e.stun -= dt; if (e.body instanceof Person) e.body.target = null; continue; }
      const to = player.pos.clone().sub(e.pos); to.y = 0;
      const d = to.length();
      if (e.spec.passive) {
        if (d < 18) { e.pos.addScaledVector(to.normalize(), -e.spec.speed * dt); e.pos.y = region.ground(e.pos.x, e.pos.z) ?? e.pos.y; if (!(e.body instanceof Person)) e.body.rotation.y = Math.atan2(-to.x, -to.z); }
        animateBeast(e, t, d < 18);
        continue;
      }
      const aware = d < (e.kind === 'weaver' ? 60 : 30) || e.kind === 'wyrm' || e.kind === 'spar';
      if (!aware) { animateBeast(e, t, false); continue; }
      if (e.body instanceof Person) {
        e.body.walkSpeed = e.spec.speed;
        if (d > e.spec.reach * 0.8) e.body.goTo(player.pos.clone());
        else { e.body.target = null; e.body.lookAt = player.pos; }
      } else {
        if (d > e.spec.reach * 0.7) {
          e.pos.addScaledVector(to.normalize(), e.spec.speed * dt);
          e.pos.y = region.ground(e.pos.x, e.pos.z) ?? e.pos.y;
          e.body.rotation.y = Math.atan2(to.x, to.z);
        }
        animateBeast(e, t, true, d);
      }
      if (d < e.spec.reach && e.cool <= 0 && !player.locked) {
        e.cool = e.spec.cooldown;
        if (e.spec.catches) { this.caught(e); continue; }
        this.hp -= e.spec.dmg;
        this.hurt = Math.min(1, this.hurt + e.spec.dmg / 40);
        player.vel.addScaledVector(to.normalize(), 3);
        if (this.hp <= 0) this.fall(e);
      }
    }
  }

  async caught(e) {
    const { ctx } = this;
    await ctx.talk(null, async () => {
      await ctx.ui.say('', '<i>Cold fingers close on your wrist. You tear free and run, and when you stop, you are back on the path.</i>', 3200);
    });
    await ctx.travel(e.R.id, 'path');
    e.pos.copy(e.home);
  }

  async fall(e) {
    const { ctx } = this;
    this.hp = 100; this.hurt = 0;
    await ctx.talk(null, async () => {
      await ctx.ui.say('', e.kind === 'spar' ? '<i>Flat on your back in the sand. Cassian offers a hand. You don\'t take it.</i>' : '<i>The ground comes up. When you can see again, you are somewhere safer, and everything hurts.</i>', 3000);
    });
    if (e.kind !== 'spar') {
      const b = ctx.story.beat;
      await ctx.travel(e.R.id, b?.region === e.R.id ? b.place : null);
      if (e.kind === 'wyrm') e.pos.copy(e.home);
    }
  }

  /** Arms for the bow and the dagger, laid over the walk cycle. */
  pose(dt, t) {
    const rig = this.ctx.feyre;
    if (!rig?.arms) return;
    const [L, Rr] = rig.arms[0].side < 0 ? rig.arms : [rig.arms[1], rig.arms[0]];
    if (this.aiming) {
      L.sh.rotation.x = -1.45; L.sh.rotation.z = -0.15; L.elbow.rotation.x = -0.05;
      Rr.sh.rotation.x = -1.35; Rr.sh.rotation.z = 0.5 + this.draw * 0.4; Rr.elbow.rotation.x = -1.6 - this.draw * 0.6;
      rig.spine.rotation.y = -0.5;
    } else if (this.swing > 0) {
      const k = this.swing / 0.35;
      Rr.sh.rotation.x = -2.2 * Math.sin(k * Math.PI); Rr.elbow.rotation.x = -0.4;
      rig.spine.rotation.y = 0.4 * Math.sin(k * Math.PI);
    }
  }
}

// ---------------------------------------------------------------- bodies
function beast(R, kind, pos) {
  const g = new THREE.Group();
  const fur = plain(kind === 'wolf' ? 0x4a4a4c : 0x7a5a3a, 1);
  const s = kind === 'wolf' ? 1.25 : 1.1;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * s, 0.9 * s, 6, 12).rotateX(Math.PI / 2), fur);
  body.position.y = 0.75 * s; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18 * s, 0.5 * s, 8).rotateX(Math.PI / 2), fur);
  head.position.set(0, 0.95 * s, 0.75 * s); g.add(head);
  if (kind === 'wolf') { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.6, 0.4) })); eye.position.set(0.08, 1.02 * s, 0.85 * s); g.add(eye, eye.clone().translateX(-0.16)); }
  else { for (const sx of [-1, 1]) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 4), plain(0x4a3a28)); ant.position.set(sx * 0.1, 1.25 * s, 0.6 * s); ant.rotation.z = sx * 0.4; g.add(ant); } }
  g.userData.legs = [];
  for (const [x, z] of [[-0.15, 0.4], [0.15, 0.4], [-0.15, -0.4], [0.15, -0.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.04 * s, 0.6 * s, 6), fur);
    leg.geometry.translate(0, -0.3 * s, 0); leg.position.set(x * s, 0.6 * s, z * s); g.add(leg); g.userData.legs.push(leg);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.6 * s, 6).rotateX(-Math.PI / 2.4), fur);
  tail.position.set(0, 0.85 * s, -0.75 * s); g.add(tail);
  g.position.copy(pos); g.position.y = R.ground(pos.x, pos.z) ?? 0;
  R.root.add(g);
  return g;
}

function wyrm(R, pos) {
  // the thing in the mud: a ridge of segments that rises when it is close
  const g = new THREE.Group();
  const hide = plain(0x2a2620, 0.5, { metalness: 0.1 });
  g.userData.segs = [];
  for (let i = 0; i < 14; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.9 - i * 0.04, 14, 10), hide);
    seg.position.set(0, 0, -i * 0.9); seg.castShadow = true; g.add(seg); g.userData.segs.push(seg);
  }
  const maw = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 16), plain(0x6a5a50, 0.4));
  maw.position.set(0, 0, 0.7); g.add(maw);
  g.position.copy(pos);
  R.root.add(g);
  return g;
}

function animateBeast(e, t, moving, d = 99) {
  const b = e.body;
  if (b instanceof Person) return;
  if (e.kind === 'wyrm') {
    const rise = d < 10 ? 1 : 0.15; // under the mud until it is close
    b.userData.segs.forEach((s, i) => { s.position.y = (Math.sin(t * 4 - i * 0.7) * 0.35 + 0.2) * rise - (1 - rise) * 0.6; s.position.x = Math.sin(t * 2 - i * 0.5) * 0.4; });
    return;
  }
  const k = moving ? 1 : 0.1;
  b.userData.legs?.forEach((l, i) => { l.rotation.x = Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * k; });
}
