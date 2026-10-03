import * as THREE from 'three';
import { buildSky } from './world/sky.js';
import { buildHuman, animateHuman } from './world/character.js';
import { attachAuthored } from './world/authored.js';
import { weather } from './world/kit.js';
import { buildPost } from './render/post.js';
import { Player } from './game/player.js';
import { GameState } from './core/state.js';
import { WINNOW_MARKS, REGIONS } from './core/content.js';
import { UI } from './ui/ui.js';
import { Sound } from './audio.js';
import { loadEnv, setAnisotropy } from './engine/assets.js';
import { REGION_FACTORIES } from './regions/index.js';
import { Story } from './game/story.js';
import { setupJobs } from './game/jobs.js';
import { Combat } from './game/combat.js';
import { CAST } from './game/cast.js';
import { runCapture } from './capture.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const RECORD = params.get('record');
const FIXED = params.has('w') ? [parseInt(params.get('w'), 10), parseInt(params.get('h'), 10)] : null;
const HIGH = params.get('q') !== 'low';
if (SHOT || RECORD) document.body.classList.add('capture');

// ---------------- renderer ----------------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!(SHOT || RECORD) });
renderer.setPixelRatio(FIXED ? 1 : Math.min(window.devicePixelRatio, HIGH ? 2 : 1.25));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setAnisotropy(renderer);
const size = () => (FIXED ?? [window.innerWidth, window.innerHeight]);
let [W, H] = size();
renderer.setSize(W, H, !FIXED);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a2130, 0.0105);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 3000); // ~35 mm on full frame

// ---------------- light shared by every region; each region retunes it on entry ----------------
const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
const sky = buildSky(sunDir);
scene.add(sky);
const sun = new THREE.DirectionalLight(0x9fb3d8, 0.75);
sun.castShadow = true;
sun.shadow.mapSize.set(HIGH ? 4096 : 2048, HIGH ? 4096 : 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
sun.shadow.camera.right = sun.shadow.camera.top = 40;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x2a3856, 0x0d0a08, 0.55);
scene.add(hemi);
const POOL = 14;
const pool = [];
for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffa860, 9, 16, 2); scene.add(l); pool.push(l); }

// smoke from candles, chimneys, braziers
const SMOKE = 320;
const smokeGeo = new THREE.BufferGeometry();
const smokePos = new Float32Array(SMOKE * 3), smokeLife = new Float32Array(SMOKE), smokeSrc = new Int32Array(SMOKE);
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 0.5, map: smokeTex, transparent: true, opacity: 0.12, depthWrite: false, color: 0x8a8f9a }));
smoke.frustumCulled = false;
scene.add(smoke);
for (let i = 0; i < SMOKE; i++) smokeLife[i] = Math.random();

// ---------------- state, player, UI ----------------
const state = new GameState();
try {
  const saved = !(SHOT || RECORD || params.has('test')) && localStorage.getItem('court-of-mist-save');
  if (saved) state.load(JSON.parse(saved));
} catch { /* a private window: start fresh */ }

let feyre = buildHuman({ ...CAST.feyre, strands: true, bow: true, wings: true });
scene.add(feyre.root);
feyre.hair.attach(scene);
let feyreModel = attachAuthored(feyre, 'feyre', { height: CAST.feyre.height });
const player = new Player(feyre, state);
const ui = new UI();
const sound = new Sound();

const cam = { yaw: 0.25, pitch: 0.12, dist: 3.1, shoulder: 0.42, pos: new THREE.Vector3(), look: new THREE.Vector3(), aim: 0 };
let convoNpc = null;
const post = buildPost(renderer, scene, camera, W, H);

