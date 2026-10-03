// Velaris at night: the Sidra, its quays and bridges, the Rainbow, the Palace of Thread and
// Jewels, the market, the north-bank cliff and the stair to the House of Wind.
//
// World axes: the Sidra runs along X. South bank is +Z, the cliff and the House are -Z.
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { pbr, placeModel } from '../engine/assets.js';
import { fbm } from './textures.js';

export const RIVER_HALF = 14;
export const WATER_Y = -1.35;
export const BRIDGES = [-62, 8, 92];
const BRIDGE_HALF_W = 3.2;
const BRIDGE_RISE = 2.4;
export const STAIR = { x: 0, halfW: 2.6, z0: -64, z1: -196, top: 78 };

export function bridgeHeight(z) {
  const t = z / (RIVER_HALF + 2);
  return BRIDGE_RISE * (1 - t * t);
}

function stairHeight(z) {
  const t = (STAIR.z0 - z) / (STAIR.z0 - STAIR.z1);
  return Math.min(1, Math.max(0, t)) * STAIR.top;
}

function cliffHeight(x, z) {
  if (z > -58) return -50;
  const d = -58 - z;
  const base = Math.min(110, d * 1.6) + fbm(x / 300 + 0.5, z / 300 + 0.5, 4, 4, 7) * 22 - 6;
  return base;
}

// Ground the feet stand on, or null where there is only river.
export function groundHeight(x, z) {
  for (const bx of BRIDGES) {
    if (Math.abs(x - bx) < BRIDGE_HALF_W && Math.abs(z) < RIVER_HALF + 2) return bridgeHeight(z);
  }
  if (Math.abs(z) < RIVER_HALF) return null;
  if (Math.abs(x - STAIR.x) < STAIR.halfW && z <= -59) {
    if (z < STAIR.z1) return z > STAIR.z1 - 34 ? STAIR.top : null;
    return stairHeight(z);
  }
  if (z < STAIR.z1 && z > STAIR.z1 - 34 && Math.abs(x) < 26) return STAIR.top; // House terrace
  if (z < -60) return null; // cliff face: not walkable
  return 0;
}

// Box geometry whose UVs are in "bays" (3 m wide, 3.6 m per floor), so facade textures
// stay at true scale on any building size.
function bayBox(w, h, d, atlasBays = 16) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  const seed = Math.floor(Math.random() * atlasBays);
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const span = nx > 0.5 ? d : w;
    let u = uv.getX(i), v = uv.getY(i);
    if (ny > 0.5) { u *= 0.05; v *= 0.05; } else {
      u = (u * span) / 3 / atlasBays + seed / atlasBays;
      v = (v * h) / 3.6 / atlasBays + ((seed * 7) % atlasBays) / atlasBays;
    }
    uv.setXY(i, u, v);
  }
  return g;
}

