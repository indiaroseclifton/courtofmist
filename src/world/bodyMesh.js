// One continuous, skinned body per person instead of a mannequin of cylinders. The shape is
// sculpted as a signed-distance field (smooth unions of ellipsoids and tapered capsules),
// polygonised with surface nets, projected back onto the field, then skinned to the rig's
// existing groups by distance to each bone's capsule. Clothing is drawn in the fragment
// shader from the rest-pose position, so hems and sleeves are crisp at any tessellation.
import * as THREE from 'three';
import { pbr } from '../engine/assets.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function ell(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
// tapered capsule from a (radius ra) to b (radius rb)
function cone(px, py, pz, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const h = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(qx - bx * h, qy - by * h, qz - bz * h) - (ra + (rb - ra) * h);
}

// ------------------------------------------------------------------ the sculpt
// J holds rest-pose joint positions in body space (right side, x > 0); limbs mirror via |x|.
function bodySDF(J, f) {
  const m = 1 - f;
  return (x, y, z, parts) => {
    const ax = Math.abs(x);
    // torso
    let d = ell(x, y, z, 0, 0.935, -0.01, 0.15 + 0.018 * f, 0.11, 0.112);
    d = smin(d, cone(x, y, z / 0.8, [0, 0.97, 0], [0, 1.16, 0], 0.13 - 0.004 * f, 0.112 - 0.012 * f + 0.012 * m) * 0.8, 0.06);
    d = smin(d, ell(x, y, z, 0, 1.255, -0.008, 0.128 + 0.024 * m, 0.155, 0.096 + 0.01 * m), 0.06);
    d = smin(d, cone(x, y, z, [-0.135, 1.37, -0.018], [0.135, 1.37, -0.018], 0.046 + 0.012 * m, 0.046 + 0.012 * m), 0.06);
    if (f) d = smin(d, ell(ax, y, z, 0.062, 1.255, 0.062, 0.056, 0.054, 0.05), 0.035);
    else d = smin(d, ell(ax, y, z, 0.066, 1.288, 0.052, 0.074, 0.05, 0.04), 0.04);
    d = smin(d, ell(ax, y, z, 0.066, 0.875, -0.052, 0.086 + 0.006 * f, 0.09, 0.07), 0.04);
    // neck up to the jaw; the head grid takes over above this
    d = smin(d, cone(x, y, z, [0, 1.36, -0.012], [0, 1.6, 0.0], 0.056 + 0.004 * m, 0.046), 0.03);
    // arm: deltoid, upper arm, forearm, a mitten hand and thumb
    let a = Math.hypot(ax - J.sh[0] + 0.008, y - J.sh[1] + 0.012, z - J.sh[2] + 0.005) - (0.044 + 0.008 * m);
    a = smin(a, cone(ax, y, z, J.sh, J.el, 0.043 + 0.004 * m, 0.035), 0.03);
    a = smin(a, cone(ax, y, z, J.el, J.wr, 0.036 + 0.003 * m, 0.025), 0.015);
    a = smin(a, ell(ax, y, z, J.hand[0], J.hand[1], J.hand[2], 0.019, 0.085, 0.043), 0.02);
    a = smin(a, cone(ax, y, z, [J.wr[0] - 0.006, J.wr[1] - 0.03, J.wr[2] + 0.026], [J.wr[0] - 0.014, J.wr[1] - 0.075, J.wr[2] + 0.04], 0.012, 0.009), 0.01);
    // leg: thigh, shin, calf, foot
    if (parts) { parts[0] = d; parts[1] = a; }
    d = smin(d, a, 0.012);
    let l = cone(ax, y, z, [J.hip[0], J.hip[1] + 0.03, J.hip[2]], J.kn, 0.086 + 0.004 * f, 0.05);
    l = smin(l, cone(ax, y, z, J.kn, J.an, 0.051, 0.032), 0.02);
    l = smin(l, ell(ax, y, z, J.kn[0], J.kn[1] - 0.13, J.kn[2] - 0.024, 0.048, 0.1, 0.05), 0.03);
    let foot = cone(ax, y, z, [J.an[0], 0.05, J.an[2] - 0.035], [J.an[0], 0.038, J.an[2] + 0.16], 0.044, 0.036);
    foot = smax(foot, -y + 0.002, 0.006);
    l = smin(l, foot, 0.03);
    if (parts) parts[2] = l;
    d = smin(d, l, 0.05);
    return d;
  };
}

