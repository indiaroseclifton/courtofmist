// Staged frames and scripted clips for documentation. Everything here drives the real game:
// the same input, physics, crowd and camera; only the starting positions are chosen.
import * as THREE from 'three';
import { STAIR, WATER_Y } from './world/velaris.js';

export async function runCapture(api, { shot, record, warm }) {
  const { ctx, frame, input, cam, player, state, ui } = api;
  document.getElementById('title')?.remove();
  const at = (x, z, heading, yaw, pitch = 0.1) => {
    player.pos.set(x, api.region.ground(x, z) ?? 0, z); player.heading = heading; cam.yaw = yaw; cam.pitch = pitch; cam.snap = true;
  };
  const velaris = async () => { await ctx.travel('velaris', null, { instant: true }); ctx.story.set('act2'); return api.region.missions; };

  async function stage(name) {
    if (name.startsWith('region:')) {
      const id = name.slice(7);
      await ctx.travel(id, 'shot', { instant: true });
      const p = api.region.places.shot;
      cam.yaw = p.yaw ?? player.heading + Math.PI; cam.pitch = p.pitch ?? 0.1; cam.snap = true;
      if (id === 'spring_manor' || id === 'under_mountain') for (const h of api.region.hooded ?? []) h.rig.root.visible = false;
      return;
    }
    const missions = await velaris();
    missions.holdSummons = true;
    if (name === 'market') { at(-14, 17.6, Math.PI / 2 + 0.15, -Math.PI / 2 - 0.35, 0.06); input.f = 1; }
    if (name === 'stairs') {
      at(STAIR.x - 0.6, STAIR.z0 - 70, -0.5, 2.62, 0.1);
      const pr = missions.named[3];
      pr.pos.set(STAIR.x - 1.5, api.region.ground(STAIR.x - 1.5, STAIR.z0 - 69.4) ?? 0, STAIR.z0 - 69.4);
      pr.heading = -0.7; pr.talking = 1;
      ui.say('Priestess', 'Look back, if you like. The Rainbow is the only quarter brighter at night than by day.', 1e9);
    }
    if (name === 'boat') {
      const sk = missions.skiff;
      player.boat = sk; sk.position.set(-30, WATER_Y, 2); player.pos.set(-30, WATER_Y + 0.15, 2);
      player.heading = Math.PI / 2 + 0.3; cam.yaw = -Math.PI / 2 - 0.1; cam.pitch = 0.16; cam.snap = true;
      for (const p of missions.pigments) p.mesh.visible = true;
    }
    if (name === 'summons') {
      at(-6, 16.5, Math.PI / 2, -Math.PI / 2, 0.05);
      const m = missions.named[4];
      m.pos.set(-1.8, 0, 16.4); m.heading = -Math.PI / 2; m.talking = 1;
      api.setConvo(m);
      ui.ask('Masked messenger', 'From the Steward of the Hewn City. You are expected in his throne room tonight.', ['Tell Keir I have other plans.', 'I\'ll come.']);
    }
    if (name === 'table' || name === 'slips' || name === 'journal') {
      state.completeJob('sunk_pigment'); state.completeJob('adriata_nets'); state.completeJob('day_reshelve');
      state.recordWork('summer', 'adriata', 'audience'); state.recordWork('day', 'day_library', 'audience');
      for (const k of ['rainbow_steps', 'sidra_dock', 'palace_thread', 'house_of_wind', 'cottage_gate', 'windhaven_ring', 'adriata_quay']) state.visitMark(k);
      state.strikeBargain({ id: 'night_court_week', withWhom: 'Rhysand, High Lord of the Night Court', owe: 'You owe him', terms: 'One week of every month at the Night Court, for as long as I live. Paid in ink on my left hand.' });
      state.strikeBargain({ id: 'cousin_debt', withWhom: 'a cousin of the Hewn City', owe: 'You owe him', terms: 'Forty gold marks by Starfall, for the arcade\'s "protection".' });
      state.declineSummons();
      ctx.story.set('act3'); ctx.story.i = ctx.story.indexOf('high_lords');
      at(-14, 17.6, Math.PI / 2, -Math.PI / 2 - 0.35, 0.06);
    }
  }

  const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  const SCRIPTS = {
    market(ct) { input.f = 1; input.run = ct > 6.5 ? 1 : 0; cam.yaw = -Math.PI / 2 - 0.35 + Math.sin(ct * 0.35) * 0.3; },
    boat(ct) { input.f = 1; input.l = ct > 3 && ct < 5.5 ? 1 : 0; cam.yaw = lerpAngle(cam.yaw, player.heading + Math.PI + 0.25, 0.03); },
    flight(ct) {
      if (ct < 1 / 60) { ctx.story.set('wings'); player.takeOff(); }
      input.f = 1; input.up = ct < 3 ? 1 : 0; cam.yaw = lerpAngle(cam.yaw, player.heading + Math.PI, 0.04); cam.pitch = 0.22;
    },
    walk(ct) { input.f = 1; cam.yaw = lerpAngle(cam.yaw, player.heading + Math.PI + Math.sin(ct * 0.3) * 0.3, 0.05); },
  };

  if (record) {
    const [clip, where] = record.split(':');
    if (where) await stage(`region:${where}`); else await stage(clip === 'flight' ? 'market' : clip);
    if (clip === 'flight') at(-20, 17, Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6, 0.2);
    for (let i = 0; i < 30; i++) frame(1 / 30, false);
    let ct = 0;
    window.__step = () => { (SCRIPTS[clip] ?? SCRIPTS.walk)(ct); frame(1 / 30); ct += 1 / 30; return true; };
    window.__ready = true;
    return;
  }

  await stage(shot);
  for (let i = 0; i < warm; i++) frame(1 / 30, i > warm - 4);
  if (shot === 'table') ui.toggleTable(state, true, ctx);
  if (shot === 'slips') ui.toggleSlips(state, true);
  if (shot === 'journal') ui.toggleJournal(ctx.story, true);
  frame(1 / 30);
  window.__ready = true;
}
