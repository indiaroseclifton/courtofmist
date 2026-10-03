// Authored characters: rigged, textured GLBs (generated with Higgsfield / Meshy) that take
// over from the procedural body once they arrive. Locomotion (idle, walk, run) is blended by
// speed; actions (the bow, the blade) play on the upper body only, over whatever the legs are
// doing, by driving a hidden copy of the skeleton and laying its spine, arms and head onto the
// visible one. If no model can be fetched, the procedural figure simply stays.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HF } from '../content/hf_assets.js';

const BASE = import.meta.env.BASE_URL;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map(); // url -> Promise<gltf>
const fetchGltf = (url) => {
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => loader.load(url, res, undefined, rej)));
  return cache.get(url);
};
async function firstAvailable(urls) {
  for (const u of urls) { try { return await fetchGltf(u); } catch { /* try the next source */ } }
  return null;
}

const UPPER = /Spine|neck|Head|Shoulder|Arm|Hand/;
const WALK_SPEED = 1.3, RUN_SPEED = 4.6;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Clips arrive named walk/idle/run/shoot/slash (tools/hf/models.mjs); an older single-clip
// export is treated as the walk. Root drift is pinned so the controller owns movement.
function prepareClips(gltf) {
  const clips = {};
  for (const c of gltf.animations) {
    const name = /^(walk|idle|run|shoot|slash)$/.test(c.name) ? c.name : 'walk';
    const clip = c.clone();
    for (const tr of clip.tracks) {
      if (/Hips\.position$/.test(tr.name)) {
        const v = tr.values;
        for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
      }
    }
    clips[name] = clip;
  }
  return clips;
}

/** Give a procedural rig an authored body. Returns a controller with update/play/aim. */
export function attachAuthored(rig, key, { height = 1.7 } = {}) {
  const st = { model: null, mixer: null, ghostMixer: null, base: {}, actions: {}, pairs: [], one: null, oneW: 0, hold: false };
  const urls = [`${BASE}models/${key}.glb`, HF.models?.[key]].filter(Boolean);
  firstAvailable(urls).then((gltf) => {
    if (!gltf) return;
    const model = SkeletonUtils.clone(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const s = height / Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the animation
      const m = o.material;
      if (m) { m.envMapIntensity = 0.7; if (m.emissive) m.emissive.setRGB(0, 0, 0); }
    });
    rig.root.add(model);
    rig.body.visible = false;
    if (rig.hair) rig.hair.lines.visible = false;
    if (rig.wings) { rig.root.add(rig.wings); rig.wings.position.set(0, height * 0.81, -0.13); }

    const clips = prepareClips(gltf);
    st.mixer = new THREE.AnimationMixer(model);
    for (const n of ['idle', 'walk', 'run']) {
      if (!clips[n]) continue;
      const a = st.mixer.clipAction(clips[n]);
      a.play(); a.setEffectiveWeight(0);
      st.base[n] = a;
    }
    if (!st.base.idle && st.base.walk) st.base.idle = null;
    // upper-body actions run on an invisible twin, then are blended onto the real bones
    if (clips.shoot || clips.slash) {
      const ghost = SkeletonUtils.clone(gltf.scene);
      st.ghostMixer = new THREE.AnimationMixer(ghost);
      const real = new Map(); model.traverse((o) => { if (o.isBone) real.set(o.name, o); });
      ghost.traverse((o) => { if (o.isBone && UPPER.test(o.name) && real.has(o.name)) st.pairs.push([real.get(o.name), o]); });
      for (const n of ['shoot', 'slash']) {
        if (!clips[n]) continue;
        const a = st.ghostMixer.clipAction(clips[n]);
        a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
        st.actions[n] = a;
      }
    }
    st.model = model;
  });

  const q = new THREE.Quaternion();
  return {
    get loaded() { return !!st.model; },
    /** Play an upper-body action once: 'shoot' or 'slash'. */
    play(name) {
      const a = st.actions[name];
      if (!a) return;
      if (st.one && st.one !== a) st.one.stop();
      a.reset(); a.paused = false; a.timeScale = name === 'shoot' && st.hold ? 1.6 : 1.25; a.play();
      st.one = a; st.hold = false;
    },
    /** Hold the bow at full draw while aiming; releasing without a shot lowers it. */
    aim(on) {
      const a = st.actions.shoot;
      if (!a) return;
      if (on && !st.hold) { a.reset(); a.timeScale = 1.1; a.play(); st.one = a; st.hold = true; }
      if (!on && st.hold) { st.hold = false; a.paused = false; }
    },
    update(dt, speed) {
      if (!st.mixer) return;
      const moving = smooth(0.05, 0.6, speed);
      const run = st.base.run ? smooth(2.4, RUN_SPEED, speed) : 0;
      const { idle, walk, run: runA } = st.base;
      if (idle) idle.setEffectiveWeight(1 - moving);
      if (walk) { walk.setEffectiveWeight(idle ? moving * (1 - run) : 1 - run); walk.timeScale = idle ? Math.min(1.7, Math.max(0.6, speed / WALK_SPEED)) : speed / WALK_SPEED; }
      if (runA) { runA.setEffectiveWeight(moving * run); runA.timeScale = Math.min(1.4, Math.max(0.7, speed / RUN_SPEED)); }
      st.mixer.update(dt);
      if (!st.ghostMixer) return;
      const a = st.one;
      if (a && st.hold && a.time >= a.getClip().duration * 0.55) a.paused = true; // full draw
      const live = a && a.isRunning() || (a && st.hold);
      const done = a && !st.hold && a.time >= a.getClip().duration - 1e-3;
      st.oneW += ((live && !done ? 1 : 0) - st.oneW) * Math.min(1, dt * 10);
      st.ghostMixer.update(dt);
      if (st.oneW > 0.01) for (const [bone, g] of st.pairs) bone.quaternion.slerp(q.copy(g.quaternion), st.oneW);
      else if (done) st.one = null;
    },
  };
}
