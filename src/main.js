import * as THREE from 'three';
import { buildVelaris, RIVER_HALF, STAIR, WATER_Y, groundHeight } from './world/velaris.js';
import { buildSky } from './world/sky.js';
import { buildHuman, animateHuman } from './world/character.js';
import { loadFeyreModel } from './world/feyreModel.js';
import { buildPost } from './render/post.js';
import { Player } from './game/player.js';
import { buildCrowd } from './game/npcs.js';
import { setupMissions } from './game/missions.js';
import { GameState } from './core/state.js';
import { WINNOW_MARKS } from './core/content.js';
import { UI } from './ui/ui.js';
import { Sound } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // staged capture: market | stairs | boat | summons | table | slips
const FIXED = params.has('w') ? [parseInt(params.get('w'), 10), parseInt(params.get('h'), 10)] : null;
if (SHOT) document.body.classList.add('capture');

// ---------------- renderer ----------------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!SHOT });
renderer.setPixelRatio(FIXED ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const size = () => (FIXED ?? [window.innerWidth, window.innerHeight]);
let [W, H] = size();
renderer.setSize(W, H, !FIXED);

const scene = new THREE.Scene();
// River mist: the Court of Mist is never quite clear at street level.
scene.fog = new THREE.FogExp2(0x1a2130, 0.0105); // matches the sky at the horizon
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 3000); // ~35 mm on full frame, slightly long

// ---------------- light: moon, sky, window glow, lanterns ----------------
const moonDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
const sky = buildSky(moonDir);
scene.add(sky);
const moon = new THREE.DirectionalLight(0x9fb3d8, 0.75);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = moon.shadow.camera.bottom = -36;
moon.shadow.camera.right = moon.shadow.camera.top = 36;
moon.shadow.camera.near = 1; moon.shadow.camera.far = 260;
moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);
scene.add(new THREE.HemisphereLight(0x2a3856, 0x0d0a08, 0.55));