function headSDF(J, f) {
  const m = 1 - f;
  const [, hy] = J.headC;
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, hy + 0.012, -0.008, 0.083 + 0.004 * m, 0.102, 0.1);
    d = smin(d, ell(x, y, z, 0, hy - 0.04, 0.028, 0.066 + 0.006 * m, 0.078, 0.072), 0.035);
    d = smin(d, ell(x, y, z, 0, hy - 0.075, 0.035, 0.055 + 0.008 * m, 0.045, 0.055), 0.03);
    d = smin(d, ell(x, y, z, 0, hy - 0.108, 0.062, 0.022 + 0.004 * m, 0.02, 0.02), 0.02);
    d = smin(d, ell(ax, y, z, 0.043, hy - 0.012, 0.057, 0.028, 0.02, 0.028), 0.02);
    d = smin(d, cone(ax, y, z, [0, hy + 0.03, 0.088], [0.048, hy + 0.031, 0.074], 0.011 + 0.002 * m, 0.009), 0.015);
    d = smax(d, -(Math.hypot(ax - 0.032, y - hy - 0.012, z - 0.094) - 0.017), 0.012);
    d = smin(d, cone(x, y, z, [0, hy + 0.03, 0.09], [0, hy - 0.021, 0.111], 0.009, 0.012), 0.012);
    d = smin(d, ell(x, y, z, 0, hy - 0.023, 0.106, 0.016, 0.012, 0.012), 0.006);
    d = smin(d, ell(x, y, z, 0, hy - 0.052, 0.092, 0.021, 0.0072, 0.0105), 0.005);
    d = smin(d, ell(x, y, z, 0, hy - 0.0645, 0.089, 0.019, 0.0085, 0.011), 0.005);
    d = smax(d, -ell(x, y, z, 0, hy - 0.058, 0.1, 0.021, 0.0016, 0.012), 0.002);
    // the ears come to a point: everyone in Prythian who matters is fae
    d = smin(d, cone(ax, y, z, [0.082, hy - 0.012, -0.004], [0.094, hy + 0.04, -0.022], 0.016, 0.004), 0.008);
    // neck, a hair thinner than the body's so the two shells never fight
    d = smin(d, cone(x, y, z, [0, 1.36, -0.012], [0, 1.6, 0.0], 0.0545 + 0.004 * m, 0.0445), 0.03);
    return d;
  };
}

