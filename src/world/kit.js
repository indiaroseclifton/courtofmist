// The building kit every region is assembled from. Each helper adds meshes to a parent group
// and, where the player can bump into it, pushes an axis-aligned collider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr, plain, emissive } from '../engine/assets.js';
import { fbm, vnoise } from './textures.js';

export const rand = (seed) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function collider(list, x, z, w, d, pad = 0.2) {
  list.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });
}

function shadow(m, cast = true, recv = true) { m.castShadow = cast; m.receiveShadow = recv; return m; }

// ---------------------------------------------------------------- terrain
/** A displaced ground plane; the same height function answers region.ground(). */
export function terrain(parent, { size = 300, seg = 200, height, material, cx = 0, cz = 0 }) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i) + cx, p.getZ(i) + cz));
  g.computeVertexNormals();
  const m = shadow(new THREE.Mesh(g, material), false, true);
  m.position.set(cx, 0, cz);
  parent.add(m);
  return m;
}

/** Smooth rolling hills plus a few broad features, cheap to sample every frame. */
export function hills(scale = 6, freq = 1 / 160, seed = 1) {
  return (x, z) => (fbm(x * freq + 50, z * freq + 50, 2, 4, seed) - 0.5) * 2 * scale;
}

// ---------------------------------------------------------------- foliage
const leafTextures = new Map();
function leafTexture(kind) {
  if (leafTextures.has(kind)) return leafTextures.get(kind);
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const pal = {
    summer: ['#2f4a1c', '#3d5b22', '#4f6e2a', '#26401a', '#5b7a33'],
    autumn: ['#8a2a0c', '#b5531a', '#c98a22', '#6e1a0e', '#a33d12', '#d6a033'],
    spring: ['#3f6a26', '#4f7d2e', '#2e5520', '#6b8e3a'],
    winter: ['#7a8a84', '#93a09a', '#5f6e69'],
  }[kind] ?? ['#33502a'];
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    if (r > 0.95 * Math.random() + 0.55) continue; // a ragged, roughly round cluster
    const a = Math.random() * Math.PI * 2, l = 10 + Math.random() * 14;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = pal[(Math.random() * pal.length) | 0];
    g.globalAlpha = 1;
    g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -l * 0.45, l, 0); g.quadraticCurveTo(0, l * 0.45, -l, 0); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-l, 0); g.lineTo(l, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  leafTextures.set(kind, t);
  return t;
}

