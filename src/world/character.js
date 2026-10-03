// Procedural people. Feyre gets simulated hair strands, a bow across her back and folded
// wings; townsfolk share the same rig with lighter detail.
import * as THREE from 'three';
import * as T from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Shared material cache so a crowd costs a handful of programs, not hundreds.
const cache = new Map();
function mat(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function skinMat(tone) {
  return mat(`skin${tone}`, () => new THREE.MeshPhysicalMaterial({
    color: tone, roughness: 0.52,
    // Sheen in a warm red stands in for light bleeding through skin at grazing angles.
    sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x8a3a2a),
    clearcoat: 0.08, clearcoatRoughness: 0.6,
  }));
}

function clothMat(key, tone, kind) {
  return mat(`${key}${tone}`, () => {
    if (kind === 'leather') {
      const L = T.leather(256, [1, 1, 1]);
      for (const t of Object.values(L)) t.repeat.set(2, 2);
      return new THREE.MeshStandardMaterial({ ...L, color: tone, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
    }
    const W = kind === 'silk' ? T.weave(256, [1, 1, 1], 128, 0.1) : T.weave(256, [1, 1, 1], 48, 0.4);
    for (const t of Object.values(W)) t.repeat.set(3, 3);
    return new THREE.MeshPhysicalMaterial({
      map: W.map, normalMap: W.normalMap, roughnessMap: W.roughnessMap, color: tone,
      roughness: 1, sheen: kind === 'silk' ? 1 : 0.45, sheenRoughness: kind === 'silk' ? 0.25 : 0.8,
      sheenColor: new THREE.Color(kind === 'silk' ? 0xffffff : 0xbab2a4),
    });
  });
}

// Combed-hair streaks running crown to nape, for the scalp layer under the strands.
let combed = null;
function combedHair() {
  if (combed) return combed;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512, l = 40 + Math.random() * 216;
    const v = 60 + Math.random() * 150;
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 0.6 + Math.random();
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (Math.random() - 0.5) * 10, l / 2, x + (Math.random() - 0.5) * 6, l); g.stroke();
  }
  combed = new THREE.CanvasTexture(c);
  combed.colorSpace = THREE.SRGBColorSpace;
  return combed;
}

// A tapered limb segment hanging down from its pivot.
function limb(r0, r1, len, material) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 14, 3);
  g.translate(0, -len / 2, 0);
  const cap = new THREE.SphereGeometry(r0, 14, 8);
  const m = new THREE.Mesh(g, material);
  const c = new THREE.Mesh(cap, material);
  m.add(c);
  m.castShadow = c.castShadow = true;
  return m;
}

