// The open-world side jobs that are not in the Velaris slice: each one is a small piece of work
// you actually do. Finishing opens a shop, camp or sibling; trust moves only because the work was
// done on that court's land (GameState.completeJob routes it).
import * as THREE from 'three';
import { person, act, v3 } from '../regions/region.js';
import { look } from './cast.js';
import { pbr, plain } from '../engine/assets.js';

export function setupJobs(ctx) {
  const { ui, state } = ctx;
  const say = (w, l, ms) => ui.say(w, l, ms);
  const done = (id) => state.completed.has(id);
  const updaters = [];
  const carry = { what: null };
  const finish = async (id, line) => {
    if (done(id)) return;
    state.completeJob(id);
    await say('', `<i>${line}</i>`, 3200);
    ctx.save();
  };

  const api = {
    carry,
    spawnPerson(R, cast, x, z, heading = 0) { return person(R, look(cast), x, z, heading); },
    update(dt, t) { for (const u of updaters) u(dt, t); },
    attach(R) { (ATTACH[R.id] ?? (() => {}))(R); },
    stealth: { begin: (R, cb) => weaverStealth(R, cb) },
  };

  // ------------------------------------------------------------------ mortal village
  const ATTACH = {};
  ATTACH.mortal_village = (R) => {
    let accepted = false, laid = 0;
    const fam = R.named.family;
    act(R, fam.pos, () => (accepted ? 'E — speak with the man who lives here now' : 'E — speak with the man by the cottage door'), () => ctx.talk(fam, async () => {
      if (done('cottage_roof')) { await say('Cottager', 'Dry for the first winter since we came. The children sleep through the night.'); return; }
      if (accepted) { await say('Cottager', `${5 - laid} more bundles, and the worst of it's done.`); return; }
      await say('Cottager', 'You lived here once? Then you know the roof. It leaks over the children\'s bed, and I can\'t climb with this leg.');
      const c = await ui.ask('Cottager', 'There\'s fresh thatch by the door.', ['I\'ll fix it.', 'Not today.']);
      if (c === 0) { accepted = true; await say('', '<i>Carry a bundle from the pile up the ladder. Five holes to stop.</i>', 2600); }
    }), { enabled: () => !!fam });
    act(R, R.thatchPile, () => (carry.what === 'thatch' ? 'You are carrying a bundle of thatch' : 'E — take a bundle of thatch'), async () => {
      if (carry.what) return;
      carry.what = 'thatch';
      await say('', '<i>Heavy, prickly, smells of summer. Up the ladder with it.</i>', 1800); ui.clearSay();
    }, { enabled: () => accepted && !done('cottage_roof') });
    act(R, v3(R.cottage.x + 3.7, 0, R.cottage.z + 3.4), 'E — climb up and lay the bundle', () => ctx.talk(null, async () => {
      const hole = R.cottage.holes[laid];
      if (hole) hole.material = pbr('thatch', { repeat: [0.4, 0.4] });
      laid += 1; carry.what = null;
      await say('', `<i>You beat the bundle into place and pin it with hazel. ${laid < 5 ? `${5 - laid} to go.` : 'The last gap closes.'}</i>`, 2200);
      if (laid >= 5) await finish('cottage_roof', 'The roof is whole. Smoke goes up the chimney instead of out through the thatch.');
    }), { enabled: () => carry.what === 'thatch' });
  };

  // ------------------------------------------------------------------ windhaven
  ATTACH.windhaven = (R) => {
    // count the clipped wings
    const qm = R.named.quartermaster;
    let counting = false;
    const seen = new Set();
    act(R, qm.pos, 'E — speak with the quartermaster', () => ctx.talk(qm, async () => {
      if (done('clipped_wings')) { await say('Quartermaster', 'Ledger\'s in. Nobody\'s happy. That\'s how you know it\'s honest.'); return; }
      if (!counting) {
        await say('Quartermaster', 'Lord wants a count of the females who can\'t fly. For the ledger.');
        await say('Quartermaster', 'Walk the camp. Ask them. Then come back and tell me what to write.');
        counting = true; return;
      }
      if (seen.size < R.clipped.length) { await say('Quartermaster', `You've asked ${seen.size}. There are more than that.`); return; }
      const clipped = R.clipped.filter((p) => p.clipped).length;
      const c = await ui.ask('Quartermaster', 'Well? What goes in the book?', [`${clipped}. And their names, so someone answers for each one.`, `${clipped}.`, 'None. Write that they can all fly.']);
      if (c === 2) await say('Quartermaster', 'That\'s a lie and we both know it. Fine. It\'s your name on the page, not mine.');
      else if (c === 0) { await say('Quartermaster', 'Names. Mother\'s tits. All right. Names.'); ctx.story.set('wings_named'); }
      else await say('Quartermaster', 'Short and true. I can work with that.');
      await finish('clipped_wings', c === 2 ? 'The ledger says nothing is wrong. You will remember that it does.' : 'The ledger is honest. A camp to the south opens its fires to you.');
    }));
    for (const p of R.clipped) {
      act(R, p.pos, 'E — ask her about her wings', () => ctx.talk(p, async () => {
        seen.add(p);
        await say('An Illyrian female', p.clipped
          ? ['They cut them when I was fifteen. So I wouldn\'t leave.', 'Clipped. Don\'t look at them like that, I\'m not a ruin.', 'I can glide off the cliff if the wind is right. That\'s all.', 'My father did it. My mother held me.', 'I sew. I don\'t need wings to sew.', 'Ask the males how many they\'ve clipped. They\'ll know the number better than me.'][R.clipped.indexOf(p) % 6]
          : 'Mine are whole. My mother hid me in the passes the year they came for us.');
      }), { enabled: () => counting && !seen.has(p) && !done('clipped_wings'), r: 2.4 });
    }

    // walk the sheep out of the pass
    const sh = R.named.shepherd;
    let sheep = [];
    act(R, sh.pos, 'E — speak with the shepherd boy', () => ctx.talk(sh, async () => {
      if (done('sheep_pass')) { await say('Shepherd boy', 'All of them! Even the black one that bites.'); return; }
      if (sheep.length) { const n = sheep.filter((s) => s.position.distanceTo(R.pen) < 5.5).length; await say('Shepherd boy', `${n} in the pen. They're scared of you; walk behind them, not at them.`); return; }
      await say('Shepherd boy', 'Snow\'s coming early. The flock\'s still up the pass and I can\'t get them down alone.');
      await say('Shepherd boy', 'Walk behind them and they\'ll go ahead of you. The pen is at the mouth of the pass.');
      sheep = spawnSheep(R, 12);
    }));
    updaters.push((dt, t) => {
      if (!sheep.length || ctx.region !== R || done('sheep_pass')) return;
      herd(R, sheep, ctx.player.pos, dt, t);
      const inPen = sheep.filter((s) => s.position.distanceTo(R.pen) < 5.5).length;
      if (inPen >= 10) finish('sheep_pass', 'Ten in the pen, and two the boy swears he will fetch himself. The pass camp lights a fire for you.');
    });
  };

  // ------------------------------------------------------------------ adriata
  ATTACH.adriata = (R) => {
    let accepted = false;
    const nm = R.named.netmender;
    act(R, nm.pos, 'E — speak with the net-mender', () => ctx.talk(nm, async () => {
      if (done('adriata_nets')) { await say('Net-mender', 'They\'ll hold. Your knots are uglier than mine, but they\'ll hold.'); return; }
      await say('Net-mender', 'Storm took half the fleet\'s nets. Every boat that doesn\'t go out is a family that doesn\'t eat.');
      await say('Net-mender', 'Sheet bend, pulled tight, and check it twice. Five frames.');
      accepted = true;
    }));
    for (const n of R.nets) {
      act(R, n.pos, () => `E — mend this net (${n.tears - n.mended} tears)`, () => ctx.talk(null, async () => {
        n.mended += 1;
        n.net.material = n.net.material.clone();
        n.net.material.color.lerp(new THREE.Color(0xc8b890), 0.35);
        await say('', '<i>Shuttle through, round, under, pull. Your fingers are raw with salt.</i>', 1500);
        if (R.nets.every((x) => x.mended >= x.tears)) await finish('adriata_nets', 'Every net on the quay is whole. The quay market opens its stalls to you.');
      }), { enabled: () => accepted && n.mended < n.tears && !done('adriata_nets'), r: 2.2 });
    }
  };

  // ------------------------------------------------------------------ day library
  ATTACH.day_library = (R) => {
    const CATS = [{ name: 'Histories', x: 20, z: -38 }, { name: 'Poetry', x: 30, z: -38 }, { name: 'Maps', x: 20, z: -54 }, { name: 'Law', x: 30, z: -54 }];
    let accepted = false, shelved = 0;
    const order = [0, 2, 1, 3, 0, 3, 2, 1];
    const lib = R.named.librarian;
    act(R, lib.pos, 'E — speak with the under-librarian', () => ctx.talk(lib, async () => {
      if (done('day_reshelve')) { await say('Under-librarian', 'In order. By hand. I may weep.'); return; }
      await say('Under-librarian', 'A spell to sort the east wing went wrong. Now every book is where it wants to be, which is never where it belongs.');
      await say('Under-librarian', 'No magic. Take them from the cart, read the spine, shelve them. Histories, Poetry, Maps, Law.');
      accepted = true;
    }));
    act(R, R.cart, () => (carry.what ? `Carrying: ${CATS[carry.what.cat].name}` : 'E — take a book from the cart'), async () => {
      if (carry.what) return;
      const cat = order[shelved % order.length];
      carry.what = { cat };
      await say('', `<i>The spine is ${['dark blue', 'oxblood', 'green', 'ochre'][cat]}: <b>${['A Chronicle of the Second War', 'Songs for the Longest Day', 'Coasts of the Western Sea', 'On the Treaty and Its Exceptions'][cat]}</b>.</i>`, 2400); ui.clearSay();
    }, { enabled: () => accepted && !done('day_reshelve') });
    for (const [i, c] of CATS.entries()) {
      act(R, v3(c.x, 0, c.z + 1.3), `E — shelve it under ${c.name}`, async () => {
        if (carry.what.cat !== i) { await say('', '<i>Wrong section. The under-librarian\'s head comes up like a heron\'s.</i>', 1800); ui.clearSay(); return; }
        carry.what = null; shelved += 1;
        if (shelved >= 8) await finish('day_reshelve', 'The east wing is in order. The Day scribes ask you to supper.');
        else { await say('', `<i>${8 - shelved} more.</i>`, 1200); ui.clearSay(); }
      }, { enabled: () => carry.what && !done('day_reshelve'), r: 2.4 });
    }
  };

  // ------------------------------------------------------------------ hewn city
  ATTACH.hewn_city = (R) => {
    act(R, R.confessionBench, 'E — sit through confession hour', () => ctx.talk(null, async () => {
      if (done('confession_hour')) { await say('', '<i>The bench is cold. You have heard enough for one year.</i>', 2000); return; }
      await say('', '<i>Prisoners are allowed one hour a month to speak to someone who is not a guard. Today it is you.</i>', 3400);
      const confessions = [
        ['A prisoner', 'I stole from Keir\'s table. Bread. I would do it again.'],
        ['A prisoner', 'There\'s a cousin who wants your High Lord dead. I can tell you his name for a blanket.'],
        ['A prisoner', 'Do you think the river still runs up there? I used to fish it.'],
      ];
      let promised = 0;
      for (const [w, l] of confessions) {
        await say(w, l);
        const c = await ui.ask('', '<i>You may say nothing. Nothing is safe here.</i>', ['Say nothing. Listen.', 'Promise you will come back.']);
        if (c === 1) promised += 1;
      }
      if (promised) state.strikeBargain({ id: `confession_${Date.now()}`, withWhom: 'the prisoners under the Hewn City', owe: 'You owe them', terms: `I promised ${promised} of them I would come back. Promises said in that place are written down.` });
      await finish('confession_hour', 'An hour of listening. Keir\'s people note that you said little. They watch you a little less.');
    }), { r: 2.4 });
  };

  // ------------------------------------------------------------------ velaris: ward, singer, Solstice
  ATTACH.velaris = (R) => {
    const scribe = person(R, look('scribe', { robe: 0x1a2a4a, shirt: 0x2a3a5a }), -44, 25, Math.PI);
    act(R, scribe.pos, 'E — speak with the ward-scribe', () => ctx.talk(scribe, async () => {
      if (done('copy_ward')) { await say('Ward-scribe', 'Your ward is on the north gate now. It hums when it rains.'); return; }
      await say('Ward-scribe', 'Wards are drawn, not cast. A smudge, a wobble, and it\'s a doodle instead of a wall.');
      const c = await ui.ask('Ward-scribe', 'Copy this one for me? Steady hand, one stroke.', ['Give me the pen.', 'Later.']);
      if (c !== 0) return;
      const ok = await ui.wardGame();
      if (ok) await finish('copy_ward', 'The ward holds when the scribe tests it. Her shop takes your commissions.');
      else await say('Ward-scribe', 'Smudged. Again, when your hand is still.');
    }));

    // escort a Rainbow singer through one Hewn City set
    const singer = person(R, look('mor', { shirt: 0x6a2a8a, vest: 0x3a1a4a, robe: 0x6a2a8a, hair: 0x2a1a10, height: 1.66 }), -50, 21, Math.PI);
    singer.escort = 'idle';
    act(R, singer.pos, 'E — speak with the singer', () => ctx.talk(singer, async () => {
      if (done('rainbow_singer')) { await say('Singer', 'I\'m writing a song about it. You\'re in the second verse. You don\'t come off well.'); return; }
      if (singer.escort !== 'idle') { await say('Singer', 'Lead on. I\'m right behind you.'); return; }
      await say('Singer', 'They\'ve asked for a Rainbow set in the Hewn City. They pay in gold. Nobody comes back the same.');
      const c = await ui.ask('Singer', 'Walk me in? Walk me out?', ['I\'ll take you. Stay close.', 'Not tonight.']);
      if (c === 0) { singer.escort = 'to_stage'; await say('', '<i>She follows you. Take her down to the Hewn City (the painted map, M) and to the stage on the east side.</i>', 3600); }
    }));
    updaters.push((dt) => {
      if (!['to_stage', 'leaving'].includes(singer.escort)) return;
      const here = ctx.region;
      if (singer.region !== here && here) moveTo(singer, here, ctx.player.pos);
      const d = singer.pos.distanceTo(ctx.player.pos);
      if (d > 2.5) singer.goTo(ctx.player.pos.clone().add(new THREE.Vector3(-1, 0, 1)));
      if (here?.id === 'hewn_city' && singer.escort === 'to_stage' && singer.pos.distanceTo(here.stage) < 8) {
        singer.escort = 'singing';
        ctx.talk(singer, async () => {
          state.addHeat(0);
          await say('', '<i>She steps up into the torchlight and the masks go still. One song. Two. The third is about a river, and someone in the crowd starts to weep.</i>', 4600);
          await say('Singer', 'Done. Get me out before they decide they want an encore.');
          singer.escort = 'leaving';
        });
      }
      if (here?.id === 'hewn_city' && singer.escort === 'leaving' && singer.pos.distanceTo(here.marks.hewn_gate) < 6) {
        singer.escort = 'home';
        finish('rainbow_singer', 'Out of the dark with her and her gold. The music hall on the Rainbow keeps a seat for you.');
        moveTo(singer, ctx.build('velaris'), v3(-50, 0, 21));
      }
    });

    // Solstice: five gifts, carried across the city in the order on the list
    const recipients = [['amren', 'Amren'], ['mor', 'Mor'], ['painter', 'the painter on the Rainbow'], ['priestess', 'the priestess at the foot of the stair'], ['cassian', 'Cassian, on the House terrace']];
    let next = -1;
    const nameOf = (k) => recipients.find((r) => r[0] === k)[1];
    const bodyOf = (k) => (k === 'painter' ? R.missions.named[0] : k === 'priestess' ? R.missions.named[3] : R.named[k]);
    act(R, () => R.named.elain.pos, 'E — speak with Elain about the Solstice gifts', () => ctx.talk(R.named.elain, async () => {
      if (done('solstice_gifts')) { await say('Elain', 'Everyone got the right one. I checked. Twice.'); return; }
      if (next >= 0) { await say('Elain', `Next on the list is ${nameOf(recipients[next][0])}.`); return; }
      await say('Elain', 'Five gifts, and they must go in this order, or someone will know they were an afterthought.');
      await say('', `<i>The list: ${recipients.map((r) => r[1]).join(', then ')}.</i>`, 5200);
      next = 0;
    }), { enabled: () => ctx.story.flag('solstice') });
    for (const [k] of recipients) {
      act(R, () => bodyOf(k).pos, `E — give a Solstice gift`, () => ctx.talk(bodyOf(k), async () => {
        if (recipients[next][0] !== k) { await say('', `<i>Not yet. The list says ${nameOf(recipients[next][0])} first.</i>`, 2200); return; }
        await say(nameOf(k).split(',')[0].replace(/^the /, ''), ['A book I already have. I will read it again.', 'You remembered. Of course you remembered.', 'Brushes! The good kind!', 'Wool socks. For the stair. You understand me.', 'Is it a weapon? It\'s a scarf. I love it.'][next]);
        next += 1;
        if (next >= recipients.length) await finish('solstice_gifts', 'Five gifts, five doors, the right order. The Solstice market keeps a stall for you.');
      }), { enabled: () => ctx.story.flag('solstice') && next >= 0 && next < recipients.length && !done('solstice_gifts') });
    }
  };

  function moveTo(p, R2, pos) {
    p.region.root.remove(p.rig.root);
    const i = p.region.people.indexOf(p); if (i >= 0) p.region.people.splice(i, 1);
    p.region = R2;
    R2.root.add(p.rig.root);
    R2.people.push(p);
    p.pos.copy(pos).add(new THREE.Vector3(-1, 0, 1));
    p.target = null;
  }

  // ------------------------------------------------------------------ the Weaver
  function weaverStealth(R, cb) {
    if (R._stealth) { R._stealth.cb = cb; return; } // re-entering the wood resumes the same attempt
    R._stealth = { cb };
    const w = R.named.weaver;
    const home = R.weaverDoor.clone();
    let noise = 0, has = false, hunting = false, over = false;
    R.weaverSpinning = true;
    const taken = act(R, R.weaverPrize, 'E — lift the ring, slowly', async () => {
      has = true;
      await say('', '<i>It comes away from the bowl without a sound. Now back out, the way you came.</i>', 2400); ui.clearSay();
    }, { enabled: () => !has && !over, r: 1.6 });
    updaters.push((dt) => {
      if (over || ctx.region !== R) return;
      const p = ctx.player;
      const near = p.pos.distanceTo(home) < 12;
      const speed = p.vel.length();
      if (near && !hunting) {
        noise += (speed > 1.9 ? 0.9 : speed > 1.0 ? 0.12 : -0.15) * dt;
        noise = Math.max(0, noise);
        R.weaverSpinning = noise < 0.35;
        if (noise > 0.6) {
          hunting = true;
          ui.say('', '<i>The wheel stops. She turns her head toward you, and she has no eyes.</i>', 2600);
          ctx.combat.spawn(R, 'weaver', w.pos.clone(), { tag: 'weaver', hp: 999, body: w });
        }
      }
      if (has && p.pos.distanceTo(home) > 30) {
        over = true; ctx.combat.clear('weaver'); R.weaverSpinning = true;
        w.pos.set(home.x + 1.6, w.pos.y, home.z + 0.6);
        R._stealth.cb(true);
      }
    });
  }

  return api;
}