// A conifer branch seen from above: a twig, side twigs, needles; snow lies along the tops.
const branchTextures = new Map();
function branchTexture(snow) {
  if (branchTextures.has(snow)) return branchTextures.get(snow);
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const greens = ['#1c2e1c', '#243a22', '#2e4a2a', '#18261a', '#355230'];
  const needles = (x0, y0, x1, y1, len) => {
    const n = Math.hypot(x1 - x0, y1 - y0) / 2.2, a = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (const sd of [-1, 1]) {
        const b = a + sd * (0.9 + Math.random() * 0.4), l = len * (0.7 + Math.random() * 0.5) * (1 - t * 0.35);
        g.strokeStyle = greens[(Math.random() * greens.length) | 0];
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); g.stroke();
      }
    }
  };
  const twigs = [];
  for (let x = 20; x < W - 40; x += 34) {
    const sd = (x / 34) % 2 ? 1 : -1, l = (110 - x * 0.16) * (0.8 + Math.random() * 0.3);
    const a = sd * (0.75 + Math.random() * 0.25);
    twigs.push([x, H / 2, x + Math.cos(a) * l, H / 2 + Math.sin(a) * l]);
  }
  for (const [x0, y0, x1, y1] of twigs) needles(x0, y0, x1, y1, 16);
  needles(0, H / 2, W - 12, H / 2 + (Math.random() - 0.5) * 6, 20);
  g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W - 20, H / 2); g.stroke();
  if (snow) {
    for (const [x0, y0, x1, y1] of [[0, H / 2, W - 12, H / 2], ...twigs]) {
      const n = Math.hypot(x1 - x0, y1 - y0) / 7;
      for (let i = 0; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (Math.random() < 0.25) continue;
        g.fillStyle = `rgba(${225 + Math.random() * 25},${232 + Math.random() * 20},${240 + Math.random() * 15},1)`;
        g.beginPath(); g.ellipse(x, y, 6 + Math.random() * 8, 4 + Math.random() * 6, Math.random(), 0, Math.PI * 2); g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  branchTextures.set(snow, t);
  return t;
}

function conifer(r) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const H = 11;
  const card = (root, dir, side, len, wid, droop, shade) => {
    // two segments, bending down toward the tip; normals bent outward for soft crowns
    const base = pos.length / 3;
    for (let k = 0; k <= 2; k++) {
      const t = k / 2;
      const c0 = new THREE.Vector3().copy(root).addScaledVector(dir, len * t);
      c0.y -= droop * len * t * t;
      const w = wid * (0.35 + 0.65 * Math.min(1, t * 1.6));
      for (const sd of [-1, 1]) {
        const p = c0.clone().addScaledVector(side, sd * w * 0.5);
        pos.push(p.x, p.y, p.z);
        const n = new THREE.Vector3(p.x, (p.y - H * 0.45) * 0.35 + 1.2, p.z).normalize();
        nor.push(n.x, n.y, n.z);
        uv.push(t, sd < 0 ? 0 : 1);
        const v = shade * (0.45 + 0.55 * t);
        col.push(v, v, v);
      }
    }
    for (let k = 0; k < 2; k++) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  const whorls = 17;
  for (let i = 0; i < whorls; i++) {
    const y = 1.6 + i * ((H - 2.2) / whorls);
    const f = 1 - (y - 1.6) / (H - 1.2);
    const n = Math.max(5, Math.round(7 + f * 5));
    const a0 = r() * 6.28;
    for (let b = 0; b < n; b++) {
      const a = a0 + (b / n) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const len = 0.5 + 3.0 * Math.pow(f, 0.95) * (0.85 + r() * 0.3);
      const dir = new THREE.Vector3(Math.cos(a), -0.12 - r() * 0.12, Math.sin(a)).normalize();
      const side = new THREE.Vector3(-Math.sin(a), (r() - 0.5) * 1.1, Math.cos(a)).normalize();
      card(new THREE.Vector3(Math.cos(a) * 0.1, y + (r() - 0.5) * 0.3, Math.sin(a) * 0.1), dir, side, len, len * 0.95, 0.22, 0.62 + 0.38 * (1 - f));
    }
  }
  // the leader: two crossed upright cards
  for (const a of [0, Math.PI / 2]) {
    const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    card(new THREE.Vector3(0, H - 1.9, 0), new THREE.Vector3(0, 1, 0), side, 1.9, 0.7, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const treeGeoms = new Map();
function treeGeometry(kind) {
  if (treeGeoms.has(kind)) return treeGeoms.get(kind);
  const r = rand(kind.length * 97);
  const trunkParts = [], crownParts = [];
  if (kind === 'pine' || kind === 'snowpine') {
    trunkParts.push(new THREE.CylinderGeometry(0.06, 0.3, 10.5, 9).translate(0, 5.25, 0));
    const out = { trunk: mergeGeometries(trunkParts.map((g) => g.toNonIndexed())), crown: conifer(r) };
    treeGeoms.set(kind, out);
    return out;
  } else {
    // a broadleaf: trunk, three limbs, and a crown of crossed leaf cards
    trunkParts.push(new THREE.CylinderGeometry(0.22, 0.42, 5, 9).translate(0, 2.5, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + r();
      const limb = new THREE.CylinderGeometry(0.08, 0.18, 3.2, 6);
      limb.translate(0, 1.6, 0).rotateZ(0.7).rotateY(a).translate(0, 4.2, 0);
      trunkParts.push(limb);
    }
    for (let i = 0; i < 26; i++) {
      const q = new THREE.PlaneGeometry(2.8, 2.8);
      const phi = r() * Math.PI * 2, th = Math.acos(r() * 1.6 - 0.6);
      const rad = 1.8 + r() * 1.3;
      q.rotateY(r() * Math.PI).rotateX((r() - 0.5) * 1.2);
      q.translate(Math.sin(th) * Math.cos(phi) * rad, 6.2 + Math.cos(th) * rad * 0.8, Math.sin(th) * Math.sin(phi) * rad);
      crownParts.push(q);
    }
  }
  const out = { trunk: mergeGeometries(trunkParts.map((g) => g.toNonIndexed())), crown: mergeGeometries(crownParts.map((g) => g.toNonIndexed())) };
  treeGeoms.set(kind, out);
  return out;
}

/** An instanced stand of trees. avoid(x,z) returns true where none should grow. */
export function forest(parent, { kind = 'summer', count = 200, area = [-100, 100, -100, 100], ground, avoid = () => false, seed = 3, scale = [0.8, 1.5] }) {
  const { trunk, crown } = treeGeometry(kind);
  const r = rand(seed);
  const mats = [];
  for (let i = 0; i < count * 3 && mats.length < count; i++) {
    const x = area[0] + r() * (area[1] - area[0]), z = area[2] + r() * (area[3] - area[2]);
    if (avoid(x, z)) continue;
    const y = ground(x, z);
    if (y === null || y === undefined) continue;
    const s = scale[0] + r() * (scale[1] - scale[0]);
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(s, s * (0.9 + r() * 0.25), s)));
  }
  const trunkMat = pbr('bark', { repeat: [1, 3] });
  let crownMat;
  if (kind === 'pine' || kind === 'snowpine') crownMat = new THREE.MeshStandardMaterial({ map: branchTexture(kind === 'snowpine'), vertexColors: true, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.85 });
  else crownMat = new THREE.MeshStandardMaterial({ map: leafTexture(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  const tm = shadow(new THREE.InstancedMesh(trunk, trunkMat, mats.length));
  const cm = shadow(new THREE.InstancedMesh(crown, crownMat, mats.length));
  mats.forEach((m, i) => { tm.setMatrixAt(i, m); cm.setMatrixAt(i, m); });
  cm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: crownMat.map, alphaTest: 0.45 });
  parent.add(tm, cm);
  return mats.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
}

/** Rose beds: bushes of leaf cards studded with petal-cup blooms. The Spring Court's are muddy at the hem. */
let roseGeo = null;
function roseGeometry() {
  if (roseGeo) return roseGeo;
  const r = rand(404);
  const cards = [];
  for (let i = 0; i < 22; i++) {
    const q = new THREE.PlaneGeometry(0.55, 0.55);
    const phi = r() * Math.PI * 2, th = Math.acos(r() * 0.9);
    q.rotateY(r() * Math.PI).rotateX((r() - 0.5) * 0.9);
    q.translate(Math.sin(th) * Math.cos(phi) * 0.38, 0.35 + Math.cos(th) * 0.32, Math.sin(th) * Math.sin(phi) * 0.38);
    cards.push(q);
  }
  // a bloom: three rings of cupped petals around a tight bud
  const petals = [];
  for (let ring = 0; ring < 3; ring++) {
    const n = 5 + ring;
    for (let k = 0; k < n; k++) {
      const pg = new THREE.SphereGeometry(0.045 - ring * 0.008, 6, 4, 0, Math.PI * 0.7, 0, Math.PI * 0.6);
      pg.scale(1, 1.2, 0.5);
      pg.rotateX(-0.5 + ring * 0.35).translate(0, 0.01 * ring, 0.028 - ring * 0.008).rotateY((k / n) * Math.PI * 2 + ring * 0.6);
      petals.push(pg);
    }
  }
  petals.push(new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0.03, 0));
  roseGeo = { bush: mergeGeometries(cards.map((g) => g.toNonIndexed())), bloom: mergeGeometries(petals.map((g) => g.toNonIndexed())) };
  return roseGeo;
}

export function roses(parent, spots, { colors = [0x8a0f1e, 0xb02a3a, 0xd8a0a8], mud = true, seed = 5 } = {}) {
  const r = rand(seed);
  const { bush, bloom } = roseGeometry();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture('spring'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, color: 0xb8c8a8 });
  const bushes = shadow(new THREE.InstancedMesh(bush, leafMat, spots.length));
  bushes.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafMat.map, alphaTest: 0.45 });
  const blooms = [];
  spots.forEach((p, i) => {
    const s = 0.9 + r() * 0.6;
    bushes.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(s, s, s)));
    for (let k = 0; k < 11; k++) {
      const a = r() * 6.28, h = r();
      const rad = (0.3 + r() * 0.15) * s * Math.sqrt(1 - h * 0.6);
      blooms.push([new THREE.Vector3(p.x + Math.cos(a) * rad, p.y + (0.3 + h * 0.45) * s, p.z + Math.sin(a) * rad), h, a]);
    }
  });
  const bloomMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0xffb0b8), sheenRoughness: 0.35, side: THREE.DoubleSide });
  const bm = shadow(new THREE.InstancedMesh(bloom, bloomMat, blooms.length), true, false);
  const c = new THREE.Color();
  blooms.forEach(([p, h, a], i) => {
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.8, a, (r() - 0.5) * 0.8));
    const sc = 0.9 + r() * 0.5;
    bm.setMatrixAt(i, new THREE.Matrix4().compose(p, tilt, new THREE.Vector3(sc, sc, sc)));
    c.set(colors[(r() * colors.length) | 0]);
    if (mud && h < 0.3) c.lerp(new THREE.Color(0x3a2a1a), 0.5); // mud splashed on the low blooms
    bm.setColorAt(i, c);
  });
  parent.add(bushes, bm);
}