// ---------------- regions ----------------
const regions = {};
let region = null;
let weatherFx = null;
const ctx = {
  scene, state, ui, player, regions, camera, cam, sound, post,
  busy: false,
  get region() { return region; },
  get feyre() { return feyre; },
  dialogueWith(npc) {
    if (npc !== convoNpc) post.cutTo(new THREE.Vector2(npc ? 1 : -1, 0.2));
    convoNpc = npc;
  },
  async talk(npc, fn) {
    if (ctx.busy) return;
    ctx.busy = true;
    player.locked = true;
    if (npc) { npc.lookAt = player.pos; npc.talking = 1; ctx.dialogueWith(npc); }
    try { await fn(); } finally {
      if (npc) npc.talking = 0;
      ctx.dialogueWith(null); ui.clearSay(); player.locked = false; ctx.busy = false;
      ctx.save();
    }
  },
  async cut(fn) { await ui.fade(true); await fn(); post.cutTo(); await ui.fade(false); },
  save() {
    try { localStorage.setItem('court-of-mist-save', JSON.stringify({ ...state.save(), story: ctx.story?.save() })); } catch { /* ignore */ }
  },
  openTable() { ui.toggleTable(state, true, ctx); document.exitPointerLock?.(); },
  build(id) {
    if (!regions[id]) {
      const R = REGION_FACTORIES[id](ctx);
      R.root.visible = false;
      scene.add(R.root);
      regions[id] = R;
      ctx.jobs?.attach(R);
      ctx.story?.attach(R);
    }
    return regions[id];
  },
  /** Move to a region, at a named place, a winnow mark, or the spawn. */
  async travel(id, where, { journey = null, instant = false } = {}) {
    const go = async () => {
      const R = ctx.build(id);
      if (region && region !== R) region.root.visible = false;
      region = R;
      R.root.visible = true;
      player.region = R;
      state.region = id;
      player.boat = null; state.flying = false; player.vel.set(0, 0, 0);
      const spot = (where && (R.places[where] ?? (R.marks[where] && { pos: R.marks[where], heading: player.heading }))) || R.spawn;
      player.pos.copy(spot.pos);
      player.pos.y = R.ground(spot.pos.x, spot.pos.z) ?? spot.pos.y;
      player.heading = spot.heading ?? 0;
      cam.yaw = player.heading + Math.PI; cam.snap = true;
      applyEnv(R.env);
      R.onEnter?.();
      ctx.story?.onEnter(R);
    };
    if (instant) { await go(); return; }
    await ui.fade(true);
    if (journey) await ui.say('', `<i>${journey}</i>`, 2600);
    await go();
    ui.clearSay();
    post.cutTo();
    await ui.fade(false);
    ctx.save();
  },
};

let envToken = 0;
function applyEnv(env) {
  sky.setPreset(env.sky, env.sunDir);
  sunDir.copy(env.sunDir).normalize();
  sun.color.set(env.sunColor); sun.intensity = env.sunIntensity;
  hemi.color.set(env.hemi[0]); hemi.groundColor.set(env.hemi[1]); hemi.intensity = env.hemi[2];
  scene.fog.color.set(env.fog[0]); scene.fog.density = env.fog[1];
  renderer.toneMappingExposure = env.exposure ?? 1.1;
  scene.background = env.sky === 'none' ? new THREE.Color(env.fog[0]) : null;
  for (const l of pool) { l.color.set(env.lightColor ?? 0xffa860); l.intensity = env.lightIntensity ?? 9; l.distance = env.lightDistance ?? 16; }
  if (weatherFx) { scene.remove(weatherFx); weatherFx = null; }
  if (env.weather) { weatherFx = weather(env.weather, env.weatherCount ?? 1600); scene.add(weatherFx); }
  scene.environment = null;
  scene.environmentIntensity = env.envIntensity ?? 0.5;
  const token = ++envToken;
  if (env.hdr) loadEnv(renderer, env.hdr).then((tex) => { if (token === envToken) scene.environment = tex; });
}

ctx.applyEnv = applyEnv;
ctx.story = new Story(ctx);
ctx.jobs = setupJobs(ctx);
ctx.combat = new Combat(ctx);

/** Swap the playable character: Feyre or, in the second campaign, Nesta. */
ctx.playAs = (who) => {
  scene.remove(feyre.root);
  if (feyre.hair) scene.remove(feyre.hair.lines);
  feyre = buildHuman({ ...CAST[who], strands: true, bow: who === 'feyre', wings: who === 'feyre' });
  scene.add(feyre.root);
  feyre.hair.attach(scene);
  player.rig = feyre;
  feyreModel = attachAuthored(feyre, who, { height: CAST[who].height });
  ctx.playing = who;
};
ctx.playing = 'feyre';