const world = buildVelaris(scene, moonDir);
// A pool of real lights that follow you between the lanterns nearest the camera.
const POOL = 12;
const pool = [];
for (let i = 0; i < POOL; i++) {
  const l = new THREE.PointLight(0xffa860, 9, 16, 2);
  scene.add(l);
  pool.push(l);
}
function placeLights(center) {
  const near = world.lanternSpots
    .map((p) => [p, p.distanceToSquared(center)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, POOL);
  near.forEach(([p], i) => pool[i].position.copy(p));
}

// ---------------- candle and chimney smoke ----------------
const SMOKE = 260;
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
for (let i = 0; i < SMOKE; i++) { smokeLife[i] = Math.random(); smokeSrc[i] = Math.floor(Math.random() * world.smokeSpots.length); }

// ---------------- people ----------------
const state = new GameState();
try {
  const saved = !SHOT && localStorage.getItem('court-of-mist-save');
  if (saved) state.load(JSON.parse(saved));
} catch { /* a private window: start fresh */ }

const feyre = buildHuman({
  skin: 0xe4b498, hair: 0x6e4a28, hairLen: 0.44, strands: true, bow: true, wings: true,
  shirt: 0xbdb39f, vest: 0x4a2e1c, trousers: 0x2a2620, boots: 0x22170f, height: 1.68,
});
scene.add(feyre.root);
feyre.hair.attach(scene);
const feyreModel = loadFeyreModel(feyre);
const player = new Player(feyre, world.colliders, state);
const crowd = buildCrowd(scene, 30);
const ui = new UI();
const sound = new Sound();

// ---------------- camera rig ----------------
const cam = { yaw: 0.25, pitch: 0.12, dist: 3.1, shoulder: 0.42, convo: null, pos: new THREE.Vector3(), look: new THREE.Vector3() };
let convoNpc = null;
const post = buildPost(renderer, scene, camera, W, H);

const ctx = {
  scene, state, ui, player, world,
  dialogueWith(npc) {
    if (npc !== convoNpc) post.cutTo(new THREE.Vector2(npc ? 1 : -1, 0.2));
    convoNpc = npc;
  },
  async cut(fn) { await ui.fade(true); await fn(); post.cutTo(); await ui.fade(false); },
  save() { try { localStorage.setItem('court-of-mist-save', JSON.stringify(state.save())); } catch { /* ignore */ } },
};
const missions = setupMissions(ctx);
const people = [...crowd, ...missions.named];

ui.onWinnow = async (id) => {
  ui.toggleTable(state, false);
  const p = world.marks[id];
  // Winnowing: a fold in the dark. The picture smears once and you are elsewhere.
  await ctx.cut(async () => {
    player.boat = null; state.flying = false;
    player.pos.set(p.x + 1, groundHeight(p.x + 1, p.z) ?? 0, p.z);
    player.vel.set(0, 0, 0);
  });
};

// ---------------- input ----------------
const input = { f: 0, b: 0, l: 0, r: 0, run: 0, up: 0, down: 0 };
const keymap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run', Space: 'up', KeyC: 'down' };
let current = null;
window.addEventListener('keydown', (e) => {
  if (keymap[e.code]) { input[keymap[e.code]] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyE' && current && !ui.overlayOpen) current.on();
  if (e.code === 'KeyB') ui.toggleSlips(state);
  if (e.code === 'KeyM') { ui.toggleTable(state); if (!ui.tableEl.hidden) document.exitPointerLock?.(); }
  if (e.code === 'Escape') { ui.toggleSlips(state, false); ui.toggleTable(state, false); }
  if (e.code === 'KeyF' && !player.locked) {
    if (state.flying) player.land();
    else if (!player.takeOff()) ui.say('', state.stamina < 0.15 ? '<i>Your wings are spent. Walk a while.</i>' : '<i>Not here.</i>', 1800).then(() => ui.clearSay());
  }
});
window.addEventListener('keyup', (e) => { if (keymap[e.code]) input[keymap[e.code]] = 0; });
const title = document.getElementById('title');
title.addEventListener('click', () => {
  title.remove();
  sound.start();
  canvas.requestPointerLock?.();
});
canvas.addEventListener('click', () => { if (!ui.overlayOpen) canvas.requestPointerLock?.(); });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  cam.yaw -= e.movementX * 0.0024;
  cam.pitch = Math.max(-0.5, Math.min(0.9, cam.pitch + e.movementY * 0.0018));
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

function frame(dt, draw = true) {
  t += dt;
  const res = player.update(dt, input, cam.yaw);
  if (!state.tickFlight(dt) && res.flying) player.land();
  if (state.flying && !feyre.wings.visible) feyre.wingOpen = 0;

  // her body
  feyre.root.position.copy(player.pos);
  if (player.boat) feyre.root.position.y = WATER_Y + 0.2;
  feyre.root.rotation.y = player.heading;
  feyreModel.update(dt, res.speed);
  animateHuman(feyre, dt, { speed: res.speed, accel: player.accel, turn: player.turn, flying: state.flying, stairs: player.stairs, t, talking: 0 });
  if (player.boat) { // poling stance
    for (const L of feyre.legs) { L.hip.rotation.x = -0.15; L.knee.rotation.x = 0.3; }
    feyre.arms[1].sh.rotation.x = -1.1 + Math.sin(t * 1.4) * 0.3; feyre.arms[0].sh.rotation.x = -0.8 + Math.sin(t * 1.4) * 0.3;
  }
  // footfalls
  const stepPhase = Math.floor(feyre.phase / Math.PI);
  if (stepPhase !== lastStepPhase && res.speed > 0.4 && !state.flying && !player.boat) sound.step(Math.min(1, res.speed / 3));
  lastStepPhase = stepPhase;

  for (const p of people) {
    if (p.pos.distanceToSquared(player.pos) > 150 * 150 && !p.target) continue;
    p.update(dt, t);
  }
  missions.update(dt, t);
  world.update(t, 1);

  // winnow marks are learned by standing on them
  for (const [id, p] of Object.entries(world.marks)) {
    if (!state.canWinnow(id) && player.pos.distanceTo(p) < 5) {
      state.visitMark(id);
      ctx.save();
      ui.say('', `<i>You'll remember this place: ${WINNOW_MARKS[id].name}.</i>`, 2400).then(() => { if (!missions.busy) ui.clearSay(); });
    }
  }

  // interaction: the nearest thing you could do, said plainly
  current = null;
  if (!player.locked && !missions.busy) {
    let best = Infinity;
    for (const it of missions.interactables) {
      if (it.enabled && !it.enabled()) continue;
      if (!!it.inBoat !== !!player.boat && it.inBoat !== undefined) continue;
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      if (d < it.r && d < best) { best = d; current = it; }
    }
  }
  ui.prompt(current && !ui.overlayOpen ? current.label() : null);

  // ---- camera ----
  const headY = state.flying ? 1.1 : 1.52;
  const focus = tmp.set(player.pos.x, feyre.root.position.y + headY, player.pos.z);
  let desiredPos, desiredLook, focusDist;
  if (convoNpc) {
    // over-the-shoulder two-shot, held on the person speaking
    const npcHead = convoNpc.pos.clone().add(new THREE.Vector3(0, 1.55 * (convoNpc.rig.body.scale.y), 0));
    const toNpc = npcHead.clone().sub(focus); toNpc.y = 0; toNpc.normalize();
    const side = new THREE.Vector3(-toNpc.z, 0, toNpc.x);
    desiredPos = focus.clone().addScaledVector(toNpc, -1.7).addScaledVector(side, 0.8).add(new THREE.Vector3(0, 0.08, 0));
    desiredLook = npcHead.clone().addScaledVector(side, -0.15);
    focusDist = desiredPos.distanceTo(npcHead);
  } else {
    const dist = state.flying ? cam.dist * 2.1 : player.boat ? cam.dist * 1.6 : cam.dist;
    const cp = Math.cos(cam.pitch);
    const back = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    desiredPos = focus.clone().addScaledVector(back, dist).addScaledVector(right, cam.shoulder);
    desiredLook = focus.clone().addScaledVector(right, cam.shoulder * 0.9).add(new THREE.Vector3(0, -0.05, 0));
    // keep the lens out of the stone
    const g = groundHeight(desiredPos.x, desiredPos.z);
    desiredPos.y = Math.max(desiredPos.y, (g ?? WATER_Y) + 0.35);
    focusDist = dist;
  }
  // a hand-held camera, not a tripod: slight breathing drift
  desiredPos.y += Math.sin(t * 0.9) * 0.012; desiredPos.x += Math.sin(t * 0.63) * 0.01;
  const k = 1 - Math.exp(-dt * (convoNpc ? 30 : 9));
  if (cam.snap) { cam.pos.copy(desiredPos); cam.look.copy(desiredLook); cam.snap = false; }
  cam.pos.lerp(desiredPos, k); cam.look.lerp(desiredLook, k);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  post.setFocus(focusDist, convoNpc ? 0.0026 : 0.0014);

  // hair after the body has moved
  if (!feyreModel.loaded) feyre.hair.step(dt, moonDir, camera.position, wind.clone().multiplyScalar(state.flying ? 8 : 1 + Math.sin(t * 0.7)));

  // moonlight follows the player; lantern lights follow the camera
  moon.position.copy(player.pos).addScaledVector(moonDir, 120);
  moon.target.position.copy(player.pos);
  if (t - lastPool > 0.25) { placeLights(camera.position.clone().lerp(player.pos, 0.5)); lastPool = t; }
  sky.material.uniforms.time.value = t;
  sky.position.copy(camera.position);

  // smoke drifts up and downwind
  for (let i = 0; i < SMOKE; i++) {
    smokeLife[i] += dt * 0.22;
    if (smokeLife[i] > 1) { smokeLife[i] = 0; smokeSrc[i] = Math.floor(Math.random() * world.smokeSpots.length); }
    const s = world.smokeSpots[smokeSrc[i]], L = smokeLife[i];
    smokePos[i * 3] = s.x + L * 1.2 + Math.sin(L * 9 + i) * 0.12 * L;
    smokePos[i * 3 + 1] = s.y + L * 2.4;
    smokePos[i * 3 + 2] = s.z + L * 0.4 + Math.cos(L * 7 + i) * 0.12 * L;
  }
  smokeGeo.attributes.position.needsUpdate = true;

  sound.ambience(Math.max(0, 1 - (Math.abs(player.pos.z) - RIVER_HALF) / 25), state.flying ? player.alt : Math.max(0, player.pos.y));
  if (draw) post.render(dt, t);
}

// ---------------- staged shots for captures ----------------
function stage(shot) {
  const at = (x, z, heading, yaw, pitch = 0.1) => {
    player.pos.set(x, groundHeight(x, z) ?? 0, z); player.heading = heading; cam.yaw = yaw; cam.pitch = pitch; cam.snap = true;
  };
  if (shot === 'market') { at(-14, 17.6, Math.PI / 2 + 0.15, -Math.PI / 2 - 0.35, 0.06); input.f = 1; }
  if (shot === 'stairs') {
    // walk-and-talk, halfway up: she has turned to look back over the city
    at(STAIR.x - 0.6, STAIR.z0 - 70, -0.5, 2.62, 0.1);
    const pr = missions.named[3];
    pr.pos.set(STAIR.x - 1.5, groundHeight(STAIR.x - 1.5, STAIR.z0 - 69.4) ?? 0, STAIR.z0 - 69.4);
    pr.heading = -0.7; pr.talking = 1; missions.holdSummons = true;
    ui.say('Priestess', 'Look back, if you like. The Rainbow is the only quarter brighter at night than by day.', 1e9);
  }
  if (shot === 'boat') {
    const sk = missions.skiff;
    player.boat = sk; sk.position.set(-30, WATER_Y, 2); player.pos.set(-30, WATER_Y + 0.15, 2);
    player.heading = Math.PI / 2 + 0.3; cam.yaw = -Math.PI / 2 - 0.1; cam.pitch = 0.16; cam.snap = true;
    for (const p of missions.pigments) p.mesh.visible = true;
  }
  if (shot === 'summons') {
    at(-6, 16.5, Math.PI / 2, -Math.PI / 2, 0.05);
    const m = missions.named[4];
    m.pos.set(-1.8, 0, 16.4); m.heading = -Math.PI / 2; m.talking = 1;
    convoNpc = m;
    ui.ask('Masked messenger', 'From the Steward of the Hewn City. You are expected in his throne room tonight.', ['Tell Keir I have other plans.', 'I\'ll come.']);
  }
  if (shot === 'table' || shot === 'slips') {
    missions.holdSummons = true;
    state.completeJob('sunk_pigment');
    state.visitMark('rainbow_steps'); state.visitMark('sidra_dock'); state.visitMark('palace_thread');
    state.strikeBargain({ id: 'painter_pigment', withWhom: 'the Rainbow painter', owe: 'She owes you', terms: 'One pigment of my choosing, ground fresh, when all three jars come up from the Sidra.' });
    state.strikeBargain({ id: 'cousin_debt', withWhom: 'a cousin of the Hewn City', owe: 'You owe him', terms: 'Forty gold marks by Starfall, for the arcade\'s "protection".' });
    state.declineSummons();
    state.addSocial('palace_silk_merchant', 1);
  }
}

if (SHOT) {
  document.getElementById('title').remove();
  stage(SHOT);
  // let the simulation settle (hair, crowd, camera), then render the frame to keep
  const fixedDt = 1 / 30;
  const warm = parseInt(params.get('warm') ?? '90', 10);
  for (let i = 0; i < warm; i++) frame(fixedDt, i > warm - 4);
  if (SHOT === 'table') ui.toggleTable(state, true);
  if (SHOT === 'slips') ui.toggleSlips(state, true);
  frame(fixedDt);
  window.__ready = true;
} else {
  cam.snap = true;
  renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 1 / 20)));
}
window.__game = { state, player, cam, missions };