// ---------------------------------------------------------------- sheep
function spawnSheep(R, n) {
  const wool = pbr('linen', { repeat: [2, 2], color: 0xe8e0d0, normalScale: 3 });
  const dark = plain(0x1a1614, 0.8);
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), i === 3 ? plain(0x2a2420, 1) : wool);
    body.scale.set(1, 0.75, 1.35); body.position.y = 0.75; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.42), dark); head.position.set(0, 0.95, 0.75); g.add(head);
    for (const [x, z] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), dark); leg.position.set(x, 0.27, z); g.add(leg);
    }
    const x = 170 + Math.random() * 30, z = 10 + Math.random() * 20;
    g.position.set(x, R.ground(x, z), z);
    g.userData.v = new THREE.Vector3();
    R.root.add(g);
    out.push(g);
  }
  return out;
}

function herd(R, sheep, player, dt, t) {
  for (const s of sheep) {
    const v = s.userData.v;
    const away = s.position.clone().sub(player); away.y = 0;
    const d = away.length();
    if (d < 9) v.addScaledVector(away.normalize(), (9 - d) * 0.6 * dt);
    // flock: drift toward the others, and down the pass toward the pen when pushed
    const c = new THREE.Vector3();
    for (const o of sheep) if (o !== s) c.add(o.position);
    c.divideScalar(sheep.length - 1).sub(s.position); c.y = 0;
    v.addScaledVector(c.normalize(), 0.25 * dt);
    if (s.position.distanceTo(R.pen) < 5) v.multiplyScalar(0.85);
    v.x += Math.sin(t * 0.7 + s.id) * 0.05 * dt;
    v.multiplyScalar(0.96);
    if (v.length() > 3) v.setLength(3);
    s.position.addScaledVector(v, dt);
    s.position.z = Math.max(-10, Math.min(50, s.position.z));
    s.position.y = R.ground(s.position.x, s.position.z) ?? s.position.y;
    if (v.lengthSq() > 0.01) s.rotation.y = Math.atan2(v.x, v.z);
    s.children[0].position.y = 0.75 + Math.abs(Math.sin(t * 8 + s.id)) * 0.04 * Math.min(1, v.length());
  }
}