// A 16x16-bay facade atlas: window recesses, shutters, glass; a matching emissive map where
// some windows are lit by lamps behind thin curtains.
function facadeAtlas() {
  const S = 1024, B = 16, px = S / B;
  const col = document.createElement('canvas'); col.width = col.height = S;
  const emi = document.createElement('canvas'); emi.width = emi.height = S;
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = S;
  const c = col.getContext('2d'), e = emi.getContext('2d'), r = rgh.getContext('2d');
  c.fillStyle = '#d8d2c8'; c.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  r.fillStyle = '#bbb'; r.fillRect(0, 0, S, S);
  // plaster/stone variation
  const img = c.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) {
    const n = fbm(x / S, y / S, 8, 5, 77);
    const streak = fbm(x / S * 0.5, y / S * 6, 4, 3, 78);
    const k = 0.82 + n * 0.3 - Math.max(0, streak - 0.58) * 0.8;
    const i = (y * S + x) * 4;
    img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
  }
  c.putImageData(img, 0, 0);
  for (let by = 0; by < B; by++) for (let bx = 0; bx < B; bx++) {
    const x0 = bx * px, y0 = by * px;
    const ground = by % 4 === 3; // some bays read as doors/shopfronts
    const ww = px * (ground ? 0.5 : 0.36), wh = px * (ground ? 0.62 : 0.5);
    const wx = x0 + (px - ww) / 2, wy = y0 + px * (ground ? 0.38 : 0.22);
    // sill and lintel
    c.fillStyle = 'rgba(40,36,32,0.35)'; c.fillRect(wx - 3, wy - 5, ww + 6, 5); c.fillRect(wx - 4, wy + wh, ww + 8, 4);
    const lit = Math.random() < (ground ? 0.55 : 0.32);
    const warm = 0.75 + Math.random() * 0.25;
    c.fillStyle = '#16181b'; c.fillRect(wx, wy, ww, wh);
    r.fillStyle = '#1a1a1a'; r.fillRect(wx, wy, ww, wh);
    if (lit) {
      const grd = e.createRadialGradient(wx + ww / 2, wy + wh * 0.6, 2, wx + ww / 2, wy + wh * 0.6, ww);
      grd.addColorStop(0, `rgb(${255 * warm | 0},${170 * warm | 0},${90 * warm | 0})`);
      grd.addColorStop(1, `rgb(${120 * warm | 0},${60 * warm | 0},${22 * warm | 0})`);
      e.fillStyle = grd; e.fillRect(wx, wy, ww, wh);
      // curtain folds
      e.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 4; k++) e.fillRect(wx + (k + 0.5) * ww / 4, wy, 1.5, wh);
    }
    // mullions
    c.fillStyle = '#2a2622'; e.fillStyle = '#000';
    c.fillRect(wx + ww / 2 - 1, wy, 2, wh); e.fillRect(wx + ww / 2 - 1, wy, 2, wh);
    c.fillRect(wx, wy + wh / 2 - 1, ww, 2); e.fillRect(wx, wy + wh / 2 - 1, ww, 2);
    // shutters on some dark windows
    if (!lit && Math.random() < 0.45) {
      c.fillStyle = Math.random() < 0.5 ? '#3c4a4a' : '#4a3a2c';
      c.fillRect(wx, wy, ww / 2 - 1, wh); c.fillRect(wx + ww / 2 + 1, wy, ww / 2 - 1, wh);
    }
    // string course between floors
    c.fillStyle = 'rgba(255,250,240,0.12)'; c.fillRect(x0, y0 + px - 3, px, 3);
  }
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  return { map: mk(col, true), emissiveMap: mk(emi, true), roughnessMap: mk(rgh, false) };
}