// ------------------------------------------------------------------ surface nets
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
function surfaceNets(fn, [ox, oy, oz], [ex, ey, ez], h) {
  const nx = Math.ceil(ex / h) + 1, ny = Math.ceil(ey / h) + 1, nz = Math.ceil(ez / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  let q = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[q++] = fn(ox + i * h, oy + j * h, oz + k * h);
  const I = (i, j, k) => i + nx * (j + ny * k);
  const cx = nx - 1, cy = ny - 1;
  const C = (i, j, k) => i + cx * (j + cy * k);
  const cellV = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = CORNERS[c]; const v = F[I(i + o[0], j + o[1], k + o[2])]; val[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]), A = CORNERS[a], B = CORNERS[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    cellV[C(i, j, k)] = pos.length / 3;
    pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, axis, outward) => {
    // orient so the face normal points out of the solid along the crossed grid edge
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nrm = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx][axis];
    if (nrm * outward >= 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = F[I(i, j, k)], b = F[I(i + 1, j, k)];
    if ((a < 0) !== (b < 0)) quad(cellV[C(i, j - 1, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i, j - 1, k)], 0, a < 0 ? 1 : -1);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[I(i, j, k)], b = F[I(i, j + 1, k)];
    if ((a < 0) !== (b < 0)) quad(cellV[C(i - 1, j, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)], 1, a < 0 ? 1 : -1);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[I(i, j, k)], b = F[I(i, j, k + 1)];
    if ((a < 0) !== (b < 0)) quad(cellV[C(i - 1, j - 1, k)], cellV[C(i, j - 1, k)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)], 2, a < 0 ? 1 : -1);
  }
  // pull every vertex onto the true surface and take its normal from the field
  const nor = new Float32Array(pos.length);
  const e = h * 0.25;
  for (let v = 0; v < pos.length; v += 3) {
    for (let it = 0; it < 2; it++) {
      const x = pos[v], y = pos[v + 1], z = pos[v + 2];
      const gx = fn(x + e, y, z) - fn(x - e, y, z), gy = fn(x, y + e, z) - fn(x, y - e, z), gz = fn(x, y, z + e) - fn(x, y, z - e);
      const g2 = (gx * gx + gy * gy + gz * gz) / (4 * e * e) || 1;
      const d = fn(x, y, z) / (2 * e * g2);
      if (it === 0) { pos[v] -= gx * d; pos[v + 1] -= gy * d; pos[v + 2] -= gz * d; }
      else { const l = Math.hypot(gx, gy, gz) || 1; nor[v] = gx / l; nor[v + 1] = gy / l; nor[v + 2] = gz / l; }
    }
  }
  return { pos: new Float32Array(pos), nor, idx };
}

// ------------------------------------------------------------------ skinning
// Bone order matches buildHuman: 0 hips, 1 spine, 2 head, 3/4 shoulder/elbow (x<0),
// 5/6 shoulder/elbow (x>0), 7/8/9 hip/knee/ankle (x<0), 10/11/12 hip/knee/ankle (x>0).
// Each vertex is first shared between the sculpt's parts (torso, arm, leg) by how close it
// sits to each part's own surface, then within a part between that part's bones.
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function skin(pos, J, sdf, headFrom) {
  const n = pos.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), zone = new Float32Array(n * 2);
  const parts = [0, 0, 0];
  const sigma = 0.006;
  const proj = (x, y, z, a, b) => { const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2]; return ((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / (bx * bx + by * by + bz * bz); };
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ax = Math.abs(x);
    const R = x < 0 ? 0 : 1; // which side's limbs
    const w = new Map();
    const add = (bone, k) => { if (k > 1e-4) w.set(bone, (w.get(bone) ?? 0) + k); };
    let pt = 1, pa = 0, pl = 0;
    if (v < headFrom) {
      sdf(x, y, z, parts);
      const lo = Math.min(...parts);
      pt = Math.exp(-(parts[0] - lo) / sigma); pa = Math.exp(-(parts[1] - lo) / sigma); pl = Math.exp(-(parts[2] - lo) / sigma);
      const tot = pt + pa + pl; pt /= tot; pa /= tot; pl /= tot;
    }
    // torso: hips below the waist, spine above, head up the neck
    const head = sstep(1.44, 1.53, y), spine = sstep(0.98, 1.1, y) * (1 - head);
    add(2, pt * head); add(1, pt * spine); add(0, pt * (1 - head - spine));
    // arm: shoulder to the elbow, then the forearm and hand
    const t1 = proj(ax, y, z, J.sh, J.el);
    const t = t1 < 1 ? Math.max(0, t1) : 1 + Math.max(0, proj(ax, y, z, J.el, J.wr));
    const fore = sstep(0.86, 1.1, t);
    add(R ? 5 : 3, pa * (1 - fore)); add(R ? 6 : 4, pa * fore);
    // leg: thigh, shin, foot
    const knee = sstep(0.86, 1.08, proj(ax, y, z, [J.hip[0], J.hip[1] + 0.03, J.hip[2]], J.kn));
    const foot = sstep(0.125, 0.075, y);
    const L0 = R ? 10 : 7;
    add(L0, pl * (1 - knee)); add(L0 + 1, pl * knee * (1 - foot)); add(L0 + 2, pl * knee * foot);
    const list = [...w.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    const tot = list.reduce((s2, e) => s2 + e[1], 0);
    list.forEach(([bone, k], i) => { si[v * 4 + i] = bone; sw[v * 4 + i] = k / tot; });
    zone[v * 2] = pa;
    zone[v * 2 + 1] = t;
  }
  return { si, sw, zone };
}

