// Procedural material maps. No external assets: every surface is generated from noise
// so the repo stays self-contained. Each generator returns {map, roughnessMap, normalMap}.
import * as THREE from 'three';

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

// Tileable value noise on a period-p lattice.
export function vnoise(x, y, p, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const w = (a) => ((a % p) + p) % p;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s);
  const c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm(u, v, base = 4, oct = 5, s = 0) {
  let f = 0, amp = 0.5, p = base;
  for (let i = 0; i < oct; i++) {
    f += amp * vnoise(u * p, v * p, p, s + i * 17);
    p *= 2; amp *= 0.5;
  }
  return f;
}

function canvasTex(size, fn, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

// Height field -> tangent-space normal map (tileable Sobel).
function normalFromHeight(size, H, strength) {
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  return canvasTex(size, (u, v, x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l) * 0.5 + 0.5, (dy / l) * 0.5 + 0.5, 1 / l * 0.5 + 0.5];
  }, { srgb: false });
}

function buildSet(size, heightFn, colorFn, roughFn, normalStrength) {
  const H = new Float32Array(size * size);
  const cache = new Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = heightFn(x / size, y / size);
    cache[y * size + x] = s;
    H[y * size + x] = s.h;
  }
  return {
    map: canvasTex(size, (u, v, x, y) => colorFn(cache[y * size + x], u, v)),
    roughnessMap: canvasTex(size, (u, v, x, y) => { const r = roughFn(cache[y * size + x], u, v); return [r, r, r]; }, { srgb: false }),
    normalMap: normalFromHeight(size, H, normalStrength),
  };
}

// Wet basalt / limestone setts for quays and streets. Puddles collect in the low joints.
export function wetCobbles(size = 512, tone = [0.36, 0.35, 0.37]) {
  const rows = 8;
  return buildSet(size, (u, v) => {
    const row = Math.floor(v * rows);
    const off = hash(row, 0, 2) * 0.9;
    const cols = 6;
    const wob = (fbm(u, v, 16, 2, 4) - 0.5) * 0.25; // hand-laid, not machined
    const cu = u * cols + off + wob;
    const cell = Math.floor(cu);
    const fu = cu - cell, fv = v * rows - row + wob * 0.6;
    const id = hash(((cell % cols) + cols) % cols, row, 3);
    const round = 0.07 + id * 0.05;
    const edge = Math.min(fu, 1 - fu, fv * 0.7, (1 - fv) * 0.7);
    const joint = Math.min(1, Math.pow(Math.max(0, edge) / round, 0.7));
    const n = fbm(u, v, 8, 5, 1);
    const h = joint * (0.75 + 0.25 * n) + 0.05 * fbm(u, v, 32, 3, 9);
    const puddle = fbm(u, v, 3, 4, 5);
    return { h, joint, id, n, wet: Math.max(0, (puddle - 0.48) * 4) + (1 - joint) * 0.8 };
  }, (s) => {
    const k = 0.6 + s.id * 0.6 + (s.n - 0.5) * 0.35;
    const dark = 1 - Math.min(1, s.wet) * 0.35;
    const m = s.joint < 0.5 ? 0.45 : 1;
    return tone.map((c) => Math.min(1, c * k * dark * m));
  }, (s) => Math.max(0.06, 0.78 - Math.min(1, s.wet) * 0.68 - s.n * 0.08), 2.2);
}

// Coursed ashlar for facades: limestone blocks, soot streaks, rain staining.
export function ashlar(size = 512, tone = [0.62, 0.58, 0.52]) {
  return buildSet(size, (u, v) => {
    const rows = 10, row = Math.floor(v * rows);
    const cu = u * 4 + (row % 2) * 0.5, cell = Math.floor(cu);
    const fu = cu - cell, fv = v * rows - row;
    const joint = Math.min(1, Math.min(fu * 4, (1 - fu) * 4, fv, 1 - fv) / 0.08);
    const n = fbm(u, v, 6, 5, 2);
    const streak = fbm(u * 0.25, v * 4, 4, 3, 11);
    return { h: joint * (0.8 + 0.2 * n), joint, n, streak, id: hash(cell & 3, row, 7) };
  }, (s) => {
    const k = (0.85 + s.id * 0.2 + (s.n - 0.5) * 0.25) * (1 - Math.max(0, s.streak - 0.55) * 0.9);
    const m = s.joint < 0.5 ? 0.6 : 1;
    return tone.map((c) => Math.min(1, c * k * m));
  }, (s) => 0.6 + s.n * 0.3 - Math.max(0, s.streak - 0.6) * 0.5, 1.6);
}