ui.onWinnow = async (id) => {
  ui.toggleTable(state, false);
  const reg = WINNOW_MARKS[id].region;
  const regionId = REGION_FACTORIES[reg] ? reg : 'velaris';
  // Winnowing: a fold in the dark. The picture smears once and you are elsewhere.
  await ctx.travel(regionId, id);
};
ui.onTravel = async (id) => {
  ui.toggleTable(state, false);
  if (!ctx.story.regionOpen(id)) return;
  await ctx.travel(id, null, { journey: ctx.story.journeyText(id) });
};

// ---------------- input ----------------
const input = { f: 0, b: 0, l: 0, r: 0, run: 0, up: 0, down: 0 };
const keymap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run', Space: 'up', KeyC: 'down' };
ctx.input = input;
let current = null;
window.addEventListener('keydown', (e) => {
  if (keymap[e.code]) { input[keymap[e.code]] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyE' && current && !ui.overlayOpen) current.on();
  if (e.code === 'KeyB') ui.toggleSlips(state);
  if (e.code === 'KeyM') { ui.toggleTable(state, undefined, ctx); if (!ui.tableEl.hidden) document.exitPointerLock?.(); }
  if (e.code === 'KeyJ') ui.toggleJournal(ctx.story);
  if (e.code === 'KeyQ') { const ready = ctx.combat.powerCooldown <= 0; ctx.combat.power(); if (ready && ctx.combat.powerCooldown > 0) feyreModel.play('slash'); }
  if (e.code === 'Escape') { ui.closeAll(); }
  if (e.code === 'KeyF' && !player.locked) {
    if (state.flying) player.land();
    else if (ctx.playing !== 'feyre' || !ctx.story.flag('wings') || !player.takeOff()) {
      const why = ctx.playing !== 'feyre' || !ctx.story.flag('wings') ? 'You have no wings. Not yet.' : state.stamina < 0.15 ? 'Your wings are spent. Walk a while.' : 'Not here.';
      ui.say('', `<i>${why}</i>`, 1800).then(() => ui.clearSay());
    }
  }
});
window.addEventListener('keyup', (e) => { if (keymap[e.code]) input[keymap[e.code]] = 0; });
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas || ui.overlayOpen) return;
  if (e.button === 2) { ctx.combat.aim(true); if (ctx.combat.aiming) feyreModel.aim(true); }
  if (e.button === 0) {
    const shot = ctx.combat.aiming && ctx.combat.draw >= 0.35, swing = !ctx.combat.aiming && ctx.combat.swing <= 0;
    ctx.combat.attack();
    if (shot) feyreModel.play('shoot'); else if (swing && !player.locked && !ctx.busy) feyreModel.play('slash');
  }
});
window.addEventListener('mouseup', (e) => { if (e.button === 2) { ctx.combat.aim(false); feyreModel.aim(false); } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const title = document.getElementById('title');
title?.addEventListener('click', (e) => {
  const nesta = e.target?.dataset?.campaign === 'nesta';
  title.remove();
  sound.start();
  canvas.requestPointerLock?.();
  if (nesta) ctx.story.startNesta();
});
canvas.addEventListener('click', () => { if (!ui.overlayOpen) canvas.requestPointerLock?.(); });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  const k = cam.aim > 0.5 ? 0.5 : 1;
  cam.yaw -= e.movementX * 0.0024 * k;
  cam.pitch = Math.max(-0.5, Math.min(0.9, cam.pitch + e.movementY * 0.0018 * k));
});
window.addEventListener('wheel', (e) => { cam.dist = Math.max(1.8, Math.min(7, cam.dist + e.deltaY * 0.002)); });
window.addEventListener('resize', () => {
  if (FIXED) return;
  [W, H] = size();
  renderer.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  post.setSize(W, H);
});

// ---------------- frame ----------------
const clock = new THREE.Clock();
let t = 0, lastPool = -1, lastStepPhase = 0;
const tmp = new THREE.Vector3(), wind = new THREE.Vector3(1.2, 0, 0.4);