// Lathe a body section from a radius profile [[y, r], ...]. sx/sz flatten it front-to-back.
function lathe(profile, material, sx = 1, sz = 0.72) {
  const g = new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), 28);
  g.scale(sx, 1, sz);
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildHuman(opt = {}) {
  const o = {
    skin: 0xd8a88a, shirt: 0xe4ddcf, vest: 0x4a2e1c, trousers: 0x2b2722, boots: 0x2a1d14,
    hair: 0x6b4a2c, hairLen: 0.32, height: 1.68, strands: false, bow: false, wings: false,
    vestKind: 'leather', shirtKind: 'linen', robe: null, mask: null, ...opt,
  };
  const s = o.height / 1.68;
  const root = new THREE.Group();
  const body = new THREE.Group(); // scaled and bobbed
  body.scale.setScalar(s);
  root.add(body);

  const skin = skinMat(o.skin);
  const shirt = clothMat('shirt', o.shirt, o.shirtKind);
  const vest = clothMat('vest', o.vest, o.vestKind);
  const trousers = clothMat('trousers', o.trousers, 'linen');
  const boots = clothMat('boots', o.boots, 'leather');

  const hips = new THREE.Group(); hips.position.y = 0.94; body.add(hips);
  const pelvis = lathe([[-0.12, 0.13], [-0.05, 0.165], [0.05, 0.15], [0.1, 0.13]], trousers);
  hips.add(pelvis);

  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  const chest = new THREE.Group(); chest.position.y = 0.16; spine.add(chest);
  // shirt torso, with the vest a little proud of it
  spine.add(lathe([[0, 0.13], [0.12, 0.125], [0.24, 0.145], [0.34, 0.155], [0.42, 0.12], [0.46, 0.06]], shirt));
  spine.add(lathe([[-0.02, 0.142], [0.12, 0.138], [0.24, 0.158], [0.33, 0.163], [0.37, 0.14]], vest, 1.02, 0.76));
  // shirt tail below the vest: lags behind on the move
  const hem = lathe([[-0.16, 0.16], [-0.06, 0.15], [0.0, 0.14]], shirt, 1, 0.78);
  hem.position.y = 0.02; hips.add(hem);
  if (o.robe) {
    const robe = lathe([[-0.94, 0.34], [-0.6, 0.26], [-0.2, 0.18], [0.1, 0.16], [0.42, 0.15], [0.47, 0.05]], clothMat('robe', o.robe, 'silk'), 1, 0.8);
    hips.add(robe);
  }

  const neck = limb(0.045, 0.05, 0.1, skin); neck.rotation.x = Math.PI; neck.position.y = 0.42; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.53; spine.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.098, 32, 24), skin);
  skull.scale.set(0.9, 1.12, 1.0); skull.position.y = 0.06; skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), skin);
  jaw.scale.set(1, 0.9, 1.1); jaw.position.set(0, 0.0, 0.025); head.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8), skin);
  nose.rotation.x = Math.PI / 2 + 0.3; nose.position.set(0, 0.055, 0.1); head.add(nose);
  const eyeM = mat('eye', () => new THREE.MeshPhysicalMaterial({ color: 0x1c2a22, roughness: 0.05, clearcoat: 1 }));
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), eyeM);
    e.position.set(sx * 0.032, 0.075, 0.083); head.add(e);
  }
  if (o.mask) {
    const mk = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 12, -1.1, 2.2, 0.9, 0.9),
      mat(`mask${o.mask}`, () => new THREE.MeshStandardMaterial({ color: o.mask, metalness: 0.9, roughness: 0.3 })));
    mk.position.y = 0.04; mk.scale.set(0.95, 1.1, 1.05);
    head.add(mk);
  }
  const hairMat = mat(`hair${o.hair}`, () => new THREE.MeshStandardMaterial({ color: o.hair, map: combedHair(), roughness: 0.55 }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  cap.scale.set(0.92, 1.12, 1.04); cap.position.set(0, 0.064, -0.006); cap.rotation.x = -0.25; head.add(cap);
  if (!o.strands && o.hairLen > 0.1) {
    const fall = lathe([[-o.hairLen, 0.07], [-o.hairLen * 0.5, 0.1], [0, 0.1], [0.05, 0.06]], hairMat, 1.1, 0.6);
    fall.position.set(0, 0.06, -0.05); head.add(fall);
  }

  // arms
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.19, 0.38, 0); spine.add(sh);
    const upper = limb(0.047, 0.04, 0.29, shirt); sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.29; sh.add(elbow);
    // sleeves rolled to the elbow: forearms are skin
    const cuff = limb(0.05, 0.047, 0.05, shirt); elbow.add(cuff);
    const fore = limb(0.038, 0.03, 0.25, skin); elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.025), skin);
    hand.position.y = -0.29; hand.castShadow = true; elbow.add(hand);
    sh.rotation.z = side * 0.08;
    arms.push({ sh, elbow, side });
  }

  // legs
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 0.085, -0.04, 0); hips.add(hip);
    const thigh = limb(0.075, 0.055, 0.42, trousers); hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const shin = limb(0.052, 0.04, 0.4, trousers); knee.add(shin);
    // Illyrian boots: knee-high, laced, a fold at the top
    const boot = lathe([[-0.4, 0.045], [-0.3, 0.046], [-0.12, 0.058], [-0.04, 0.062], [0.0, 0.066], [0.02, 0.06]], boots, 1, 0.95);
    knee.add(boot);
    const ankle = new THREE.Group(); ankle.position.y = -0.4; knee.add(ankle);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.24), boots);
    foot.geometry.translate(0, -0.03, 0.05); foot.castShadow = true;
    ankle.add(foot);
    legs.push({ hip, knee, ankle, side });
  }

  // bow across the back, quiver at the hip
  if (o.bow) {
    const wood = mat('bow', () => new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.45 }));
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 - 0.5;
      pts.push(V(t * 0.95, -t * 0.62, -0.17 - 0.12 * (1 - 4 * t * t)));
    }
    const bow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 6), wood);
    bow.castShadow = true;
    const strg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts[0], pts[16]]),
      new THREE.LineBasicMaterial({ color: 0xcfc4a8 }));
    const bowG = new THREE.Group(); bowG.add(bow, strg); bowG.position.y = 0.2; bowG.rotation.z = 0.1;
    spine.add(bowG);
    const quiver = limb(0.045, 0.04, 0.5, clothMat('quiver', 0x3a2416, 'leather'));
    quiver.rotation.set(0.3, 0, 0.5); quiver.position.set(0.12, 0.42, -0.14);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.08), mat('fletch', () => new THREE.MeshStandardMaterial({ color: 0x8a8070, side: THREE.DoubleSide })));
      f.position.set((k - 2) * 0.012, 0.05, 0); quiver.add(f);
    }
    spine.add(quiver);
  }

  // Illyrian-style wings: hidden until she takes to the air
  let wings = null;
  if (o.wings) {
    wings = new THREE.Group(); wings.position.set(0, 0.34, -0.12); spine.add(wings);
    const membrane = mat('wing', () => new THREE.MeshPhysicalMaterial({
      color: 0x2c1f1d, roughness: 0.6, side: THREE.DoubleSide, sheen: 0.6, sheenColor: new THREE.Color(0x8a3a2a),
      transmission: 0.0, thickness: 0.1,
    }));
    const bone = mat('wingbone', () => new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.5 }));
    wings.userData.sides = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.x = side * 0.06; wings.add(pivot);
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(side * 1.5, 0.55);
      sh.quadraticCurveTo(side * 1.45, 0.1, side * 1.3, -0.2);
      sh.quadraticCurveTo(side * 1.0, -0.15, side * 0.95, -0.5);
      sh.quadraticCurveTo(side * 0.6, -0.4, side * 0.55, -0.75);
      sh.quadraticCurveTo(side * 0.3, -0.5, 0, -0.35);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), membrane);
      m.castShadow = true;
      pivot.add(m);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 1.6, 6), bone);
      arm.position.set(side * 0.75, 0.275, 0.005);
      arm.rotation.z = -side * (Math.PI / 2 - Math.atan2(0.55, 1.5));
      pivot.add(arm);
      wings.userData.sides.push({ pivot, side });
    }
    wings.scale.setScalar(0.001);
    wings.visible = false;
  }

  // ---- hair strands: verlet chains pinned to the scalp, shaded per vertex (Kajiya-Kay) ----
  let hair = null;
  if (o.strands) hair = new HairSim(head, o.hair, o.hairLen);

  const rig = { root, body, hips, spine, chest, head, arms, legs, hem, wings, hair, phase: Math.random() * 6, lean: 0, bank: 0, wingOpen: 0,
    wingsRest: o.wings && !o.strands ? 0.42 : 0 }; // Illyrians keep their wings folded on show
  return rig;
}