// Painted lime plaster for the Rainbow: pigment that has been rained on for a century.
export function plaster(size = 256, tone = [0.7, 0.4, 0.3]) {
  return buildSet(size, (u, v) => {
    const n = fbm(u, v, 4, 6, 21);
    const flake = fbm(u, v, 16, 3, 22);
    return { h: n * 0.6 + (flake > 0.68 ? 0.3 : 0), n, flake };
  }, (s) => {
    const bare = s.flake > 0.68;
    const base = bare ? [0.6, 0.57, 0.52] : tone;
    const k = 0.82 + s.n * 0.3;
    return base.map((c) => Math.min(1, c * k));
  }, (s) => 0.8 + s.n * 0.15, 1.2);
}

// Weathered leather: pores, crease lines, polished high points.
export function leather(size = 256, tone = [0.23, 0.14, 0.08]) {
  return buildSet(size, (u, v) => {
    const pores = vnoise(u * 96, v * 96, 96, 31);
    const crease = Math.abs(fbm(u, v * 0.5, 6, 4, 32) - 0.5);
    return { h: pores * 0.2 + Math.min(1, crease * 8) * 0.8, pores, crease };
  }, (s) => {
    const k = 0.7 + Math.min(1, s.crease * 6) * 0.45 + s.pores * 0.1;
    return tone.map((c) => Math.min(1, c * k));
  }, (s) => 0.45 + s.pores * 0.25 + (1 - Math.min(1, s.crease * 8)) * 0.15, 1.5);
}

// Woven cloth: visible warp and weft for linen, a finer tight weave for silk.
export function weave(size = 256, tone = [0.86, 0.83, 0.76], threads = 64, slub = 0.35) {
  return buildSet(size, (u, v) => {
    const wu = u * threads, wv = v * threads;
    const over = (Math.floor(wu) + Math.floor(wv)) % 2 === 0;
    const across = over ? Math.sin((wv % 1) * Math.PI) : Math.sin((wu % 1) * Math.PI);
    const s = vnoise(u * threads * 0.25, v * 4, threads / 4, 41);
    return { h: across * (0.8 + slub * (s - 0.5)), across, s };
  }, (st) => tone.map((c) => Math.min(1, c * (0.82 + st.across * 0.2 + (st.s - 0.5) * slub * 0.4))),
  (st) => 0.75 - st.across * 0.15, 1.3);
}

// Weathered timber for the skiff, stalls and shutters.
export function timber(size = 256, tone = [0.33, 0.24, 0.16]) {
  return buildSet(size, (u, v) => {
    const plank = Math.floor(u * 4);
    const grain = fbm(u * 4 + plank * 3.1, v * 0.15, 8, 4, 51 + plank);
    const gap = Math.min(1, Math.min((u * 4) % 1, 1 - ((u * 4) % 1)) / 0.04);
    return { h: gap * (0.6 + grain * 0.4), grain, gap, plank };
  }, (s) => tone.map((c) => Math.min(1, c * (0.6 + s.grain * 0.8) * (s.gap < 0.5 ? 0.4 : 1))),
  (s) => 0.55 + s.grain * 0.35, 1.8);
}

// Rolling ripple normals for the Sidra.
export function waterNormals(size = 256) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    H[y * size + x] = fbm(u, v, 4, 6, 61) + 0.5 * fbm(u, v, 16, 3, 62);
  }
  return normalFromHeight(size, H, 6);
}