/** Grass tufts: crossed alpha cards that lean in the wind, scattered where the ground is lawn or steppe. */
let tuftTex = null;
export function grassField(parent, { ground, area, count = 20000, seed = 9, color = 0xffffff, avoid = () => false, height = 0.45 }) {
  if (!tuftTex) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    for (let i = 0; i < 260; i++) {
      // blades taper from the root; heights vary so the tuft has a ragged top, not a card edge
      // roots bunched at the centre, blades fanning outward: a tuft, not a hedge
      const gauss = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const x = 256 + gauss * 70, h = 40 + Math.pow(Math.random(), 0.7) * 210, lean = (x - 256) * 1.6 + (Math.random() - 0.5) * 50;
      const v = 70 + Math.random() * 90, dry = Math.random() < 0.3;
      g.fillStyle = dry ? `rgb(${v * 0.95 | 0},${v * 0.85 | 0},${v * 0.5 | 0})` : `rgb(${v * 0.62 | 0},${v * 0.78 | 0},${v * 0.38 | 0})`;
      const w = 1.2 + Math.random() * 2.2;
      g.beginPath(); g.moveTo(x - w, 256); g.quadraticCurveTo(x + lean * 0.35, 256 - h * 0.55, x + lean, 256 - h); g.quadraticCurveTo(x + lean * 0.35 + w * 0.4, 256 - h * 0.55, x + w, 256); g.fill();
    }
    tuftTex = new THREE.CanvasTexture(cv); tuftTex.colorSpace = THREE.SRGBColorSpace;
  }
  const quads = [0, 1, 2].map((k) => new THREE.PlaneGeometry(0.7, height).translate(0, height / 2, 0).rotateY((k / 3) * Math.PI + 0.3));
  const geo = mergeGeometries(quads.map((q) => q.toNonIndexed()));
  const mat = new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = { value: 0 };
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;').replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvec4 wp = instanceMatrix * vec4(position, 1.0);\nfloat sway = sin(time * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.08 + sin(time * 3.1 + wp.x * 1.3) * 0.02;\ntransformed.x += sway * position.y / 0.45;');
  };
  const r = rand(seed);
  const mats = [];
  for (let i = 0; i < count * 2 && mats.length < count; i++) {
    const x = area[0] + r() * (area[1] - area[0]), z = area[2] + r() * (area[3] - area[2]);
    if (avoid(x, z)) continue;
    const y = ground(x, z);
    if (y === null || y === undefined) continue;
    const s = 0.7 + r() * 0.7;
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(s, s * (0.7 + r() * 0.6), s)));
  }
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  im.receiveShadow = true;
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  parent.add(im);
  return (t) => { if (mat.userData.shader) mat.userData.shader.uniforms.time.value = t; };
}