// ------------------------------------------------------------------ assembly
const geoCache = new Map();
export function bodyGeometry(J, female, lod = 0) {
  const key = `${female ? 'f' : 'm'}${lod}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const bh = lod ? 0.026 : 0.0125, hh = lod ? 0.011 : 0.0048;
  const sdf = bodySDF(J, female ? 1 : 0);
  const body = surfaceNets((x, y, z) => sdf(x, y, z), [-0.34, -0.01, -0.22], [0.68, 1.5, 0.46], bh);
  const head = surfaceNets(headSDF(J, female ? 1 : 0), [-0.125, 1.41, -0.135], [0.25, 0.34, 0.27], hh);
  // the body grid stops at y = 1.5, inside the head grid's neck
  const pos = new Float32Array(body.pos.length + head.pos.length);
  pos.set(body.pos); pos.set(head.pos, body.pos.length);
  const nor = new Float32Array(pos.length);
  nor.set(body.nor); nor.set(head.nor, body.nor.length);
  const off = body.pos.length / 3;
  const idx = body.idx.concat(head.idx.map((i) => i + off));
  const { si, sw, zone } = skin(pos, J, sdf, off);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('zone', new THREE.BufferAttribute(zone, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

// ------------------------------------------------------------------ clothing shader
const matCache = new Map();
export function bodyMaterial(o) {
  const key = [o.skin, o.shirt, o.vest, o.trousers, o.boots, o.hair, o.sleeve, o.robe ? 1 : 0].join('|');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x6a4a40) });
  const linen = pbr('linen').map, leather = pbr('leather').map;
  const U = {
    uSkin: { value: new THREE.Color(o.skin) }, uShirt: { value: new THREE.Color(o.shirt) },
    uVest: { value: new THREE.Color(o.vest) }, uTrousers: { value: new THREE.Color(o.trousers) },
    uBoots: { value: new THREE.Color(o.boots) }, uHair: { value: new THREE.Color(o.hair) },
    uSleeve: { value: o.sleeve === 'long' ? 1.94 : 1.06 }, uHeadY: { value: 1.61 },
    uCloth: { value: linen }, uLeather: { value: leather },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 zone; varying vec3 vRest; varying vec3 vRestN; varying vec2 vZone;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vRestN = normal; vZone = zone;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRest; varying vec3 vRestN; varying vec2 vZone;
uniform vec3 uSkin, uShirt, uVest, uTrousers, uBoots, uHair; uniform float uSleeve, uHeadY;
uniform sampler2D uCloth, uLeather;
float tri(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.yz).g * w.x + texture2D(t, p.xz).g * w.y + texture2D(t, p.xy).g * w.z; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 P = vRest; float ax = abs(P.x);
vec3 tw = abs(normalize(vRestN)); tw /= (tw.x + tw.y + tw.z);
float cl = tri(uCloth, P * 9.0, tw), lt = tri(uLeather, P * 4.0, tw);
float arm = smoothstep(0.35, 0.65, vZone.x);
float collar = 1.43 - (P.z > 0.0 ? max(0.0, 0.075 - ax) * 1.7 : 0.0);
vec3 c; float rr;
if (P.y > collar) { c = uSkin; rr = 0.5; }
else if (P.y < 0.47) { c = uBoots * (0.7 + 0.6 * lt); rr = 0.42; }
else if (P.y < 0.975) { c = uTrousers * (0.7 + 0.6 * cl); rr = 0.9; }
else {
  c = uShirt * (0.7 + 0.6 * cl); rr = 0.88;
  bool open = P.z > 0.0 && ax < (P.y - 1.2) * 0.12;
  if (P.y < 1.37 && !open) { c = uVest * (0.65 + 0.7 * lt); rr = 0.58; }
}
if (P.y > 0.955 && P.y < 0.995) { c = uBoots * 0.8 * (0.7 + 0.6 * lt); rr = 0.4; }
if (P.y > 0.44 && P.y < 0.47) c *= 0.75; // the fold at the boot top
vec3 ca = vZone.y < uSleeve ? uShirt * (0.7 + 0.6 * cl) : uSkin;
float ra = vZone.y < uSleeve ? 0.88 : 0.5;
c = mix(c, ca, arm); rr = mix(rr, ra, arm);
// face: brows in the hair colour, lips a little deeper than the skin
float hy = uHeadY;
float bx = ax - 0.031;
float brow = (1.0 - smoothstep(0.016, 0.022, abs(bx))) * (1.0 - smoothstep(0.0025, 0.0045, abs(P.y - (hy + 0.0325 - bx * bx * 9.0 + bx * 0.06)))) * step(0.07, P.z);
c = mix(c, uHair * 0.7, brow * 0.85);
float lip = (1.0 - smoothstep(0.012, 0.021, ax)) * (1.0 - smoothstep(0.006, 0.011, abs(P.y - (hy - 0.058)))) * smoothstep(0.084, 0.092, P.z);
c = mix(c, uSkin * vec3(0.86, 0.62, 0.6), lip * 0.8);
diffuseColor.rgb = c;
float zRough = rr;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = zRough;');
  };
  m.customProgramCacheKey = () => 'courtBody1';
  matCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ eyes and hair
let eyeTex = null;
export function eyeMaterial(iris) {
  if (!eyeTex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#d8d0c6'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#888'; g.fillRect(0, 0, 64, 21);
    g.fillStyle = '#080808'; g.fillRect(0, 0, 64, 6);
    eyeTex = new THREE.CanvasTexture(c); eyeTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshPhysicalMaterial({ map: eyeTex, color: 0xffffff, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02, onBeforeCompile: (sh) => {
    sh.uniforms.uIris = { value: new THREE.Color(iris) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uIris;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (diffuseColor.r < 0.6 && diffuseColor.r > 0.1) diffuseColor.rgb = uIris;');
  } });
}

let strandTex = null;
function hairStrands() {
  if (strandTex) return strandTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 160; i++) {
    const x = 6 + Math.random() * 116, end = 512 * (0.7 + Math.random() * 0.3);
    const v = 150 + Math.random() * 105;
    g.strokeStyle = `rgba(${v},${v},${v},${0.55 + Math.random() * 0.45})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(x, 0);
    g.bezierCurveTo(x + (Math.random() - 0.5) * 10, end * 0.33, x + (Math.random() - 0.5) * 14, end * 0.66, x + (Math.random() - 0.5) * 12, end);
    g.stroke();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.colorSpace = THREE.SRGBColorSpace;
  strandTex.anisotropy = 8;
  return strandTex;
}