class HairSim {
  constructor(head, color, len) {
    this.head = head;
    this.count = 1400;
    this.segs = 9;
    this.len = len;
    this.base = new THREE.Color(color);
    const n = this.count * this.segs;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.roots = [];
    const rnd = (a) => (Math.sin(a * 12.9898) * 43758.5453) % 1;
    for (let i = 0; i < this.count; i++) {
      // roots over the back and crown of the scalp, parting slightly off-centre
      const u = Math.abs(rnd(i + 1));
      const v = Math.abs(rnd(i + 7.3));
      const theta = Math.PI * (0.08 + 0.5 * v); // polar from top
      const phi = (u * 2 - 1) * Math.PI * 0.6 + Math.PI; // the back and sides of the head, leaving the face clear
      // just above the cap surface, so roots don't show scalp
      const local = V(Math.sin(theta) * Math.sin(phi) * 0.1, Math.cos(theta) * 0.118 + 0.064, Math.sin(theta) * Math.cos(phi) * 0.108);
      const strandLen = len * (0.75 + 0.35 * Math.abs(rnd(i + 3.1)));
      this.roots.push({ local, segLen: strandLen / (this.segs - 1), tone: 0.75 + 0.45 * Math.abs(rnd(i + 5.7)) });
    }
    const idx = [];
    for (let i = 0; i < this.count; i++) for (let k = 0; k < this.segs - 1; k++) idx.push(i * this.segs + k, i * this.segs + k + 1);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.col = new Float32Array(n * 3);
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setIndex(idx);
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.lines.frustumCulled = false;
    this.initialised = false;
    this.tmp = V(0, 0, 0);
    this.center = V(0, 0, 0);
  }

  attach(scene) { scene.add(this.lines); }