// ---------------------------------------------------------------- architecture
const frameGeo = (() => {
  const parts = [
    [1.1, 0.12, 0.12, 0, -0.85, 0.02], [1.0, 0.1, 0.1, 0, 0.82, 0.02], [0.05, 1.6, 0.06, 0, 0, 0.03],
    [0.9, 0.05, 0.06, 0, 0.22, 0.03], [0.07, 1.68, 0.12, -0.48, 0, 0.02], [0.07, 1.68, 0.12, 0.48, 0, 0.02],
  ].map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  return mergeGeometries(parts);
})();
const glassGeo = new THREE.PlaneGeometry(0.9, 1.6);

/**
 * A house: walls, a roof, framed windows (some lit), a door, perhaps a chimney.
 * facing: the yaw the front faces (0 = +Z).
 */
export function house(parent, colliders, o) {
  const { x, z, w = 7, d = 8, h = 8, facing = 0, wall = 'plaster', wallColor = 0xffffff, roof = 'slate', roofKind = 'gable',
    lit = 0.4, litColor = 0xffa860, y = 0, seed = 1, door = true, chimney = true, smokeSpots, windowsOn = 'front', floorsH = 3.4 } = o;
  const r = rand(seed);
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = facing;
  const wallMat = pbr(wall, { repeat: [Math.max(1, w / 3), Math.max(1, h / 3)], color: wallColor });
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat));
  body.position.y = h / 2; g.add(body);
  const roofMat = pbr(roof, { repeat: [w / 2, d / 2] });
  if (roofKind === 'gable') {
    const shape = new THREE.Shape();
    const rh = Math.min(w, d) * 0.45;
    shape.moveTo(-w / 2 - 0.3, 0); shape.lineTo(0, rh); shape.lineTo(w / 2 + 0.3, 0); shape.lineTo(-w / 2 - 0.3, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
    rg.translate(0, h, -d / 2 - 0.3);
    g.add(shadow(new THREE.Mesh(rg, roofMat)));
  } else if (roofKind === 'hip') {
    const rg = new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.05, Math.min(w, d) * 0.5, 4).rotateY(Math.PI / 4);
    rg.scale(w / Math.hypot(w, d) * Math.SQRT2, 1, d / Math.hypot(w, d) * Math.SQRT2);
    const m = shadow(new THREE.Mesh(rg, roofMat)); m.position.y = h + Math.min(w, d) * 0.25; g.add(m);
  } else {
    const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), pbr('ashlar', { repeat: [w / 3, 1] }))); m.position.y = h + 0.2; g.add(m);
  }
  if (chimney && r() < 0.7) {
    const cx = (r() - 0.5) * w * 0.5;
    const c = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.7), pbr('ashlar', { repeat: [0.5, 1] })));
    c.position.set(cx, h + 1.4, 0); g.add(c);
    if (smokeSpots && r() < 0.6) smokeSpots.push(new THREE.Vector3(cx, h + 2.7, 0).applyEuler(g.rotation).add(g.position));
  }
  const frameMat = plain(0x2a2018, 0.7);
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.08, metalness: 0.2 });
  const litGlass = emissive(litColor, 2.6);
  const faces = windowsOn === 'all' ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [0];
  for (const fa of faces) {
    const along = fa === 0 || fa === Math.PI ? w : d;
    const depth = fa === 0 || fa === Math.PI ? d : w;
    const cols = Math.max(1, Math.floor(along / 2.6));
    const floors = Math.max(1, Math.floor((h - 0.8) / floorsH));
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const lx = -along / 2 + (c + 0.5) * along / cols;
        if (f === 0 && door && c === Math.floor(cols / 2)) continue;
        const wy = 1.9 + f * floorsH;
        const holder = new THREE.Group();
        holder.rotation.y = fa;
        const fr = new THREE.Mesh(frameGeo, frameMat); fr.position.set(lx, wy, depth / 2 + 0.01);
        const gl = new THREE.Mesh(glassGeo, r() < lit ? litGlass : darkGlass); gl.position.set(lx, wy, depth / 2 + 0.005);
        holder.add(fr, gl);
        g.add(holder);
      }
    }
  }
  if (door) {
    const dm = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.12), pbr('oak', { repeat: [0.5, 1] })));
    dm.position.set(0, 1.15, d / 2 + 0.04); g.add(dm);
  }
  parent.add(g);
  // collider in world space (rotation by right angles only)
  const swap = Math.abs(Math.sin(facing)) > 0.5;
  collider(colliders, x, z, swap ? d : w, swap ? w : d);
  return g;
}

