// High-resolution assets: 2K PBR texture sets (public/textures, made by tools/gen_textures.py),
// CC0 HDR environments (public/hdr, Poly Haven via three.js) and glTF models (public/models).
// Everything degrades gracefully: a missing file leaves the material flat rather than broken.
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HF } from '../content/hf_assets.js';

const BASE = import.meta.env.BASE_URL;
const texLoader = new THREE.TextureLoader();
const images = new Map(); // url -> Texture (source of truth, shared images)
let maxAniso = 8;
let pending = 0;
const track = () => { pending++; let done = false; return () => { if (!done) { done = true; pending--; } }; };
/** Resolves once every texture, environment and model requested so far has arrived (or failed). */
export function whenLoaded() {
  return new Promise((res) => { const tick = () => (pending <= 0 ? res() : setTimeout(tick, 100)); tick(); });
}

export function setAnisotropy(renderer) { maxAniso = renderer.capabilities.getMaxAnisotropy(); }

function baseTexture(url, srgb, fallback) {
  if (!images.has(url)) {
    const fin = track();
    // a remote (Higgsfield) map that can't be reached falls back to the local one; a missing
    // local map leaves the material flat
    const t = texLoader.load(url, fin, undefined, () => {
      if (!fallback) return fin();
      texLoader.load(fallback, (tx) => { t.image = tx.image; t.needsUpdate = true; fin(); }, undefined, fin);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    images.set(url, t);
  }
  return images.get(url);
}

function repeated(url, srgb, rx, ry, fallback) {
  const t = baseTexture(url, srgb, fallback).clone(); // shares the image, owns its repeat
  t.repeat.set(rx, ry);
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

const matCache = new Map();
/**
 * A PBR material from a texture set.
 * pbr('setts', { repeat: [40, 40], color: 0xffffff, physical: { clearcoat: .3 } })
 */
export function pbr(name, o = {}) {
  const [rx, ry] = o.repeat ?? [1, 1];
  const key = JSON.stringify([name, rx, ry, o.color, o.roughness, o.normalScale, o.physical, o.emissive, o.side, o.metalness, o.roughFloor]);
  if (matCache.has(key)) return matCache.get(key);
  const p = `${BASE}textures/${name}`;
  // A photographic set generated with Higgsfield, when the manifest has one: albedo and normal
  // come from its CDN (falling back to the local set), and roughness is read from the albedo.
  const hf = HF.textures[name];
  const pick = (kind, srgb) => repeated(hf?.[kind] ?? `${p}_${kind}.jpg`, srgb, rx, ry, hf?.[kind] ? `${p}_${kind}.jpg` : null);
  const params = {
    map: pick('albedo', true),
    roughnessMap: hf ? null : pick('rough', false),
    normalMap: pick('normal', false),
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    side: o.side ?? THREE.FrontSide,
  };
  if (o.emissive) Object.assign(params, o.emissive);
  const m = o.physical ? new THREE.MeshPhysicalMaterial({ ...params, ...o.physical }) : new THREE.MeshStandardMaterial(params);
  const derive = hf ? 1 : 0, rb = hf?.rb ?? 0.7, rs = hf?.rs ?? 0.2, floor = o.roughFloor ?? 0;
  if (derive || floor) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uDerive: { value: derive }, uRB: { value: rb }, uRS: { value: rs }, uFloor: { value: floor } });
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDerive, uRB, uRS, uFloor;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (uDerive > 0.5) { float lum = sqrt(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))); roughnessFactor = clamp(uRB + (0.5 - lum) * uRS * 2.0, 0.05, 1.0) * roughness; }
roughnessFactor = max(roughnessFactor, uFloor); // specular anti-aliasing where asked`);
    };
    m.customProgramCacheKey = () => 'pbrRough1';
  }
  matCache.set(key, m);
  return m;
}

export function plain(color, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

export function emissive(color, intensity = 4) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
}

/** A binary file shipped as base64 JSON, for hosts that only serve web media types. */
async function unpack(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  const { b64 } = await r.json();
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// ---------------------------------------------------------------- HDR environments
const envs = new Map();
let pmrem = null;
export function loadEnv(renderer, name) {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  if (!envs.has(name)) {
    envs.set(name, new Promise((resolve) => {
      const fin = track();
      const done = (tex) => {
        fin();
        if (!tex) { resolve(null); return; }
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const rt = pmrem.fromEquirectangular(tex);
        tex.dispose();
        resolve(rt.texture);
      };
      new HDRLoader().load(`${BASE}hdr/${name}.hdr`, done, undefined, () => unpack(`${BASE}hdr/${name}.hdr.json`).then((buf) => {
        // hosts that will not serve .hdr get a base64 copy; parse it the way HDRLoader would
        const d = new HDRLoader().parse(buf);
        const tex = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
        tex.colorSpace = THREE.LinearSRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false; tex.flipY = true; tex.needsUpdate = true;
        done(tex);
      }).catch(() => done(null)));
    }));
  }
  return envs.get(name);
}

// ---------------------------------------------------------------- models
const gltfLoader = new GLTFLoader();
const models = new Map();
export function loadModel(name) {
  if (!models.has(name)) {
    models.set(name, new Promise((resolve) => {
      const fin = track();
      const ok = (g) => { fin(); resolve(g); }, fail = () => { fin(); resolve(null); };
      gltfLoader.load(`${BASE}models/${name}.glb`, ok, undefined, () => unpack(`${BASE}models/${name}.glb.json`)
        .then((buf) => gltfLoader.parse(buf, `${BASE}models/`, ok, fail)).catch(fail));
    }));
  }
  return models.get(name);
}

/** Place clones of a model, scaled to a height, once it has loaded. */
export function placeModel(name, parent, transforms, height) {
  loadModel(name).then((g) => {
    if (!g) return;
    const box = new THREE.Box3().setFromObject(g.scene);
    const k = height / (box.max.y - box.min.y);
    for (const t of transforms) {
      const c = g.scene.clone(true);
      c.scale.setScalar(k);
      c.position.set(t.x, (t.y ?? 0) - box.min.y * k, t.z);
      c.rotation.y = t.ry ?? 0;
      c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      parent.add(c);
    }
  });
}
