// Swap the procedural mannequin for an authored Feyre model when one is present.
// Drop a rigged GLB (e.g. the Higgsfield/Meshy model built from docs/reference) at
// public/models/feyre.glb. Its first animation clip is used as the walk cycle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const URL_ = `${import.meta.env.BASE_URL}models/feyre.glb`;
const WALK_SPEED = 1.3; // m/s at which the authored walk clip looks right

export function loadFeyreModel(rig, height = 1.68) {
  const state = { model: null, mixer: null, walk: null };
  new GLTFLoader().load(URL_, (gltf) => {
    const model = gltf.scene;
    // stand her on the ground at the right height
    const box = new THREE.Box3().setFromObject(model);
    const s = height / Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        if (o.material) o.material.envMapIntensity = 0.6;
      }
    });
    rig.root.add(model);
    // hide the mannequin; keep the wings, which now hang from her shoulders
    rig.body.visible = false;
    if (rig.hair) rig.hair.lines.visible = false;
    if (rig.wings) {
      rig.root.add(rig.wings);
      rig.wings.position.set(0, 1.36, -0.12);
    }
    if (gltf.animations.length) {
      state.mixer = new THREE.AnimationMixer(model);
      state.walk = state.mixer.clipAction(gltf.animations[0]);
      state.walk.play();
    }
    state.model = model;
  }, undefined, () => { /* no model shipped: keep the procedural figure */ });

  return {
    get loaded() { return !!state.model; },
    update(dt, speed) {
      if (!state.mixer) return;
      const moving = Math.min(1, speed / 0.35);
      state.walk.timeScale = Math.max(0.0, speed / WALK_SPEED);
      state.walk.setEffectiveWeight(moving);
      state.mixer.update(dt);
    },
  };
}