export function box(parent, size, pos, mat, colliders, rotY = 0) {
  const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(...size), mat));
  m.position.set(...pos); m.rotation.y = rotY;
  parent.add(m);
  if (colliders) {
    const swap = Math.abs(Math.sin(rotY)) > 0.5;
    collider(colliders, pos[0], pos[2], swap ? size[2] : size[0], swap ? size[0] : size[2]);
  }
  return m;
}

export function column(parent, x, z, h, r, mat, colliders, y = 0) {
  const c = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 20), mat));
  c.position.set(x, y + h / 2, z); parent.add(c);
  const cap = shadow(new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.3, r * 2.6), mat));
  cap.position.set(x, y + h + 0.15, z); parent.add(cap);
  if (colliders) collider(colliders, x, z, r * 2, r * 2, 0.1);
  return c;
}

/** A pointed or round arch spanning `span` metres, extruded `depth` deep. */
export function arch(parent, { x, z, span = 4, h = 6, depth = 1, mat, rotY = 0, pointed = true, y = 0 }) {
  const s = new THREE.Shape();
  const half = span / 2, t = 0.6;
  s.moveTo(-half - t, 0); s.lineTo(-half - t, h + t + 1); s.lineTo(half + t, h + t + 1); s.lineTo(half + t, 0); s.lineTo(half, 0);
  s.lineTo(half, h - half);
  if (pointed) { s.quadraticCurveTo(half, h - half * 0.1, 0, h); s.quadraticCurveTo(-half, h - half * 0.1, -half, h - half); }
  else s.absarc(0, h - half, half, 0, Math.PI, false);
  s.lineTo(-half, 0); s.lineTo(-half - t, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  const m = shadow(new THREE.Mesh(g, mat)); m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m);
  return m;
}