function placeLights(center) {
  const spots = region.lanternSpots;
  const near = spots.map((p) => [p, p.distanceToSquared(center)]).sort((a, b) => a[1] - b[1]).slice(0, POOL);
  pool.forEach((l, i) => {
    if (near[i]) { l.visible = true; l.position.copy(near[i][0]); } else l.visible = false;
  });
}

function frame(dt, draw = true) {
  t += dt;
  const res = player.update(dt, input, cam.yaw);
  if (!state.tickFlight(dt) && res.flying) player.land();

  feyre.root.position.copy(player.pos);
  if (player.boat) feyre.root.position.y = (region.water?.y ?? 0) + 0.2;
  feyre.root.rotation.y = player.heading;
  feyreModel.update(dt, state.flying ? 0 : player.boat ? 0 : res.speed);
  animateHuman(feyre, dt, { speed: res.speed, accel: player.accel, turn: player.turn, flying: state.flying, stairs: player.stairs, t, talking: 0 });
  if (player.boat) {
    for (const L of feyre.legs) { L.hip.rotation.x = -0.15; L.knee.rotation.x = 0.3; }
    feyre.arms[1].sh.rotation.x = -1.1 + Math.sin(t * 1.4) * 0.3; feyre.arms[0].sh.rotation.x = -0.8 + Math.sin(t * 1.4) * 0.3;
  }
  ctx.combat.pose(dt, t);
  const stepPhase = Math.floor(feyre.phase / Math.PI);
  if (stepPhase !== lastStepPhase && res.speed > 0.4 && !state.flying && !player.boat) sound.step(Math.min(1, res.speed / 3));
  lastStepPhase = stepPhase;

  for (const p of region.people) {
    if (p.pos.distanceToSquared(player.pos) > 150 * 150 && !p.target) continue;
    p.update(dt, t);
  }
  region.update(dt, t);
  ctx.story.update(dt, t);
  ctx.jobs.update(dt, t);
  ctx.combat.update(dt, t);

  // winnow marks are learned by standing on them
  for (const [id, p] of Object.entries(region.marks)) {
    if (WINNOW_MARKS[id] && !state.canWinnow(id) && player.pos.distanceTo(p) < 5 && !ctx.busy) {
      state.visitMark(id);
      ctx.save();
      ui.say('', `<i>You'll remember this place: ${WINNOW_MARKS[id].name}.</i>`, 2400).then(() => { if (!ctx.busy) ui.clearSay(); });
    }
  }

  // interaction: the nearest thing you could do, said plainly
  current = null;
  if (!player.locked && !ctx.busy) {
    let best = Infinity;
    for (const it of region.interactables) {
      if (it.enabled && !it.enabled()) continue;
      if (it.inBoat !== undefined && !!it.inBoat !== !!player.boat) continue;
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      if (d >= it.r || d >= best) continue;
      const gy = region.ground(it.pos.x, it.pos.z) ?? it.pos.y; // reach is about the floor you stand on, not the stored y
      if (Math.abs(gy - player.pos.y) < 4) { best = d; current = it; }
    }
  }
  ui.prompt(current && !ui.overlayOpen ? current.label() : null);

  // ---- camera ----
  cam.aim += ((ctx.combat.aiming ? 1 : 0) - cam.aim) * Math.min(1, dt * 8);
  const headY = state.flying ? 1.1 : 1.52;
  const focus = tmp.set(player.pos.x, feyre.root.position.y + headY, player.pos.z);
  let desiredPos, desiredLook, focusDist;
  if (convoNpc) {
    const npcHead = convoNpc.pos.clone().add(new THREE.Vector3(0, 1.55 * (convoNpc.rig.body.scale.y), 0));
    const toNpc = npcHead.clone().sub(focus); toNpc.y = 0; toNpc.normalize();
    const side = new THREE.Vector3(-toNpc.z, 0, toNpc.x);
    desiredPos = focus.clone().addScaledVector(toNpc, -1.7).addScaledVector(side, 0.8).add(new THREE.Vector3(0, 0.08, 0));
    desiredLook = npcHead.clone().addScaledVector(side, -0.15);
    focusDist = desiredPos.distanceTo(npcHead);
  } else {
    const dist = (state.flying ? cam.dist * 2.1 : player.boat ? cam.dist * 1.6 : cam.dist) * (1 - cam.aim * 0.45);
    const cp = Math.cos(cam.pitch);
    const back = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const shoulder = cam.shoulder * (1 + cam.aim * 0.4);
    desiredPos = focus.clone().addScaledVector(back, dist).addScaledVector(right, shoulder);
    desiredLook = focus.clone().addScaledVector(right, shoulder * 0.9).add(new THREE.Vector3(0, -0.05, 0)).addScaledVector(back, -cam.aim * 6);
    const g = region.ground(desiredPos.x, desiredPos.z);
    desiredPos.y = Math.max(desiredPos.y, (g ?? region.water?.y ?? desiredPos.y - 1) + 0.35);
    if (region.ceiling) desiredPos.y = Math.min(desiredPos.y, region.ceiling(desiredPos.x, desiredPos.z) - 0.3);
    focusDist = dist;
  }
  desiredPos.y += Math.sin(t * 0.9) * 0.012; desiredPos.x += Math.sin(t * 0.63) * 0.01;
  const k = 1 - Math.exp(-dt * (convoNpc ? 30 : 9));
  if (cam.snap) { cam.pos.copy(desiredPos); cam.look.copy(desiredLook); cam.snap = false; }
  cam.pos.lerp(desiredPos, k); cam.look.lerp(desiredLook, k);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  camera.fov = 40 - cam.aim * 8; camera.updateProjectionMatrix();
  post.setFocus(focusDist, convoNpc ? 0.0026 : 0.0014 * (1 - cam.aim * 0.6));

  if (!feyreModel.loaded) feyre.hair.step(dt, sunDir, camera.position, wind.clone().multiplyScalar(state.flying ? 8 : 1 + Math.sin(t * 0.7)));

  sun.position.copy(player.pos).addScaledVector(sunDir, 150);
  sun.target.position.copy(player.pos);
  if (t - lastPool > 0.25) { placeLights(camera.position.clone().lerp(player.pos, 0.5)); lastPool = t; }
  sky.material.uniforms.time.value = t;
  sky.position.copy(camera.position);
  weatherFx?.userData.update(dt, t, camera.position);

  const ss = region.smokeSpots;
  for (let i = 0; i < SMOKE; i++) {
    smokeLife[i] += dt * 0.22;
    if (smokeLife[i] > 1 || smokeSrc[i] >= ss.length) { smokeLife[i] = smokeLife[i] % 1; smokeSrc[i] = Math.floor(Math.random() * ss.length); }
    const s = ss[smokeSrc[i]];
    if (!s) { smokePos[i * 3 + 1] = -999; continue; }
    const L = smokeLife[i];
    smokePos[i * 3] = s.x + L * 1.2 + Math.sin(L * 9 + i) * 0.12 * L;
    smokePos[i * 3 + 1] = s.y + L * 2.4;
    smokePos[i * 3 + 2] = s.z + L * 0.4 + Math.cos(L * 7 + i) * 0.12 * L;
  }
  smokeGeo.attributes.position.needsUpdate = true;

  const nearWater = region.water ? Math.max(0, 1 - Math.abs(player.pos.y - region.water.y - 1.4) / 6) : 0;
  sound.ambience(nearWater, state.flying ? player.alt : Math.max(0, player.pos.y));
  if (draw) post.render(dt, t);
}

// ---------------- start ----------------
const startRegion = REGION_FACTORIES[state.region] && state.region !== 'velaris' ? state.region : null;
await ctx.story.load(state);
const api = { ctx, frame, input, cam, player, state, ui, get region() { return region; }, setConvo: (n) => { convoNpc = n; } };
if (params.has('test')) {
  // logic-only mode for tools/playtest.mjs: instant dialogue, no render loop
  ui.fast = true;
  document.getElementById('title')?.remove();
  await ctx.story.begin(startRegion);
  window.__ready = true;
} else if (SHOT || RECORD) {
  try { await runCapture(api, { shot: SHOT, record: RECORD, warm: parseInt(params.get('warm') ?? '90', 10) }); } catch (e) { window.__failed = String(e); throw e; }
} else {
  await ctx.story.begin(startRegion);
  cam.snap = true;
  renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 1 / 20)));
}
window.__game = { state, player, cam, ctx, regions, frame };