export function buildVelaris(scene, moonDir) {
  const city = new THREE.Group();
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const lanternSpots = [];
  const smokeSpots = [];
  const addCollider = (x, z, w, d, pad = 0.2) =>
    colliders.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });

  // ---------- materials ----------
  // 2K PBR sets (tools/gen_textures.py); the rain film on the setts is a clearcoat
  const streetMat = pbr('setts', { repeat: [173, 40], normalScale: 0.55, roughness: 1.6, physical: { clearcoat: 0.45, clearcoatRoughness: 0.2 } });
  const quayMat = pbr('ashlar', { repeat: [10, 2], color: 0x8a8580 });
  const atlas = facadeAtlas();
  const facade = (hex, emissive = 2.2) => new THREE.MeshStandardMaterial({
    map: atlas.map, roughnessMap: atlas.roughnessMap, roughness: 1, color: hex,
    emissiveMap: atlas.emissiveMap, emissive: 0xffffff, emissiveIntensity: emissive,
  });
  const stoneTones = [0xb8b0a4, 0xa69e94, 0xc4baa8, 0x9a948e, 0xb2a796];
  const rainbowTones = [0xc2643c, 0xd4a03a, 0x3d8c8a, 0xb5566e, 0x5b6fb0, 0x7da05a, 0xd27a52, 0x8c5aa8];
  const stoneFacades = stoneTones.map((c) => facade(c));
  const rainbowFacades = rainbowTones.map((c) => facade(c, 2.6));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.1 });
  const timberMat = pbr('timber', { repeat: [1, 1] });
  const lampGlass = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb36b, emissiveIntensity: 6 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.8 });

  // ---------- ground: banks with a cut for the river ----------
  const bankGeo = new THREE.PlaneGeometry(520, 120, 1, 1).rotateX(-Math.PI / 2);
  const south = new THREE.Mesh(bankGeo, streetMat);
  south.position.set(0, 0, RIVER_HALF + 60); south.receiveShadow = true;
  const north = new THREE.Mesh(bankGeo, streetMat);
  north.position.set(0, 0, -RIVER_HALF - 60); north.receiveShadow = true;
  city.add(south, north);

  // quay walls and the river bed
  for (const s of [1, -1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(520, 4, 1.2), quayMat);
    wall.position.set(0, -2, s * (RIVER_HALF + 0.6)); wall.receiveShadow = true;
    city.add(wall);
    // coping stones: a slightly proud, wetter top course
    const cope = new THREE.Mesh(new THREE.BoxGeometry(520, 0.25, 1.6), streetMat);
    cope.position.set(0, 0.06, s * (RIVER_HALF + 0.5)); cope.receiveShadow = true; cope.castShadow = true;
    city.add(cope);
  }
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(520, RIVER_HALF * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0b0f10, roughness: 1 }));
  bed.position.y = -4;
  city.add(bed);

  // ---------- the Sidra ----------
  const water = new Water(new THREE.PlaneGeometry(520, RIVER_HALF * 2), {
    textureWidth: 1024, textureHeight: 1024,
    waterNormals: T.waterNormals(256),
    sunDirection: moonDir.clone().normalize(),
    sunColor: 0x8e9cb8, waterColor: 0x031018, distortionScale: 1.6, fog: true,
  });
  water.material.uniforms.size.value = 3.2;
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  city.add(water);

  // ---------- bridges ----------
  const bridgeWalkMat = streetMat.clone();
  bridgeWalkMat.side = THREE.DoubleSide;
  for (const bx of BRIDGES) {
    const shape = [];
    const segs = 24;
    const span = RIVER_HALF + 2;
    for (let i = 0; i <= segs; i++) {
      const z = -span + (2 * span * i) / segs;
      shape.push(new THREE.Vector2(z, bridgeHeight(z)));
    }
    // deck: an extruded profile
    const deckShape = new THREE.Shape();
    deckShape.moveTo(-span, -0.6);
    for (const p of shape) deckShape.lineTo(p.x, p.y);
    deckShape.lineTo(span, -0.6);
    // the arch underside
    for (let i = segs; i >= 0; i--) {
      const z = -span + (2 * span * i) / segs;
      const a = Math.max(-0.6, bridgeHeight(z) - 0.9 - 2.4 * Math.max(0, 1 - Math.pow(z / (span - 3), 2)));
      deckShape.lineTo(z, Math.min(a, bridgeHeight(z) - 0.5));
    }
    const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape, { depth: BRIDGE_HALF_W * 2, bevelEnabled: false }), quayMat);
    deck.rotation.y = Math.PI / 2;
    deck.position.set(bx - BRIDGE_HALF_W, 0, 0);
    deck.castShadow = deck.receiveShadow = true;
    city.add(deck);
    // walking surface and parapets
    for (const side of [-1, 1]) {
      const pts = shape.map((p) => new THREE.Vector3(bx + side * (BRIDGE_HALF_W - 0.25), p.y + 0.5, p.x));
      const curve = new THREE.CatmullRomCurve3(pts);
      const par = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.28, 6), quayMat);
      par.castShadow = true;
      city.add(par);
      for (const zz of [-span + 1, 0, span - 1]) lanternSpots.push(new THREE.Vector3(bx + side * (BRIDGE_HALF_W - 0.25), bridgeHeight(zz) + 0.8, zz));
    }
    const wpos = [], widx = [];
    for (let i = 0; i <= segs; i++) {
      const z = -span + (2 * span * i) / segs;
      const y = bridgeHeight(z) + 0.02;
      wpos.push(bx - BRIDGE_HALF_W, y, z, bx + BRIDGE_HALF_W, y, z);
      if (i < segs) { const a = i * 2; widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wpos.map((v, k) => (k % 3 === 0 ? v / 520 : k % 3 === 2 ? v / 120 : null)).filter((v) => v !== null), 2));
    wg.setIndex(widx);
    wg.computeVertexNormals();
    const walk = new THREE.Mesh(wg, bridgeWalkMat);
    walk.receiveShadow = true;
    city.add(walk);
  }

  // ---------- buildings ----------
  const rnd = mulberry(1337);
  const buildingsGeo = new Map();
  const pushGeo = (mat, geo) => { if (!buildingsGeo.has(mat)) buildingsGeo.set(mat, []); buildingsGeo.get(mat).push(geo); };
  function building(x, z, w, d, h, mat, roof = true) {
    const g = bayBox(w, h, d);
    g.translate(x, h / 2, z);
    pushGeo(mat, g);
    if (roof) {
      const r = new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.02, Math.min(w, d) * 0.45, 4, 1);
      r.rotateY(Math.PI / 4);
      r.scale(w / Math.hypot(w, d) * Math.SQRT2, 1, d / Math.hypot(w, d) * Math.SQRT2);
      r.translate(x, h + Math.min(w, d) * 0.225, z);
      pushGeo(roofMat, r);
      if (rnd() < 0.6) {
        const ch = new THREE.BoxGeometry(0.8, 2.2, 0.8).translate(x + (rnd() - 0.5) * w * 0.6, h + 1.2, z + (rnd() - 0.5) * d * 0.5);
        pushGeo(roofMat, ch);
        if (rnd() < 0.35) { ch.computeBoundingBox(); const c = ch.boundingBox.getCenter(new THREE.Vector3()); smokeSpots.push(new THREE.Vector3(c.x, h + 2.4, c.z)); }
      }
    }
    addCollider(x, z, w, d);
  }

  // Street plan: a terrace facing each quay, then blocks behind with lanes between.
  function terrace(z0, dir, x0, x1, pick, rows = 3) {
    for (let row = 0; row < rows; row++) {
      const zc = z0 + dir * (row * 22 + 6);
      let x = x0;
      while (x < x1) {
        const w = 7 + rnd() * 8;
        if (rnd() < 0.12) { x += 5; continue; } // lanes
        const d = 9 + rnd() * 4;
        const h = 9 + rnd() * 10 + (row === 0 ? 0 : rnd() * 6);
        building(x + w / 2, zc + dir * d / 2, w, d, h, pick(x));
        x += w + 0.05;
      }
    }
  }
  const stone = () => stoneFacades[Math.floor(rnd() * stoneFacades.length)];
  const rainbow = () => rainbowFacades[Math.floor(rnd() * rainbowFacades.length)];
  // south bank: the Rainbow to the west, the market in the middle, the Palace to the east
  terrace(RIVER_HALF + 13, 1, -230, -110, stone);
  terrace(RIVER_HALF + 13, 1, -108, -26, rainbow, 4);
  terrace(RIVER_HALF + 13, 1, 74, 230, stone);
  terrace(RIVER_HALF + 36, 1, -26, 36, stone, 2);
  // north bank: a single dense terrace below the cliff, with a gap at the stair
  terrace(-RIVER_HALF - 11, -1, -230, -16, stone, 2);
  terrace(-RIVER_HALF - 11, -1, 16, 230, stone, 2);

  // ---------- the Palace of Thread and Jewels ----------
  const palace = new THREE.Group();
  const PX = 52, PZ = RIVER_HALF + 26;
  const palaceMat = pbr('marble', { repeat: [4, 2] });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 24), palaceMat);
  hall.position.set(PX, 8, PZ + 6); hall.castShadow = hall.receiveShadow = true;
  palace.add(hall);
  addCollider(PX, PZ + 6, 40, 24);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4c6a7a, roughness: 0.35, metalness: 0.6 }));
  dome.position.set(PX, 16, PZ + 6); dome.castShadow = true;
  palace.add(dome);
  // arcade: columns and lit archways facing the quay
  const colGeo = new THREE.CylinderGeometry(0.45, 0.55, 9, 16);
  for (let i = 0; i <= 10; i++) {
    const c = new THREE.Mesh(colGeo, palaceMat);
    c.position.set(PX - 20 + i * 4, 4.5, PZ - 7); c.castShadow = true;
    palace.add(c);
    addCollider(c.position.x, c.position.z, 1, 1, 0);
    if (i < 10) {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa75a, emissiveIntensity: 1.6 }));
      glow.position.set(PX - 18 + i * 4, 3.2, PZ - 5.95);
      palace.add(glow);
      lanternSpots.push(new THREE.Vector3(PX - 18 + i * 4, 3.6, PZ - 6.5));
    }
  }
  const entab = new THREE.Mesh(new THREE.BoxGeometry(42, 1.6, 3), palaceMat);
  entab.position.set(PX, 9.8, PZ - 7); entab.castShadow = true;
  palace.add(entab);
  const portico = new THREE.Mesh(new THREE.BoxGeometry(42, 0.3, 6.5), palaceMat);
  portico.position.set(PX, 10.6, PZ - 4.5);
  palace.add(portico);
  city.add(palace);

  // ---------- market stalls along the south quay ----------
  const silkColors = [0x7a1f2b, 0x1f3a6a, 0xa8742a, 0x2f5a46, 0x5a2a6a, 0x8a3a1f];
  const stalls = [];
  for (let i = 0; i < 9; i++) {
    const sx = -22 + i * 6.4, sz = RIVER_HALF + 6.5;
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 2), timberMat);
    top.position.y = 0.95; top.castShadow = top.receiveShadow = true;
    g.add(top);
    for (const [px, pz] of [[-2, -0.9], [2, -0.9], [-2, 0.9], [2, 0.9]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), timberMat);
      p.position.set(px, 1.3, pz); p.castShadow = true;
      g.add(p);
    }
    const silk = T.weave(128, [1, 1, 1], 32, 0.15);
    silk.map.repeat.set(14, 8); silk.normalMap.repeat.set(14, 8);
    const awnMat = new THREE.MeshPhysicalMaterial({
      map: silk.map, normalMap: silk.normalMap, color: silkColors[i % silkColors.length],
      roughness: 0.5, sheen: 0.45, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffe6c8), side: THREE.DoubleSide,
    });
    const awnGeo = new THREE.PlaneGeometry(4.6, 2.6, 12, 6);
    const awn = new THREE.Mesh(awnGeo, awnMat);
    awn.rotation.x = -Math.PI / 2 + 0.5; awn.position.set(0, 2.3, 0.2); awn.castShadow = true;
    awn.userData.rest = awnGeo.attributes.position.array.slice();
    g.add(awn);
    // goods: bolts of cloth, jars, a candle
    for (let k = 0; k < 5; k++) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 12), new THREE.MeshPhysicalMaterial({
        color: silkColors[(i + k + 1) % silkColors.length], sheen: 0.35, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xfff0d0), roughness: 0.5,
      }));
      bolt.rotation.z = Math.PI / 2; bolt.position.set(-1.5 + k * 0.7, 1.13, -0.3 + (k % 2) * 0.4); bolt.castShadow = true;
      g.add(bolt);
    }
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xeee2c8, emissive: 0xffa040, emissiveIntensity: 0.3 }));
    candle.position.set(1.7, 1.1, 0.6);
    g.add(candle);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8) }));
    flame.position.set(1.7, 1.24, 0.6);
    g.add(flame);
    g.position.set(sx, 0, sz);
    g.rotation.y = Math.PI; // stalls face the promenade, backs to the river
    city.add(g);
    stalls.push(awn);
    addCollider(sx, sz, 4.4, 2.2);
    smokeSpots.push(new THREE.Vector3(sx - 1.7, 1.3, sz - 0.6));
    lanternSpots.push(new THREE.Vector3(sx, 1.7, sz - 1.6));
  }

  // ---------- quay lanterns: the CC0 Khronos street lantern, cloned along both quays ----------
  const lanternAt = [];
  for (let x = -220; x <= 220; x += 13) {
    for (const s of [1, -1]) {
      if (BRIDGES.some((b) => Math.abs(b - x) < 5)) continue;
      const z = s * (RIVER_HALF + 1.8);
      // the lamp hangs 1.34 m out on its arm at 2.5 m; turn the arm out over the river
      const ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      lanternAt.push({ x, z, ry });
      lanternSpots.push(new THREE.Vector3(x + Math.cos(ry) * 1.34, 2.5, z - Math.sin(ry) * 1.34));
      addCollider(x, z, 0.4, 0.4, 0.1);
    }
  }
  placeModel('lantern', city, lanternAt, 3.6);
  const glowGeo = new THREE.SphereGeometry(0.09, 10, 8);
  for (const p of lanternSpots.slice(-lanternAt.length)) {
    const glow = new THREE.Mesh(glowGeo, lampGlass); glow.position.copy(p); city.add(glow);
  }

  // ---------- the dock and the skiff mooring ----------
  const DOCK = new THREE.Vector3(-18, 0, RIVER_HALF + 0.5);
  for (let i = 0; i < 8; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, 0.5), quayMat);
    step.position.set(DOCK.x, -0.15 - i * 0.17, RIVER_HALF - 0.1 - i * 0.45);
    step.receiveShadow = true;
    city.add(step);
  }

  // ---------- cliff, stair, and the House of Wind ----------
  const cliffW = 520, cliffD = 220, segX = 260, segZ = 110;
  const cliffGeo = new THREE.PlaneGeometry(cliffW, cliffD, segX, segZ).rotateX(-Math.PI / 2);
  const cp = cliffGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i) - 60 - cliffD / 2;
    let y = cliffHeight(x, z);
    // The stair is cut into the cliff's west shoulder: rock wall on the east hand, the city
    // and the river open below on the west.
    if (z < STAIR.z0 + 2 && z > STAIR.z1 - 4) {
      const edge = STAIR.x + STAIR.halfW + 0.8;
      if (x < edge) y = Math.min(y, stairHeight(z) - 0.3 - Math.max(0, (STAIR.x - STAIR.halfW - x)) * 0.9);
    }
    if (z < STAIR.z1 && z > STAIR.z1 - 34 && Math.abs(x) < 28) y = Math.min(y, STAIR.top - 0.3);
    cp.setY(i, y);
    cp.setZ(i, z);
  }
  cliffGeo.computeVertexNormals();
  const cliff = new THREE.Mesh(cliffGeo, pbr('granite', { repeat: [60, 26], normalScale: 1.5 }));
  cliff.receiveShadow = true; cliff.castShadow = true;
  city.add(cliff);
  // steps: instanced treads, 0.17 m rise each. The real stair is ten thousand of these.
  const run = STAIR.z0 - STAIR.z1;
  const n = Math.round(STAIR.top / 0.17);
  const tread = new THREE.InstancedMesh(new THREE.BoxGeometry(STAIR.halfW * 2, 0.17, run / n + 0.02), quayMat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const z = STAIR.z0 - (i + 0.5) * (run / n);
    m.makeTranslation(STAIR.x, (i + 1) * 0.17 - 0.085 - 0.17, z);
    tread.setMatrixAt(i, m);
  }
  tread.receiveShadow = true; tread.castShadow = true;
  city.add(tread);
  // iron lanterns on the wall side of the stair, every few flights
  const stairLampGeo = new THREE.BoxGeometry(0.3, 0.42, 0.3);
  for (let i = 0; i < 24; i++) {
    const z = STAIR.z0 - (i + 0.5) * run / 24;
    const p = new THREE.Vector3(STAIR.x + STAIR.halfW - 0.2, stairHeight(z) + 1.7, z);
    const lamp = new THREE.Mesh(stairLampGeo, lampGlass); lamp.position.copy(p); city.add(lamp);
    lanternSpots.push(p.clone().add(new THREE.Vector3(-0.3, 0, 0)));
  }
  // a low parapet on the open side
  const parG = new THREE.BoxGeometry(0.35, 0.8, run / 24 + 0.05);
  for (let i = 0; i < 24; i++) {
    const z = STAIR.z0 - (i + 0.5) * run / 24;
    const par = new THREE.Mesh(parG, quayMat);
    par.position.set(STAIR.x - STAIR.halfW - 0.1, stairHeight(z) + 0.2, z);
    par.rotation.x = Math.atan2(STAIR.top, run);
    par.castShadow = true; city.add(par);
  }
  // the House: carved into the mountain, its windows over the city
  const houseMat = facade(0xb9b1a6, 2.8);
  for (const [dx, w, h] of [[0, 34, 26], [-24, 14, 18], [24, 14, 18]]) {
    const g = bayBox(w, h, 16);
    const mesh = new THREE.Mesh(g, houseMat);
    mesh.position.set(dx, STAIR.top + h / 2, STAIR.z1 - 26);
    mesh.castShadow = mesh.receiveShadow = true;
    city.add(mesh);
    addCollider(dx, STAIR.z1 - 26, w, 16);
  }
  const terrace2 = new THREE.Mesh(new THREE.BoxGeometry(56, 1, 36), quayMat);
  terrace2.position.set(0, STAIR.top - 0.5, STAIR.z1 - 16); terrace2.receiveShadow = true;
  city.add(terrace2);
  for (let i = -3; i <= 3; i++) lanternSpots.push(new THREE.Vector3(i * 6, STAIR.top + 2.5, STAIR.z1 - 17));

  // distant ranges
  // ridges, not cones: noise-displaced massifs ringing the valley
  const range = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 1, flatShading: true });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rnd() * 0.2;
    const r = 650 + rnd() * 300;
    const h = 140 + rnd() * 260, rad = 200 + rnd() * 160;
    const g = new THREE.ConeGeometry(rad, h, 28, 10);
    const gp = g.attributes.position;
    for (let k = 0; k < gp.count; k++) {
      const x = gp.getX(k), y = gp.getY(k), z = gp.getZ(k);
      const t = (y + h / 2) / h;
      const n = fbm(x / 900 + i * 0.37, z / 900 + 0.5, 4, 5, 90 + i);
      const ridge = 1 - Math.abs(fbm(x / 500 + i, z / 500, 4, 3, 7) * 2 - 1);
      gp.setY(k, y + (n - 0.5) * h * 0.5 * (1 - t) + ridge * h * 0.15 * (1 - t));
      const sx = 1 + (n - 0.5) * 0.6 * (1 - t);
      gp.setX(k, x * sx); gp.setZ(k, z * sx);
    }
    g.computeVertexNormals();
    const mtn = new THREE.Mesh(g, range);
    mtn.position.set(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r);
    mtn.scale.set(1.6, 1, 1);
    mtn.rotation.y = -a;
    city.add(mtn);
  }

  // merge facades per material
  for (const [mat, geos] of buildingsGeo) {
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    city.add(mesh);
  }

  scene.add(city);

  const marks = {
    rainbow_steps: new THREE.Vector3(-58, 0, RIVER_HALF + 8),
    palace_thread: new THREE.Vector3(PX, 0, PZ - 10),
    sidra_dock: DOCK.clone(),
    stair_foot: new THREE.Vector3(STAIR.x, 0, STAIR.z0 + 4),
    townhouse: new THREE.Vector3(-30, 0, -RIVER_HALF - 6),
  };

  function update(t, wind) {
    water.material.uniforms.time.value = t * 0.35;
    for (const awn of stalls) {
      const p = awn.geometry.attributes.position, rest = awn.userData.rest;
      for (let i = 0; i < p.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1];
        const edge = Math.max(0, (-y + 1.3) / 2.6);
        p.setZ(i, rest[i * 3 + 2] + Math.sin(t * 2.1 + x * 1.3 + awn.id) * 0.05 * edge * wind + Math.sin(t * 5.3 + x * 3) * 0.012 * edge);
      }
      p.needsUpdate = true;
      awn.geometry.computeVertexNormals();
    }
  }

  return { city, water, colliders, lanternSpots, smokeSpots, marks, update, dock: DOCK };
}

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