/** A hide tent with a smoke hole. */
export function tent(parent, colliders, { x, z, y = 0, r = 2.4, h = 3, rotY = 0, color = 0x8a7a62 }) {
  const g = new THREE.ConeGeometry(r, h, 9, 3, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i); const k = 1 + Math.sin(i * 1.7) * 0.03 * (h / 2 - yy); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  const m = shadow(new THREE.Mesh(g, pbr('leather', { repeat: [3, 2], color, side: THREE.DoubleSide })));
  m.position.set(x, y + h / 2, z); m.rotation.y = rotY; parent.add(m);
  const poles = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h + 0.8, 5), pbr('timber')));
  poles.position.set(x, y + (h + 0.8) / 2, z); parent.add(poles);
  collider(colliders, x, z, r * 1.5, r * 1.5, 0);
}

/** A torch or brazier: a flame that the region's light pool will light. */
export function torch(parent, spots, { x, z, y = 0, h = 2.2, brazier = false, smoke }) {
  if (brazier) {
    const b = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.5, 14, 1, true), plain(0x1a1614, 0.5, { metalness: 0.8, side: THREE.DoubleSide })));
    b.position.set(x, y + h, z); parent.add(b);
    const stand = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, h, 8), plain(0x1a1614, 0.5, { metalness: 0.8 })));
    stand.position.set(x, y + h / 2, z); parent.add(stand);
  } else {
    const p = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 6), pbr('timber')));
    p.position.set(x, y + h / 2, z); parent.add(p);
  }
  const fl = new THREE.Mesh(new THREE.SphereGeometry(brazier ? 0.28 : 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.6, 0.7) }));
  fl.scale.y = 1.6; fl.position.set(x, y + h + (brazier ? 0.35 : 0.18), z); fl.userData.flame = true;
  parent.add(fl);
  spots.push(new THREE.Vector3(x, y + h + 0.5, z));
  if (smoke) smoke.push(new THREE.Vector3(x, y + h + 0.8, z));
  return fl;
}

