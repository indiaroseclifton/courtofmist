// The side jobs that run in this slice, written as small async scripts.
// None of them are fights. Completing one opens a shop or a sibling; trust moves only
// because the work was done on Night Court land.
import * as THREE from 'three';
import { Person } from './npcs.js';
import { RIVER_HALF, STAIR, WATER_Y } from '../world/velaris.js';
import { HOUSE_OF_WIND_STEPS } from '../core/content.js';
import * as T from '../world/textures.js';

export function setupMissions(ctx) {
  const { scene, state, ui, player, world } = ctx;
  const flags = new Set();
  const interactables = [];
  const add = (o) => (interactables.push(o), o);

  // ---------------- people with stories ----------------
  const painter = new Person(scene, { skin: 0xb07656, hair: 0x1a120c, shirt: 0xd8cbb0, vest: 0x6a3a22, robe: null, hairLen: 0.4, height: 1.62 }, new THREE.Vector3(-58, 0, RIVER_HALF + 9));
  painter.heading = Math.PI;
  const weaver = new Person(scene, { skin: 0xe2b49a, hair: 0x8a8a8a, shirt: 0x1f3a6a, shirtKind: 'silk', vest: 0x23262b, robe: 0x1f3a6a, hairLen: 0.3, height: 1.6 }, new THREE.Vector3(48, 0, RIVER_HALF + 17.5));
  weaver.heading = Math.PI;
  const cousin = new Person(scene, { skin: 0xf0c8b0, hair: 0xd0c8b8, shirt: 0x15151a, shirtKind: 'silk', vest: 0x0d0d10, trousers: 0x0d0d10, mask: 0xb8bcc4, hairLen: 0.05, height: 1.84 }, new THREE.Vector3(56, 0, RIVER_HALF + 16.5));
  cousin.heading = -Math.PI / 2;
  const priestess = new Person(scene, { skin: 0x9a6448, hair: 0x101010, shirt: 0xe8e2d6, robe: 0xe8e2d6, vest: 0xe8e2d6, hairLen: 0.05, height: 1.6, walkSpeed: 0.85 }, new THREE.Vector3(STAIR.x + 1.4, 0, STAIR.z0 + 6));
  priestess.heading = 0;
  const messenger = new Person(scene, { skin: 0xf0c8b0, hair: 0x101010, shirt: 0x101014, vest: 0x0a0a0c, trousers: 0x0a0a0c, mask: 0x1a1a1e, height: 1.78, hairLen: 0.05 }, new THREE.Vector3(9999, 0, 9999));
  const named = [painter, weaver, cousin, priestess, messenger];

  // ---------------- the skiff and the sunk pigment ----------------
  const tim = T.timber(256, [0.3, 0.22, 0.15]);
  const boatMat = new THREE.MeshStandardMaterial({ ...tim, roughness: 1 });
  const skiff = new THREE.Group();
  const hullMat = boatMat.clone(); hullMat.side = THREE.DoubleSide;
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 4.2, 18, 1, true, -Math.PI / 2, Math.PI), hullMat);
  hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.6); hull.position.y = 0.42; hull.castShadow = true;
  skiff.add(hull);
  for (const z of [-1.1, 0.6]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.3), boatMat);
    seat.position.set(0, 0.12, z); skiff.add(seat);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 6), boatMat);
  pole.rotation.x = Math.PI / 2; pole.position.set(0.45, 0.2, 0); skiff.add(pole); // laid along the thwarts
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ emissive: 0xffa860, emissiveIntensity: 2.5, color: 0 }));
  lantern.position.set(0, 0.7, 1.9); skiff.add(lantern);
  const MOOR = new THREE.Vector3(world.dock.x, WATER_Y + 0.05, RIVER_HALF - 4.2);
  skiff.position.copy(MOOR);
  skiff.rotation.y = Math.PI / 2;
  scene.add(skiff);

  const pigments = [
    { name: 'lapis', color: 0x2a4aa8, pos: new THREE.Vector3(-46, WATER_Y + 0.03, -3) },
    { name: 'cinnabar', color: 0xb02a1a, pos: new THREE.Vector3(-8, WATER_Y + 0.03, 6) },
    { name: 'ochre', color: 0xc08a2a, pos: new THREE.Vector3(30, WATER_Y + 0.03, -7) },
  ];
  for (const p of pigments) {
    // a slow bloom of color in the current, drifting downstream from where the crate sank
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p.pos); m.visible = false;
    scene.add(m);
    p.mesh = m;
  }

  const talk = ctx.talk; // shared with every region: locks the player, cuts to the two-shot


  // ---- Pigment in the Sidra ----
  add({
    pos: painter.pos, r: 2.6, label: () => 'E — speak with the painter',
    on: () => talk(painter, async () => {
      if (state.completed.has('sunk_pigment')) {
        await ui.say('Painter', 'The lapis came up bluer than it went down. I swear the river polished it.');
        return;
      }
      if (flags.has('pigment_job')) {
        const got = pigments.filter((p) => p.found).length;
        if (got < 3) { await ui.say('Painter', `${got} of three. The river doesn't wait, and neither does my commission.`); return; }
        await ui.say('Painter', 'All three. You even kept the ochre dry, somehow.');
        state.completeJob('sunk_pigment');
        await ui.say('Painter', 'My shop is open to you. Come at any hour; I keep a painter\'s hours.');
        return;
      }
      await ui.say('Painter', 'You paint. Don\'t deny it — there\'s blue under your nails, and it isn\'t ink.');
      await ui.say('Painter', 'A skiff tipped off the dock at dusk. Three jars of my ground pigment went down with it.');
      const c = await ui.ask('Painter', 'The Sidra takes color fast. By morning it\'ll be a stain somewhere downriver.', [
        'I\'ll take the skiff out and bring them up.',
        'What would it be worth to you?',
        'Not tonight.',
      ]);
      if (c === 2) { await ui.say('Painter', 'Then it\'s the river\'s. Ah well.'); return; }
      if (c === 1) {
        await ui.say('Painter', 'A bargain, then. Bring all three up and I owe you a pigment of your choosing, ground fresh.');
        state.strikeBargain({ id: 'painter_pigment', withWhom: 'the Rainbow painter', owe: 'She owes you', terms: 'One pigment of my choosing, ground fresh, when all three jars come up from the Sidra.' });
        await ui.say('', '<i>A slip of paper, folded once. B to read it.</i>', 2200);
      }
      flags.add('pigment_job');
      for (const p of pigments) p.mesh.visible = true;
      await ui.say('Painter', 'The skiff is tied at the dock steps. Look for the color in the water.');
    }),
  });

  add({
    pos: world.dock, r: 3.2, enabled: () => !player.boat && !state.flying,
    label: () => 'E — take the skiff',
    on: async () => {
      await ctx.cut(async () => {
        player.boat = skiff;
        player.pos.set(skiff.position.x, WATER_Y + 0.15, skiff.position.z);
        player.heading = Math.PI / 2;
      });
    },
  });
  add({
    pos: new THREE.Vector3(world.dock.x, 0, RIVER_HALF - 3.5), r: 4, inBoat: true,
    enabled: () => !!player.boat, label: () => 'E — tie up and climb out',
    on: async () => {
      await ctx.cut(async () => {
        skiff.position.copy(MOOR); skiff.rotation.y = Math.PI / 2;
        player.boat = null;
        player.pos.set(world.dock.x, 0, RIVER_HALF + 1.5);
        player.vel.set(0, 0, 0);
      });
    },
  });
  for (const p of pigments) {
    add({
      pos: p.pos, r: 2.4, inBoat: true,
      enabled: () => !!player.boat && p.mesh.visible && !p.found,
      label: () => `E — hook the ${p.name} jar`,
      on: async () => {
        player.locked = true;
        await ui.say('', `<i>You lean over the gunwale and sweep the pole along the bottom…</i>`, 1800);
        p.found = true; p.mesh.visible = false;
        const left = pigments.filter((x) => !x.found).length;
        await ui.say('', left ? `<i>The ${p.name} comes up streaming. ${left} left.</i>` : `<i>The ${p.name} comes up streaming. That's all three. Back to the painter.</i>`, 2400);
        ui.clearSay();
        player.locked = false;
      },
    });
  }

  // ---- A cousin at the Palace ----
  add({
    pos: weaver.pos, r: 2.4, label: () => 'E — speak with the silk merchant',
    on: () => talk(weaver, async () => {
      if (state.completed.has('thread_shakedown')) { await ui.say('Silk merchant', 'He hasn\'t been back. The whole arcade is sleeping better.'); return; }
      await ui.say('Silk merchant', 'Him, by the column. Silver mask. He comes every new moon and calls it protection.');
      await ui.say('Silk merchant', 'We never asked to be protected. Nobody here wants a brawl in the arcade either — the silk is worth more than he is.');
      await ui.say('Silk merchant', 'If it helps: he loses every night at the dice house across the river. His father doesn\'t know. Yet.');
      flags.add('cousin_secret');
    }),
  });
  add({
    pos: cousin.pos, r: 2.6, label: () => 'E — speak with the masked man',
    enabled: () => !state.completed.has('thread_shakedown'),
    on: () => talk(cousin, async () => {
      await ui.say('Masked cousin', 'Lady. This is a family matter between the Hewn City and these… merchants.');
      const opts = ['Leave. Now.', 'What do they owe you? I\'ll pay it myself.'];
      if (flags.has('cousin_secret')) opts.push('How are the dice treating you across the river? Does your father keep count?');
      const c = await ui.ask('Masked cousin', 'Unless you have business with the Steward\'s house?', opts);
      if (c === 0) {
        state.addHeat(3);
        await ui.say('Masked cousin', 'Or what — you\'ll put an arrow in me in a silk shop? I don\'t think so.');
        await ui.say('', '<i>No one in the arcade breathes. He stays. There has to be another way.</i>');
        return;
      }
      if (c === 1) {
        state.strikeBargain({ id: 'cousin_debt', withWhom: 'a cousin of the Hewn City', owe: 'You owe him', terms: 'Forty gold marks by Starfall, for the arcade\'s "protection". He leaves the merchants be until it is paid.' });
        state.addHeat(2);
        await ui.say('Masked cousin', 'Forty marks, by Starfall. A pleasure doing business with the Night Court.');
      } else {
        state.addHeat(4);
        await ui.say('Masked cousin', '…');
        await ui.say('Masked cousin', 'You\'ll keep that to yourself.');
        await ui.say('', '<i>He goes without another word. Behind you someone in the arcade laughs, then thinks better of it.</i>');
        state.addSocial('palace_silk_merchant', 1);
      }
      state.completeJob('thread_shakedown');
      cousin.goTo(new THREE.Vector3(140, 0, RIVER_HALF + 3));
      cousin.lookAt = null;
      setTimeout(() => cousin.pos.set(9999, 0, 9999), 60000);
    }),
  });

  // ---- Ten thousand steps, on foot ----
  const stairLines = [
    [0.08, 'I climb it once a year. Not to pray — the praying I can do at the bottom.'],
    [0.22, 'People offer to fly me. Kindly meant. But you don\'t learn a stair from the air.'],
    [0.36, () => `That's ${Math.round(0.36 * HOUSE_OF_WIND_STEPS).toLocaleString()}, near enough. My knees keep the count.`],
    [0.5, 'Look back, if you like. The Rainbow is the only quarter that\'s brighter at night than by day.'],
    [0.64, 'When I was a girl, there was no city below. Only fishing huts and the river.'],
    [0.8, 'You walk like someone who learned on rough ground. Mortal ground.'],
    [0.93, 'Nearly. I always slow down at the end. I like the arriving.'],
  ];
  let stairJob = null;
  add({
    pos: priestess.pos, r: 2.6, enabled: () => !stairJob && !state.completed.has('priestess_stairs'),
    label: () => 'E — speak with the priestess',
    on: () => talk(priestess, async () => {
      await ui.say('Priestess', 'Ten thousand steps. I don\'t need wings, and I will not be carried.');
      const c = await ui.ask('Priestess', 'You may walk with me, if you can keep an old woman\'s pace.', ['I\'ll walk with you.', 'Another night.']);
      if (c === 1) return;
      stairJob = { next: 0, warned: 0 };
      if (state.flying) player.land();
    }),
  });

  function stairTick(dt) {
    if (!stairJob) return;
    const prog = Math.max(0, Math.min(1, (STAIR.z0 - priestess.pos.z) / (STAIR.z0 - STAIR.z1)));
    const ahead = (STAIR.z0 - player.pos.z) - (STAIR.z0 - priestess.pos.z); // + if she's ahead of the priestess
    const gap = player.pos.distanceTo(priestess.pos);
    const top = new THREE.Vector3(STAIR.x - 1, STAIR.top, STAIR.z1 - 6);
    if (state.flying) {
      stairJob.warned += dt;
      priestess.target = null;
      if (!ctx.busy && stairJob.warned > 0.5 && stairJob.warned < 0.6) ui.say('Priestess', 'Wings away, please. We walk.');
      return;
    }
    if (ahead > 7) {
      priestess.target = null; priestess.lookAt = player.pos;
      if (!stairJob.waiting) { stairJob.waiting = true; ui.say('Priestess', 'It isn\'t a race, lady. The stair will still be here.'); }
    } else if (gap > 10) {
      priestess.target = null; priestess.lookAt = player.pos; // she waits for you
    } else {
      stairJob.waiting = false;
      priestess.lookAt = null;
      if (prog < 1) {
        const z = Math.max(STAIR.z1 - 6, priestess.pos.z - 4);
        priestess.goTo(new THREE.Vector3(STAIR.x + 1.1, 0, z));
      } else priestess.goTo(top);
    }
    const line = stairLines[stairJob.next];
    if (line && prog >= line[0] && gap < 9) {
      ui.say('Priestess', typeof line[1] === 'function' ? line[1]() : line[1], 5200);
      stairJob.next += 1;
    }
    if (prog >= 0.995 && priestess.pos.distanceTo(top) < 3 && gap < 8 && !stairJob.done) {
      stairJob.done = true;
      priestess.target = null;
      talk(priestess, async () => {
        await ui.say('Priestess', 'There. Ten thousand, and the city under us like a spilled jewel box.');
        await ui.say('Priestess', 'The sisters keep a hearth here. You\'re welcome at it, any night you climb.');
        state.completeJob('priestess_stairs');
        stairJob = null;
      });
    }
  }
  priestess.walkSpeed = 0.8;

  // ---- The summons you may refuse ----
  // the summons comes once per save, not once per page load
  let summonsDone = state.declinedSummons > 0 || state.bargains.some((b) => b.id === 'keir_summons');
  function summonsTick() {
    if (ctx.story && !ctx.story.flag('act2')) return;
    if (api.holdSummons || ui.overlayOpen || summonsDone || ctx.busy || state.completed.size === 0 || stairJob) return;
    summonsDone = true;
    const spot = player.pos.clone().add(new THREE.Vector3(Math.sin(player.heading) * 6, 0, Math.cos(player.heading) * 6));
    messenger.pos.copy(spot.clone().add(new THREE.Vector3(8, 0, 0)));
    if (messenger.pos.z < RIVER_HALF + 1 && messenger.pos.z > -RIVER_HALF - 1) messenger.pos.z = player.pos.z;
    messenger.goTo(player.pos.clone().add(new THREE.Vector3(1.6, 0, 0)));
    setTimeout(() => talk(messenger, async () => {
      await ui.say('Masked messenger', 'From the Steward of the Hewn City. You are expected in his throne room tonight.');
      const c = await ui.ask('Masked messenger', 'He does not like to wait.', ['Tell Keir I have other plans.', 'I\'ll come.']);
      if (c === 0) {
        state.declineSummons();
        await ui.say('Masked messenger', 'He will remember that you said so.');
        await ui.say('', '<i>You can refuse a summons. It is never free.</i>');
      } else {
        await ui.say('Masked messenger', 'Then follow the torches when you\'re ready.');
        await ui.say('', '<i>The Hewn City is not built in this prototype yet. The summons waits in your slips.</i>', 3600);
        state.strikeBargain({ id: 'keir_summons', withWhom: 'Keir, Steward of the Hewn City', owe: 'You owe him', terms: 'Your presence in his throne room, accepted on the quay at night.' });
      }
      messenger.goTo(messenger.pos.clone().add(new THREE.Vector3(30, 0, 0)));
    }), 3500);
  }

  const api = {
    holdSummons: false,
    named,
    interactables,
    skiff,
    pigments,
    update(dt, t) {
      for (const p of pigments) if (p.mesh.visible) {
        p.mesh.material.opacity = 0.18 + Math.sin(t * 1.7 + p.pos.x) * 0.06;
        p.mesh.scale.setScalar(1 + Math.sin(t * 0.8 + p.pos.x) * 0.08);
      }
      stairTick(dt);
      summonsTick();
      skiff.position.y = WATER_Y + 0.05 + Math.sin(t * 1.3) * 0.03;
      skiff.rotation.z = Math.sin(t * 0.9) * 0.025;
    },
    get busy() { return ctx.busy; },
  };
  return api;
}