const hairMats = new Map();
function hairCardMaterial(color) {
  if (!hairMats.has(color)) {
    hairMats.set(color, new THREE.MeshPhysicalMaterial({ color, map: hairStrands(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55 }));
  }
  return hairMats.get(color);
}

/** Hair cards in head-local space (head group origin is 0.06 below the skull centre). */
export function hairCards(color, len, seed = 1) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const C = new THREE.Vector3(0, 0.062, -0.006); // skull centre in head space
  const R = new THREE.Vector3(0.094, 0.118, 0.11);
  const cards = len < 0.12 ? 70 : 130;
  const steps = 8;
  const pos = [], uv = [], idx = [];
  const inHead = (p) => { const x = (p.x - C.x) / R.x, y = (p.y - C.y) / R.y, z = (p.z - C.z) / R.z; return Math.hypot(x, y, z); };
  for (let c = 0; c < cards; c++) {
    // roots across the crown, back and sides, leaving the face clear
    const theta = Math.acos(1 - r() * 1.25); // polar from the top
    const phi = Math.PI + (r() * 2 - 1) * Math.PI * (theta < 0.7 ? 1 : 0.68);
    let n = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
    // the first cards root along the forehead hairline and sweep back over the crown
    const front = c < cards * 0.22;
    if (front) { const a = (r() - 0.5) * 2.1; n = new THREE.Vector3(Math.sin(a) * 0.62, 0.5 + Math.abs(a) * 0.08, Math.cos(a) * 0.62).normalize(); }
    else if (n.z > 0.35 && n.y < 0.55) continue;
    const p = new THREE.Vector3(C.x + n.x * R.x, C.y + n.y * R.y, C.z + n.z * R.z).addScaledVector(n, 0.002);
    // flow: back from the hairline, otherwise away from the parting and down
    const down = front ? new THREE.Vector3(n.x * 0.3, 0.55, -1) : new THREE.Vector3(n.x * 0.25, -1, -0.25 - Math.max(0, n.z) * 0.8);
    let dir = down.clone().addScaledVector(n, -down.dot(n)).normalize();
    const L = Math.max(0.09, len) * (0.8 + r() * 0.35);
    const seg = L / steps;
    const pts = [p.clone()];
    for (let k = 0; k < steps; k++) {
      dir.y -= front && k < 3 ? 0.04 : len < 0.12 ? 0.12 : 0.22; dir.normalize();
      const q = pts[pts.length - 1].clone().addScaledVector(dir, seg);
      const ih = inHead(q);
      if (ih < 1.06 || q.y > C.y - 0.06) { const out = q.clone().sub(C); out.set(out.x / R.x, out.y / R.y, out.z / R.z).normalize(); const k2 = q.y > C.y - 0.06 ? 1.025 + k * 0.004 : 1.06; q.set(C.x + out.x * R.x * k2, C.y + out.y * R.y * k2, C.z + out.z * R.z * k2); }
      // neck and shoulders, head-space (shoulder line is ~0.17 below the head origin)
      if (q.y < -0.02) {
        const rx = q.y < -0.13 ? 0.19 : 0.075, rz = q.y < -0.13 ? 0.13 : 0.075;
        const e = Math.hypot(q.x / rx, (q.z + 0.012) / rz);
        if (e < 1.05) { q.x *= 1.05 / e; q.z = (q.z + 0.012) * (1.05 / e) - 0.012; }
      }
      dir = q.clone().sub(pts[pts.length - 1]).normalize();
      pts.push(q);
    }
    const w = (len < 0.12 ? 0.05 : 0.04) * (0.8 + r() * 0.4);
    const base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const q = pts[k];
      const t = (k < steps ? pts[k + 1].clone().sub(q) : q.clone().sub(pts[k - 1])).normalize();
      const out = q.clone().sub(C).normalize();
      const side = new THREE.Vector3().crossVectors(t, out).normalize().multiplyScalar(w * (1 - 0.35 * (k / steps)));
      pos.push(q.x - side.x, q.y - side.y, q.z - side.z, q.x + side.x, q.y + side.y, q.z + side.z);
      uv.push(0, 1 - k / steps, 1, 1 - k / steps);
      if (k < steps) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, hairCardMaterial(color));
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: hairStrands(), alphaTest: 0.4 });
  return mesh;
}