/** Bookshelf bay with instanced book spines in leather colours. */
export function shelves(parent, colliders, { x, z, w = 4, h = 6, rotY = 0, seed = 1, gaps = 0 }) {
  const r = rand(seed);
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  const oak = pbr('oak', { repeat: [1, 2] });
  const back = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), oak)); back.position.set(0, h / 2, -0.25); g.add(back);
  const rows = Math.floor(h / 0.5);
  const books = [];
  for (let i = 0; i < rows; i++) {
    const sy = 0.1 + i * 0.5;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.42), oak); board.position.set(0, sy, 0.21); g.add(board);
    let bx = -w / 2 + 0.05;
    while (bx < w / 2 - 0.1) {
      const bw = 0.03 + r() * 0.05, bh = 0.26 + r() * 0.16;
      if (r() < gaps) { bx += bw + 0.02; continue; }
      books.push([bx + bw / 2, sy + 0.02 + bh / 2, bw, bh, r()]);
      bx += bw + 0.003;
    }
  }
  const pal = [0x5a1a14, 0x1c2a40, 0x2a3a1a, 0x4a3018, 0x6a4a20, 0x2a1a2a, 0x7a6a50, 0x3a1a0a];
  const bm = shadow(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.32), new THREE.MeshStandardMaterial({ roughness: 0.6 }), books.length));
  const c = new THREE.Color();
  books.forEach(([bx, by, bw, bh, k], i) => {
    bm.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(bx, by, 0.19), new THREE.Quaternion(), new THREE.Vector3(bw, bh, 1)));
    bm.setColorAt(i, c.set(pal[(k * pal.length) | 0]).multiplyScalar(0.8 + k * 0.4));
  });
  g.add(bm);
  parent.add(g);
  const swap = Math.abs(Math.sin(rotY)) > 0.5;
  collider(colliders, x, z, swap ? 0.6 : w, swap ? w : 0.6);
  return g;
}

/** A small rowing or fishing boat. */
export function boat(parent, { x, z, y = 0, rotY = 0, len = 5 }) {
  const g = new THREE.Group();
  const hull = shadow(new THREE.Mesh(new THREE.CylinderGeometry(len * 0.18, len * 0.12, len, 16, 1, true, -Math.PI / 2, Math.PI), pbr('timber', { repeat: [1, 2], side: THREE.DoubleSide })));
  hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.6); hull.position.y = len * 0.1;
  g.add(hull);
  g.position.set(x, y, z); g.rotation.y = rotY;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- atmosphere