  step(dt, lightDir, viewPos, wind) {
    const head = this.head;
    head.updateWorldMatrix(true, false);
    const M = head.matrixWorld;
    const scale = new THREE.Vector3().setFromMatrixScale(M).x;
    this.center.set(0, 0.06, 0).applyMatrix4(M);
    const R = 0.108 * scale;
    if (this.lastCenter && this.lastCenter.distanceTo(this.center) > 1) this.initialised = false;
    this.lastCenter = (this.lastCenter ?? new THREE.Vector3()).copy(this.center);
    const g = -9.8 * dt * dt;
    const p = this.pos, q = this.prev, S = this.segs;
    for (let i = 0; i < this.count; i++) {
      const root = this.tmp.copy(this.roots[i].local).applyMatrix4(M);
      const segLen = this.roots[i].segLen * scale;
      const b = i * S * 3;
      if (!this.initialised) {
        for (let k = 0; k < S; k++) {
          const j = b + k * 3;
          const out = V(root.x - this.center.x, 0, root.z - this.center.z).normalize().multiplyScalar(0.01 * k);
          p[j] = q[j] = root.x + out.x; p[j + 1] = q[j + 1] = root.y - k * segLen; p[j + 2] = q[j + 2] = root.z + out.z;
        }
      }
      p[b] = root.x; p[b + 1] = root.y; p[b + 2] = root.z;
      q[b] = root.x; q[b + 1] = root.y; q[b + 2] = root.z;
      for (let k = 1; k < S; k++) {
        const j = b + k * 3;
        const vx = (p[j] - q[j]) * 0.96, vy = (p[j + 1] - q[j + 1]) * 0.96, vz = (p[j + 2] - q[j + 2]) * 0.96;
        q[j] = p[j]; q[j + 1] = p[j + 1]; q[j + 2] = p[j + 2];
        p[j] += vx + wind.x * dt * dt * (0.5 + 0.5 * Math.sin(i));
        p[j + 1] += vy + g;
        p[j + 2] += vz + wind.z * dt * dt;
      }
      // constraints: segment length, then keep out of the head and shoulders
      for (let it = 0; it < 2; it++) {
        for (let k = 1; k < S; k++) {
          const a = b + (k - 1) * 3, j = b + k * 3;
          let dx = p[j] - p[a], dy = p[j + 1] - p[a + 1], dz = p[j + 2] - p[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const f = segLen / d;
          p[j] = p[a] + dx * f; p[j + 1] = p[a + 1] + dy * f; p[j + 2] = p[a + 2] + dz * f;
          dx = p[j] - this.center.x; dy = p[j + 1] - this.center.y; dz = p[j + 2] - this.center.z;
          const r = Math.hypot(dx, dy, dz);
          if (r < R) { const k2 = R / r; p[j] = this.center.x + dx * k2; p[j + 1] = this.center.y + dy * k2; p[j + 2] = this.center.z + dz * k2; }
          // neck and upper back: a vertical capsule under the head, so hair drapes over the shoulders
          const top = this.center.y - 0.1 * scale, bot = this.center.y - 0.65 * scale;
          if (p[j + 1] < top && p[j + 1] > bot) {
            const ry = p[j + 1] > top - 0.12 * scale ? 0.075 * scale : 0.165 * scale;
            dx = p[j] - this.center.x; dz = p[j + 2] - this.center.z;
            const rr = Math.hypot(dx, dz) || 1e-6;
            if (rr < ry) { p[j] = this.center.x + (dx / rr) * ry; p[j + 2] = this.center.z + (dz / rr) * ry; }
          }
        }
      }
    }
    this.initialised = true;
    // Kajiya-Kay shading along each strand's tangent; roots darker, tips sun-faded.
    const c = this.col, L = lightDir, base = this.base;
    for (let i = 0; i < this.count; i++) {
      const tone = this.roots[i].tone;
      for (let k = 0; k < S; k++) {
        const j = (i * S + k) * 3;
        const a = (i * S + Math.max(0, k - 1)) * 3, bb = (i * S + Math.min(S - 1, k + 1)) * 3;
        let tx = p[bb] - p[a], ty = p[bb + 1] - p[a + 1], tz = p[bb + 2] - p[a + 2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const vx = viewPos.x - p[j], vy = viewPos.y - p[j + 1], vz = viewPos.z - p[j + 2];
        const vl = Math.hypot(vx, vy, vz) || 1;
        const hx = L.x + vx / vl, hy = L.y + vy / vl, hz = L.z + vz / vl;
        const hl = Math.hypot(hx, hy, hz) || 1;
        const th = (tx * hx + ty * hy + tz * hz) / hl;
        const spec = Math.pow(Math.sqrt(Math.max(0, 1 - th * th)), 80) * 0.12;
        const tl2 = tx * L.x + ty * L.y + tz * L.z;
        const diff = 0.25 + 0.35 * Math.sqrt(Math.max(0, 1 - tl2 * tl2));
        const along = k / (S - 1);
        const shade = tone * (0.55 + 0.6 * along) * diff;
        c[j] = base.r * (shade + spec * 2.2) + spec * 0.05; c[j + 1] = base.g * (shade + spec * 2.2) + spec * 0.05; c[j + 2] = base.b * (shade + spec * 2.2) + spec * 0.06;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// Procedural gait. speed in m/s, accel along heading, turn in rad/s.
export function animateHuman(rig, dt, { speed = 0, accel = 0, turn = 0, flying = false, stairs = 0, t = 0, talking = 0 }) {
  const stride = 1.35 + speed * 0.12;
  rig.phase += (speed / stride) * Math.PI * 2 * dt * 0.5;
  const ph = rig.phase;
  const walk = Math.min(1, speed / 1.4);
  const run = Math.max(0, Math.min(1, (speed - 2.2) / 2.5));
  const idle = 1 - walk;
  // weight: the hips drop at each foot strike, and the body leans into acceleration and turns
  rig.lean += ((accel * 0.035 + run * 0.12 + stairs * 0.1) - rig.lean) * Math.min(1, dt * 5);
  rig.bank += ((-turn * speed * 0.03) - rig.bank) * Math.min(1, dt * 4);
  const bob = (Math.abs(Math.cos(ph)) - 0.6) * 0.045 * walk * (1 + run);
  rig.hips.position.y = 0.94 + bob + Math.sin(t * 1.6) * 0.004 * idle - run * 0.04;
  rig.hips.rotation.y = Math.sin(ph) * 0.14 * walk;
  rig.hips.rotation.z = Math.cos(ph) * 0.05 * walk + rig.bank * 0.5;
  rig.spine.rotation.y = -Math.sin(ph) * 0.2 * walk;
  rig.spine.rotation.x = rig.lean + Math.sin(t * 1.6) * 0.01 * idle;
  rig.spine.rotation.z = rig.bank;
  rig.head.rotation.y = Math.sin(ph) * 0.08 * walk + Math.sin(t * 0.4) * 0.15 * idle * (1 - talking);
  rig.head.rotation.x = -rig.lean * 0.6 + Math.sin(t * 3.1) * 0.03 * talking;
  const legAmp = 0.45 * walk + 0.35 * run;
  for (const L of rig.legs) {
    const p = ph + (L.side > 0 ? 0 : Math.PI);
    L.hip.rotation.x = -Math.sin(p) * legAmp - stairs * 0.25 - rig.lean * 0.5;
    // knee folds on the swing, straightens through stance; more on stairs
    const swing = Math.max(0, Math.cos(p));
    L.knee.rotation.x = swing * (0.9 * walk + 0.7 * run) + 0.05 + stairs * 0.45 * swing;
    L.ankle.rotation.x = -Math.sin(p) * 0.25 * walk - 0.05;
  }
  for (const A of rig.arms) {
    const p = ph + (A.side > 0 ? Math.PI : 0);
    A.sh.rotation.x = -Math.sin(p) * (0.38 * walk + 0.4 * run) + Math.sin(t * 1.6 + A.side) * 0.02 * idle + 0.05;
    A.elbow.rotation.x = -(0.2 + 0.3 * walk + 0.8 * run) + Math.sin(p) * 0.1 * walk;
    if (talking) A.elbow.rotation.x -= Math.max(0, Math.sin(t * 2 + A.side)) * 0.4 * talking;
  }
  // shirt tail trails a beat behind the hips
  rig.hem.rotation.x += ((-rig.lean * 0.5 - walk * 0.08 - run * 0.15) - rig.hem.rotation.x) * Math.min(1, dt * 3);
  if (rig.wings) {
    rig.wingOpen += ((flying ? 1 : rig.wingsRest) - rig.wingOpen) * Math.min(1, dt * 3);
    const w = rig.wingOpen;
    rig.wings.visible = w > 0.01;
    rig.wings.scale.setScalar(Math.max(0.001, w));
    for (const { pivot, side } of rig.wings.userData.sides) {
      const beat = flying ? Math.sin(t * 6) * 0.6 : 0;
      pivot.rotation.y = side * (-0.35 + beat * 0.5) * w + side * (1 - w) * 1.2;
      pivot.rotation.z = side * beat * 0.4;
    }
    if (flying) {
      for (const L of rig.legs) { L.hip.rotation.x = 0.15 + Math.sin(t * 1.3 + L.side) * 0.05; L.knee.rotation.x = 0.35; }
      rig.spine.rotation.x = 0.35;
    }
  }
}
