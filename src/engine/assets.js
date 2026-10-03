// High-resolution assets: 2K PBR texture sets (public/textures, made by tools/gen_textures.py),
// CC0 HDR environments (public/hdr, Poly Haven via three.js) and glTF models (public/models).
// Everything degrades gracefully: a missing file leaves the material flat rather than broken.
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
const texLoader = new THREE.TextureLoader();
const images = new Map(); // url -> Texture (source of truth, shared images)
let maxAniso = 8;

export function setAnisotropy(renderer) { maxAniso = renderer.capabilities.getMaxAnisotropy(); }

function baseTexture(url, srgb) {
  if (!images.has(url)) {
    const t = texLoader.load(url, undefined, undefined, () => { /* missing map: material stays flat */ });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    images.set(url, t);
  }
  return images.get(url);
}

function repeated(url, srgb, rx, ry) {
  const t = baseTexture(url, srgb).clone(); // shares the image, owns its repeat
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
  const key = JSON.stringify([name, rx, ry, o.color, o.roughness, o.normalScale, o.physical, o.emissive, o.side, o.metalness]);
  if (matCache.has(key)) return matCache.get(key);
  const p = `${BASE}textures/${name}`;
  const params = {
    map: repeated(`${p}_albedo.jpg`, true, rx, ry),
    roughnessMap: repeated(`${p}_rough.jpg`, false, rx, ry),
    normalMap: repeated(`${p}_normal.jpg`, false, rx, ry),
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    side: o.side ?? THREE.FrontSide,
  };
  if (o.emissive) Object.assign(params, o.emissive);
  const m = o.physical ? new THREE.MeshPhysicalMaterial({ ...params, ...o.physical }) : new THREE.MeshStandardMaterial(params);
  matCache.set(key, m);
  return m;
}

export function plain(color, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

export function emissive(color, intensity = 4) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
}

// ---------------------------------------------------------------- HDR environments
const envs = new Map();
let pmrem = null;
export function loadEnv(renderer, name) {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  if (!envs.has(name)) {
    envs.set(name, new Promise((resolve) => {
      new HDRLoader().load(`${BASE}hdr/${name}.hdr`, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const rt = pmrem.fromEquirectangular(tex);
        tex.dispose();
        resolve(rt.texture);
      }, undefined, () => resolve(null));
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
      gltfLoader.load(`${BASE}models/${name}.glb`, (g) => resolve(g), undefined, () => resolve(null));
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