/** Falling snow, drifting petals, embers or dust motes around the camera. */
export function weather(kind, count = 1500) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 60;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const spec = {
    snow: { color: 0xffffff, size: 0.09, fall: 1.2, drift: 0.6, opacity: 0.85 },
    petals: { color: 0xf3c0c8, size: 0.07, fall: 0.35, drift: 1.2, opacity: 0.9 },
    embers: { color: 0xff8a3a, size: 0.05, fall: -0.6, drift: 0.4, opacity: 0.9, blend: THREE.AdditiveBlending },
    dust: { color: 0xffe2b0, size: 0.03, fall: 0.03, drift: 0.12, opacity: 0.55, blend: THREE.AdditiveBlending },
    spray: { color: 0xe8f2f8, size: 0.06, fall: 0.2, drift: 1.5, opacity: 0.4 },
    leaves: { color: 0xc4561a, size: 0.12, fall: 0.6, drift: 1.4, opacity: 0.95 },
  }[kind];
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: spec.color, size: spec.size, map: new THREE.CanvasTexture(c), transparent: true, opacity: spec.opacity,
    depthWrite: false, blending: spec.blend ?? THREE.NormalBlending,
  }));
  pts.frustumCulled = false;
  pts.userData.update = (dt, t, center) => {
    const p = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      y -= spec.fall * dt * (0.6 + (i % 7) / 10);
      x += Math.sin(t * 0.7 + i) * spec.drift * dt;
      z += Math.cos(t * 0.5 + i * 1.3) * spec.drift * dt * 0.6;
      // wrap inside a 60 m box around the camera
      x = center.x + ((((x - center.x) + 30) % 60 + 60) % 60) - 30;
      z = center.z + ((((z - center.z) + 30) % 60 + 60) % 60) - 30;
      y = center.y + ((((y - center.y) + 20) % 40 + 40) % 40) - 20;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  };
  return pts;
}

/** The Wall: a faint, rippling sheet of power stretched across the mortal border. */
export function theWall(parent, { z, width = 600, height = 120 }) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; varying vec2 vUv; varying vec3 vW;
      void main(){
        float w = sin(vW.x * 0.35 + time * 0.8 + sin(vW.y * 0.2 + time * 0.3) * 2.0) * 0.5 + 0.5;
        float band = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
        float a = (0.025 + 0.05 * pow(w, 6.0)) * band;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), mat);
  m.position.set(0, height / 2 - 10, z);
  m.userData.update = (t) => { mat.uniforms.time.value = t; };
  parent.add(m);
  return m;
}

/** Stone steps rising from (x, z0) to (x, z1) by `rise`, `width` wide, as one instanced mesh. */
export function steps(parent, { x, z0, z1, y0 = 0, rise, width = 3, mat, stepH = 0.17 }) {
  const n = Math.max(1, Math.round(rise / stepH));
  const run = (z1 - z0) / n;
  const im = shadow(new THREE.InstancedMesh(new THREE.BoxGeometry(width, stepH, Math.abs(run) + 0.02), mat, n));
  for (let i = 0; i < n; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y0 + (i + 0.5) * stepH, z0 + (i + 0.5) * run));
  parent.add(im);
  return im;
}

/** Sea or lake surface for the regions that are not on the Sidra. */
export async function waterPlane(parent, { size = 800, y = 0, x = 0, z = 0, color = 0x0a2a33, sunDir, sunColor = 0xffffff, distortion = 2.5 }) {
  const { Water } = await import('three/examples/jsm/objects/Water.js');
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/waternormals.jpg`);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const w = new Water(new THREE.PlaneGeometry(size, size), {
    textureWidth: 1024, textureHeight: 1024, waterNormals: tex, sunDirection: sunDir.clone().normalize(),
    sunColor, waterColor: color, distortionScale: distortion, fog: true,
  });
  w.rotation.x = -Math.PI / 2; w.position.set(x, y, z);
  parent.add(w);
  return w;
}
