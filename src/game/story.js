// The story director. Beats run in order inside a campaign; each beat names where it happens,
// what the journal says, and what finishes it. Between beats the island stays open.
// All dialogue is original to this fan project.
import * as THREE from 'three';
import { COURT_NAMES } from '../core/content.js';
import { ARMY_TRUST } from '../core/state.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const params0 = () => new URLSearchParams(location.search);

const JOURNEYS = {
  mortal_village: 'South, past the Wall, to where the snow lies on the poor.',
  spring_manor: 'A carriage that needs no horses, a road that needs no map. Spring.',
  velaris: 'North, through the dark between stars, to a city that is not on any map.',
  hewn_city: 'Down. Then further down. The mountain swallows the light behind you.',
  windhaven: 'Three days on the wing, or one long held breath of winnowing. Windhaven.',
  adriata: 'West and south to the sea. Salt in the air before you see the water.',
  autumn_forest: 'Into the forest that is always turning, where the roads are watched.',
  winter_glasshouse: 'North and east, over snowfields that ring like glass.',
  dawn_infirmary: 'East, to the cliffs where the sun comes up out of the sea.',
  day_library: 'To the court of Day, and the library that has no last shelf.',
  the_middle: 'Into the Middle, where the trees are older than the courts.',
  under_mountain: 'Under the mountain. There is no other way to him.',
};

export class Story {
  constructor(ctx) {
    this.ctx = ctx;
    this.campaign = 'feyre';
    this.i = 0;
    this.flags = new Set();
    this.audiences = new Set();
    this.favors = {};
    this.beats = { feyre: feyreBeats(this), nesta: nestaBeats(this) };
    this.watch = []; // per-frame checks of the active beat
  }

  // ---------------------------------------------------------------- state
  flag(k) { return this.flags.has(k); }
  set(k) { this.flags.add(k); }
  get beat() { return this.beats[this.campaign][this.i]; }
  save() { return { campaign: this.campaign, i: this.i, flags: [...this.flags], audiences: [...this.audiences], favors: this.favors }; }
  async load(state) {
    let d = null;
    if (params0().has('test')) d = null; else try { d = JSON.parse(localStorage.getItem('court-of-mist-save') ?? 'null')?.story; } catch { /* fresh */ }
    const params = new URLSearchParams(location.search);
    if (params.has('act')) d = { campaign: 'feyre', i: this.indexOf(['hunt', 'the_bargain', 'spy'][+params.get('act') - 1] ?? 'hunt'), flags: { 1: [], 2: ['made', 'act2', 'winnow'], 3: ['made', 'act2', 'winnow', 'wings', 'act3', 'solstice'] }[params.get('act')] ?? [] };
    if (d) { this.campaign = d.campaign; this.i = d.i; this.flags = new Set(d.flags); this.audiences = new Set(d.audiences ?? []); this.favors = d.favors ?? {}; }
  }
  indexOf(id, campaign = 'feyre') { return Math.max(0, this.beats[campaign].findIndex((b) => b.id === id)); }

  regionOpen(id) {
    const f = (k) => this.flag(k);
    if (this.campaign === 'nesta') return ['velaris', 'windhaven', 'mortal_village'].includes(id);
    switch (id) {
      case 'mortal_village': return true;
      case 'spring_manor': return f('taken');
      case 'under_mountain': return f('under') && !f('made');
      case 'velaris': case 'hewn_city': case 'windhaven': return f('act2');
      case 'the_middle': return f('act2') && !f('suriel_done');
      default: return f('act3'); // the other courts receive you only once the war is coming
    }
  }
  journeyText(id) { return JOURNEYS[id] ?? ''; }

  // ---------------------------------------------------------------- flow
  async begin(startRegion) {
    const b = this.beat;
    const where = b?.region ?? (this.flag('done') ? 'velaris' : startRegion ?? 'mortal_village');
    await this.ctx.travel(where, b?.place, { instant: true }); // onEnter starts and announces the beat
    this.ctx.regions.velaris?.setSolstice?.(this.flag('solstice'));
  }

  async startBeat() {
    const b = this.beat;
    this.watch = [];
    if (!b) return;
    const R = this.ctx.region;
    if (b.region && R?.id === b.region) await b.start?.(R);
    this.announce();
  }

  announce() {
    const b = this.beat;
    if (!b || this.ctx.busy) return;
    this.ctx.ui.say('', `<i>${b.objective}</i>`, 3800).then(() => { if (!this.ctx.busy) this.ctx.ui.clearSay(); });
  }

  async complete(id) {
    const b = this.beat;
    if (!b || b.id !== id) return;
    this.watch = [];
    this.i += 1;
    this.ctx.save();
    const next = this.beat;
    if (!next) return;
    if (next.travel) {
      await this.ctx.travel(next.region, next.place, { journey: next.travel === true ? JOURNEYS[next.region] : next.travel });
    } else {
      await this.startBeat();
    }
  }

  onEnter(R) {
    const b = this.beat;
    R.setSolstice?.(this.flag('solstice'));
    if (b && b.region === R.id) { this.watch = []; Promise.resolve(b.start?.(R)).then(() => this.announce()); }
  }

  attach(R) {
    // each beat may add interactions to the region it happens in; they only answer while it is active
    for (const [campaign, list] of Object.entries(this.beats)) {
      for (const b of list) {
        for (const it of b.acts ?? []) {
          if (it.region !== R.id) continue;
          const pos = typeof it.at === 'function' ? it.at(R) : it.at;
          R.interactables.push({
            pos, r: it.r ?? 2.8, label: () => it.label,
            enabled: () => this.campaign === campaign && this.beat?.id === b.id && (!it.when || it.when()),
            on: () => it.run(R),
          });
        }
      }
    }
    // High Lord audiences and court favors are open whenever their court is
    for (const a of AUDIENCES) if (a.region === R.id) this.audience(R, a);
    for (const fv of FAVORS) if (fv.region === R.id) this.favor(R, fv);
  }

  update(dt) {
    if (this.ctx.region?.id !== this.beat?.region) return;
    if (this.ctx.busy) return;
    for (const w of this.watch) if (w(dt)) break;
  }

  /** A one-shot condition on the active beat, checked each frame while you are in its region. */
  when(cond, then) {
    let done = false;
    this.watch.push((dt) => { if (done || !cond(dt)) return false; done = true; then(); return true; });
  }

  // ---------------------------------------------------------------- shared scene helpers
  say(who, line, ms) { return this.ctx.ui.say(who, line, ms); }
  ask(who, line, opts) { return this.ctx.ui.ask(who, line, opts); }
  talk(npc, fn) { return this.ctx.talk(npc, fn); }

  // ---------------------------------------------------------------- the courts (Act 3)
  audience(R, a) {
    const npc = () => R.named[a.lord];
    R.interactables.push({
      pos: npc()?.pos ?? R.spawn.pos, r: 3, label: () => `E — ask for an audience with ${a.name}`,
      enabled: () => this.flag('act3') && !this.audiences.has(a.court) && this.campaign === 'feyre',
      on: () => this.talk(npc(), async () => {
        for (const line of a.open) await this.say(a.name, line);
        const earned = a.earned(this.ctx.state);
        const c = await this.ask(a.name, a.question, earned ? [a.good, a.weak] : [a.weak, 'I have nothing to offer you yet.']);
        this.audiences.add(a.court);
        if (earned && c === 0) {
          this.ctx.state.recordWork(a.court, R.id, `Audience with ${a.name}`);
          await this.say(a.name, a.yes);
        } else await this.say(a.name, a.no);
        if (this.audiences.size >= 5 && this.beat?.id === 'high_lords') this.complete('high_lords');
      }),
    });
  }

  favor(R, fv) {
    this.favors[fv.id] = this.favors[fv.id] ?? 0; // 0 unasked, 1 carrying, 2 done
    const giver = () => R.named[fv.giver] ?? R.people[fv.giverIndex ?? 0];
    R.interactables.push({
      pos: fv.at ? fv.at(R) : giver().pos, r: 2.8,
      label: () => (this.favors[fv.id] === 1 ? `E — ${fv.deliverLabel}` : `E — ${fv.label}`),
      enabled: () => this.regionOpen(R.id) && this.favors[fv.id] < 2 && this.campaign === 'feyre',
      on: () => this.talk(this.favors[fv.id] === 1 ? null : giver(), async () => {
        if (this.favors[fv.id] === 0) {
          for (const l of fv.ask) await this.say(fv.who, l);
          this.favors[fv.id] = fv.deliver ? 1 : 2;
          if (fv.deliver) { fv.onAccept?.(R, this); return; }
        } else {
          await this.say('', `<i>${fv.done}</i>`, 2600);
          this.favors[fv.id] = 2;
        }
        if (this.favors[fv.id] === 2) {
          this.ctx.state.recordWork(fv.court, R.id, fv.title);
          await this.say('', `<i>${fv.thanks}</i>`, 2600);
        }
      }),
    });
    if (fv.deliver) {
      const target = fv.deliver(R);
      R.interactables.push({
        pos: target, r: 2.6, label: () => `E — ${fv.deliverLabel}`,
        enabled: () => this.favors[fv.id] === 1,
        on: () => this.talk(null, async () => {
          await this.say('', `<i>${fv.done}</i>`, 2600);
          this.favors[fv.id] = 2;
          this.ctx.state.recordWork(fv.court, R.id, fv.title);
          await this.say('', `<i>${fv.thanks}</i>`, 2400);
        }),
      });
    }
  }

  journal() {
    const b = this.beat;
    const table = this.ctx.state.warTable();
    const ACTS = { 1: 'Act One: Spring', 2: 'Act Two: Night', 3: 'Act Three: War', N: 'Nesta' };
    const list = this.beats[this.campaign];
    const done = list.slice(0, this.i).map((x) => `<li class="done">${x.title}</li>`).join('');
    return `
      <h2>${this.campaign === 'nesta' ? 'Nesta' : 'Feyre'}</h2>
      <p class="act">${b ? ACTS[b.act] : 'After'}</p>
      <ol>${done}${b ? `<li class="now">${b.title}<span>${b.objective}</span></li>` : '<li class="now">The story is told. The city stays open.</li>'}</ol>
      ${this.flag('act3') ? `<h3>Courts</h3><ul class="courts">${table.map((r) => `<li>${COURT_NAMES[r.court]} <b>${'|'.repeat(r.trust)}</b> ${r.marches ? 'will march' : `needs ${Math.max(0, ARMY_TRUST - r.trust)} more`}</li>`).join('')}</ul>` : ''}
      ${this.flag('solstice') ? '<p class="act">Solstice week in Velaris.</p>' : ''}`;
  }

  async startNesta() {
    this.campaign = 'nesta'; this.i = 0;
    this.ctx.playAs('nesta');
    await this.ctx.travel('velaris', 'house', { journey: 'The House of Wind. No way down but the stairs.' });
  }
}

// ==================================================================== Feyre's campaign
function feyreBeats(S) {
  const ctx = S.ctx;
  const say = (w, l, ms) => S.say(w, l, ms);
  return [
    // ------------------------------------------------ ACT ONE
    {
      id: 'hunt', act: 1, title: 'The wolf in the snow', region: 'mortal_village', place: 'cottage',
      objective: 'Three days without meat. Take the bow into the forest north of the cottage and hunt.',
      start(R) {
        if (!S._huntSpawned) {
          S._huntSpawned = true;
          ctx.combat.spawn(R, 'deer', v3(-30, 0, -120), { tag: 'deer', passive: true });
          ctx.combat.spawn(R, 'wolf', v3(-10, 0, -130), { tag: 'wolf', hp: 3 });
        }
        S.when(() => ctx.combat.dead('wolf'), async () => {
          await S.talk(null, async () => {
            await say('', '<i>The wolf is too large, and too quiet, and its eyes were too clever. You do not let yourself think about that.</i>', 4000);
            await say('', '<i>You skin the doe where she fell. The meat will keep them for a week.</i>', 3200);
          });
          S.complete('hunt');
        });
      },
    },
    {
      id: 'home', act: 1, title: 'The beast at the door', region: 'mortal_village', place: 'forest',
      objective: 'Carry the meat home to the cottage.',
      acts: [{ region: 'mortal_village', at: (R) => R.marks.cottage_gate, label: 'E — go inside', async run(R) {
        await S.talk(R.named.nesta, async () => {
          await say('Nesta', 'You took your time. Elain was about to start boiling the furniture.');
          await say('Elain', 'Don\'t listen to her. Sit by the fire, your hands are blue.');
          await say('', '<i>Night. The door bursts inward, and something huge fills it: a beast all fur and fang, with a voice like a man\'s.</i>', 4200);
          await say('The beast', 'Who killed my sentry in the wood? A life was taken. The Treaty is owed a life.');
          const c = await S.ask('The beast', 'Come with me across the Wall and live out your days on my land, or pay it here.', ['I killed the wolf. I will go.', 'Take me, then. Leave them alone.']);
          await say('', '<i>You do not look back at the cottage. You do not let them see you look back.</i>', 3000);
          S.set('taken');
        });
        S.complete('home');
      } }],
    },
    {
      id: 'manor', act: 1, title: 'The Spring manor', region: 'spring_manor', place: 'garden', travel: true,
      objective: 'A manor of roses where everyone wears a mask. Find the red-haired one in the gardens.',
      acts: [{ region: 'spring_manor', at: (R) => R.named.lucien.pos, label: 'E — speak with the fox-masked courtier', async run(R) {
        await S.talk(R.named.lucien, async () => {
          await say('Lucien', 'The human. Wonderful. Don\'t eat anything that looks like it\'s smiling at you.');
          await say('Lucien', 'The masks? A party trick that went wrong. Ask him at dinner, if you like watching people choke.');
          await say('Lucien', 'And stay out of the woods. Something sick is spreading through them.');
        });
        await S.talk(R.named.tamlin, async () => {
          await say('Tamlin', 'You are not a prisoner here. Paint, if you like. There are rooms full of light no one uses.');
          await say('Tamlin', 'Only don\'t go past the garden wall at night.');
        });
        S.complete('manor');
      } }],
    },
    {
      id: 'naga', act: 1, title: 'Something in the woods', region: 'spring_manor', place: 'woods',
      objective: 'You went past the garden wall. Something is following you through the trees.',
      start(R) {
        if (!S._naga) { S._naga = true; for (const [x, z] of [[110, 30], [118, 48], [104, 56]]) ctx.combat.spawn(R, 'naga', v3(x, 0, z), { tag: 'naga', hp: 3 }); }
        S.when(() => ctx.combat.dead('naga'), async () => {
          await S.talk(R.named.tamlin, async () => {
            await say('', '<i>He finds you with your back against a tree, three dead things at your feet and your last arrow nocked.</i>', 3600);
            await say('Tamlin', 'Naga. They have never come so close to the house.');
          });
          S.complete('naga');
        });
      },
    },
    {
      id: 'firenight', act: 1, title: 'Fire night', region: 'spring_manor', place: 'woods',
      objective: 'Calanmai. Drums in the eastern woods. Go to the fire in the glade.',
      start(R) {
        ctx.applyEnv({ ...R.env, sky: 'night', sunColor: 0x8090b0, sunIntensity: 0.3, hemi: [0x202838, 0x0a0806, 0.4], fog: [0x101420, 0.012], exposure: 1.2, weather: 'embers' });
        R.fireNight.fire.visible = true;
      },
      acts: [{ region: 'spring_manor', at: (R) => R.fireNight.pos, r: 6, label: 'E — step into the firelight', async run(R) {
        const rhys = R.named.lucien; // stand-in body for the stranger at the fire
        await S.talk(rhys, async () => {
          await say('', '<i>Three faeries close around you by the fire, laughing. A fourth voice cuts through them, cold and amused, and they melt away.</i>', 4200);
          await say('The stranger', 'Humans should not wander into the Rite. Go home, little mortal. And don\'t thank me. I collect on thanks.');
          await say('', '<i>Days later, the court falls silent. Tamlin is gone, taken Under the Mountain. You know where you are going before you decide to.</i>', 4200);
        });
        R.fireNight.fire.visible = false;
        S.set('under');
        ctx.applyEnv(R.env);
        S.complete('firenight');
      } }],
    },
    {
      id: 'trial1', act: 1, title: 'The first trial', region: 'under_mountain', place: 'hall', travel: true,
      objective: 'Under the Mountain. Kneel before the queen on the black throne, or at least walk up to her.',
      acts: [{ region: 'under_mountain', at: (R) => new THREE.Vector3(0, 0, -50), r: 5, label: 'E — face the queen', async run(R) {
        await S.talk(R.named.amarantha, async () => {
          await say('Amarantha', 'A human girl came all this way for him. How sweet. How useless.');
          await say('Amarantha', 'Three trials, then. Survive them and he is yours. Or answer my riddle at any time, and skip the rest.');
          await say('', '<i>They drop you into the mud of the labyrinth. Something large moves under the surface, toward the sound of your feet.</i>', 3800);
        });
        await ctx.travel('under_mountain', 'maze', { instant: false });
        ctx.combat.spawn(R, 'wyrm', R.maze.origin.clone().add(v3(R.maze.cell * 5.5, 0, R.maze.cell * 1.5)), { tag: 'wyrm', hp: 999 });
        S.when(() => ctx.player.pos.distanceTo(R.maze.exit) < 3, async () => {
          ctx.combat.clear('wyrm');
          await S.talk(null, async () => { await say('', '<i>A rope. You climb it with the thing\'s breath on your heels, and the crowd above roars as if it were a dance.</i>', 3800); });
          S.complete('trial1');
        });
      } }],
    },
    {
      id: 'bargain', act: 1, title: 'A bargain in the dark', region: 'under_mountain', place: 'cell',
      objective: 'Your arm is broken and burning with fever. Someone is in the cell with you.',
      start(R) {
        const rh = R.named.rhysand;
        rh.pos.set(1, 0, 32); rh.fixedY = false;
        S.when(() => true, async () => {
          await S.talk(rh, async () => {
            await say('Rhysand', 'You\'re dying. Slowly, then quickly. I can mend it.');
            await say('Rhysand', 'The price: one week of every month, with me, at the Night Court. For the rest of your life.');
            const c = await S.ask('Rhysand', 'A week a month, or that arm takes you before the second trial.', ['Two days a month.', 'One week. Done.']);
            if (c === 0) await say('Rhysand', 'Charming. One week. The arm doesn\'t negotiate, and neither do I.');
            ctx.state.strikeBargain({ id: 'night_court_week', withWhom: 'Rhysand, High Lord of the Night Court', owe: 'You owe him', terms: 'One week of every month at the Night Court, for as long as I live. Paid in ink on my left hand.' });
            await say('', '<i>Ink curls over your hand and up your arm like smoke. A slip of the bargain stays with you. B to read it.</i>', 3600);
          });
          S.complete('bargain');
        });
      },
    },
    {
      id: 'trial2', act: 1, title: 'The second trial', region: 'under_mountain', place: 'riddle', travel: 'They bring you to a chamber with three levers. The ceiling is made of spikes.',
      objective: 'Read the riddle on the wall and pull the right lever before the ceiling comes down.',
      start(R) {
        R.spikes.position.y = 9.3;
        S._riddleT = 0;
        S.when((dt) => { S._riddleT += dt; R.spikes.position.y = Math.max(2.2, 9.3 - S._riddleT * 0.08); return R.spikes.position.y <= 2.2; }, async () => {
          await S.talk(null, async () => { await say('', '<i>The spikes stop a hand\'s width above your head. Someone in the gallery is laughing.</i>', 3000); });
          R.spikes.position.y = 9.3; S._riddleT = 0;
          S.startBeat();
        });
      },
      acts: [0, 1, 2].map((i) => ({
        region: 'under_mountain', at: (R) => R.levers[i].pos, r: 1.8, label: ['E — pull the lever marked with a crowned heart', 'E — pull the lever marked with a closed eye', 'E — pull the lever marked with a broken key'][i],
        async run(R) {
          if (i === 0) {
            R.levers[i].mesh.rotation.z = -0.5;
            await S.talk(null, async () => {
              await say('', '<i>The riddle on the wall: <b>It makes the strong kneel and the cowards brave; it can be given away and still be kept.</b></i>', 4200);
              await say('', '<i>The heart. The ceiling stops, groaning, and lifts.</i>', 2400);
            });
            R.spikes.position.y = 9.3;
            S.complete('trial2');
          } else {
            await S.talk(null, async () => { await say('', '<i>A grinding of chains. The ceiling drops faster.</i>', 2000); });
            S._riddleT += 25;
          }
        },
      })),
    },
    {
      id: 'trial3', act: 1, title: 'The third trial', region: 'under_mountain', place: 'hall', travel: 'The throne hall. Three figures kneel before the dais, hooded.',
      objective: 'Three hooded figures kneel before you. Approach them.',
      start(R) { for (const h of R.hooded) h.rig.root.visible = true; },
      acts: [{ region: 'under_mountain', at: () => new THREE.Vector3(0, 0, -44), r: 4, label: 'E — approach the hooded figures', async run(R) {
        await S.talk(R.named.amarantha, async () => {
          await say('Amarantha', 'Three daggers. Three hearts. Some of them may be innocent. Choose quickly; I am bored.');
          await S.ask('', '<i>Your hands shake. There is no right answer here, only the one that ends it.</i>', ['Do it.', 'Do it, and remember every face.']);
          await say('', '<i>It ends. And then the queen breaks her word, as queens do, and the last thing you feel is the floor.</i>', 4000);
          await say('', '<i>Seven High Lords give you a spark each, and you open your eyes in a body that is no longer human.</i>', 4200);
        });
        for (const h of R.hooded) h.rig.root.visible = false;
        S.set('made'); S.set('power');
        await S.say('', '<i>You are Made. Something burns bright in your palms now. Q to let it out.</i>', 3600);
        S.complete('trial3');
      } }],
    },
    // ------------------------------------------------ ACT TWO
    {
      id: 'the_bargain', act: 2, title: 'The bargain comes due', region: 'spring_manor', place: 'steps', travel: 'Months pass in Spring. You do not paint. The bargain on your arm itches.',
      objective: 'A wedding on the manor steps. Walk up to it.',
      acts: [{ region: 'spring_manor', at: (R) => R.marks.manor_steps, r: 5, label: 'E — walk up the aisle', async run(R) {
        await S.talk(R.named.tamlin, async () => {
          await say('', '<i>Roses everywhere. Your heart beats against the dress like something caged. Halfway up the aisle, you cannot breathe.</i>', 4000);
          await say('', '<i>Then darkness, and a voice you know, bored and amused.</i>', 2400);
          await say('Rhysand', 'A week a month, Feyre. You remember. I thought now was as good a time as any.');
        });
        S.set('act2'); S.set('winnow');
        S.complete('the_bargain');
      } }],
    },
    {
      id: 'velaris', act: 2, title: 'The city of starlight', region: 'velaris', place: 'house', travel: true,
      objective: 'The House of Wind. Walk down the ten thousand steps into the city. Find the painted steps of the Rainbow.',
      start(R) {
        S.when(() => ctx.player.pos.distanceTo(R.marks.rainbow_steps) < 8, async () => {
          await S.talk(R.named.rhysand, async () => {
            await say('', '<i>Lit windows on both banks, the river full of them. Nobody is hiding. Nobody is afraid.</i>', 3600);
            await say('Rhysand', 'Velaris. Five thousand years we\'ve kept it off every map. Now you know where it is, and so you know what I have to lose.');
          });
          S.complete('velaris');
        });
        R.named.rhysand.pos.set(-55, 0, 22);
      },
    },
    {
      id: 'weaver', act: 2, title: 'The Weaver in the wood', region: 'the_middle', place: 'path', travel: true,
      objective: 'Take the gold ring from the Weaver\'s cottage. Do not run. Do not make a sound. Do not let her touch you.',
      start(R) {
        ctx.jobs.stealth.begin(R, async (ok) => {
          if (ok) {
            await S.talk(null, async () => { await say('', '<i>Out. The trees close behind you and the ring is cold in your fist.</i>', 3000); });
            S.complete('weaver');
          }
        });
      },
    },
    {
      id: 'suriel', act: 2, title: 'The Suriel', region: 'the_middle', place: 'clearing',
      objective: 'Set the snare in the stone circle, then wait. The Suriel answers the questions of whoever catches it.',
      acts: [{ region: 'the_middle', at: (R) => R.snare, label: 'E — set the snare and wait', async run(R) {
        await S.talk(R.named.suriel, async () => {
          await say('', '<i>It comes out of the dark between the stones: robes like old bark, too many fingers, a lipless mouth.</i>', 3600);
          await say('The Suriel', 'Feyre Archeron. Ask, and I will answer what I may. Then let me go.');
          const qs = ['What am I now?', 'What does the king across the sea want?', 'Who can I trust?'];
          const answers = ['A thing made of seven fires. Learn each one, or burn.', 'A book. Two halves. One with the mortal queens, one with the walls of the world.', 'The ones who show you their own fear first. And the high lord who never lied to you.'];
          for (let k = 0; k < 2; k++) {
            const c = await S.ask('The Suriel', k === 0 ? 'Ask.' : 'Another, then go.', qs);
            await say('The Suriel', answers[c]);
          }
          await say('', '<i>You cut the snare. Walking back, your shoulders ache, and then something unfolds from them. Wings. F to open them.</i>', 4200);
        });
        S.set('wings'); S.set('suriel_done');
        S.complete('suriel');
      } }],
    },
    {
      id: 'keir', act: 2, title: "Keir's throne room", region: 'hewn_city', place: 'gate', travel: true,
      objective: 'The Hewn City. Walk down to Keir\'s throne room. You may refuse him anything you like; it will cost you.',
      acts: [{ region: 'hewn_city', at: (R) => R.places.throne.pos, r: 6, label: 'E — stand before the Steward', async run(R) {
        await S.talk(R.named.keir, async () => {
          await say('Keir', 'The High Lord\'s new pet. Kneel, girl, and I might remember your name.');
          const c = await S.ask('Keir', 'Kneel.', ['No.', 'Kneel, and smile while I do it.', 'Look at the High Lord, not at him.']);
          if (c === 0) { ctx.state.addHeat(10); await say('Keir', 'Then stand. Stand until your legs give out. My court has a long memory.'); }
          else if (c === 1) { ctx.state.addHeat(-5); await say('Keir', 'Better. You learn faster than the last one.'); }
          else { ctx.state.addHeat(4); await say('', '<i>Rhysand says nothing at all. The silence is worse for Keir than any word.</i>', 3200); }
        });
        S.set('solstice'); ctx.regions.velaris?.setSolstice?.(true);
        await S.say('', '<i>The year turns. In Velaris, it\'s Solstice week: lanterns on every quay and five gifts to carry.</i>', 4200);
        S.complete('keir');
      } }],
    },
    {
      id: 'queens', act: 2, title: 'The mortal queens', region: 'mortal_village', place: 'estate', travel: true,
      objective: 'Your sisters\' estate by the sea road. The mortal queens have come. Go inside and make them listen.',
      start(R) {
        if (S._queens) return; S._queens = true;
        R.queens = [];
        for (let k = 0; k < 5; k++) R.queens.push(...[ctx.jobs.spawnPerson(R, 'queen', 30 + k * 4, 112, 0)]);
      },
      acts: [{ region: 'mortal_village', at: (R) => R.marks.family_estate, r: 5, label: 'E — go in to the queens', async run(R) {
        await S.talk(R.queens?.[2] ?? R.named.nesta, async () => {
          await say('The eldest queen', 'Faeries in our drawing room, asking us to trust them. You understand how that sounds.');
          const c = await S.ask('The eldest queen', 'Give us one reason.', ['Because the king across the sea is coming for you first.', 'Because I was one of you, and I still am.', 'Because if you don\'t, I will take your half of the book by force.']);
          await say('The youngest queen', ['We will consider it. Do not mistake that for agreement.', 'Prettily said. Not one of us believes it.', 'Then we understand each other perfectly. Good day.'][c]);
          await say('Nesta', 'They will sell us the moment it suits them. Write that down somewhere.');
        });
        S.set('act3');
        S.complete('queens');
      } }],
    },
    // ------------------------------------------------ ACT THREE
    {
      id: 'spy', act: 3, title: 'Spy in Spring', region: 'spring_manor', place: 'garden', travel: 'Back to Spring, wearing the face they expect. Every smile is a lie you have to remember.',
      objective: 'Learn what Hybern\'s envoys want without being caught. Speak with Lucien, Alis and Tamlin; say little.',
      start() { S._secrets = S._secrets ?? new Set(); },
      acts: ['lucien', 'alis', 'tamlin'].map((who) => ({
        region: 'spring_manor', at: (R) => R.named[who].pos, label: `E — speak with ${who[0].toUpperCase() + who.slice(1)}`,
        when: () => !S._secrets?.has(who),
        async run(R) {
          const lines = {
            lucien: ['Lucien', 'The envoys from across the sea walk the halls like they own them. They ask about the Wall more than they ask about wine.'],
            alis: ['Alis', 'They had me count the stores twice. Enough grain for an army, my lady. Not ours.'],
            tamlin: ['Tamlin', 'An alliance. That\'s all. They will help us get back what was taken. Don\'t look at me like that.'],
          }[who];
          await S.talk(R.named[who], async () => {
            await say(lines[0], lines[1]);
            const c = await S.ask(lines[0], 'You\'ve been quiet since you came home.', ['Tired. That\'s all.', 'Tell me more about the envoys.']);
            if (c === 1) { ctx.state.addHeat(0); await say(lines[0], 'Since when do you care about envoys?'); S._suspicion = (S._suspicion ?? 0) + 1; }
          });
          S._secrets.add(who);
          if (S._secrets.size === 3) {
            await S.say('', S._suspicion > 1 ? '<i>You learned enough, but they watch you now. Leave before they decide to stop pretending.</i>' : '<i>Grain, ships, the Wall. You have what you came for. Nobody suspects a thing.</i>', 3800);
            S.complete('spy');
          }
        },
      })),
    },
    {
      id: 'high_lords', act: 3, title: 'The High Lords', region: 'velaris', place: 'townhouse', travel: 'Home. The war table is covered in maps.',
      objective: 'Visit each High Lord in their own court: Summer, Autumn, Winter, Dawn, Day. Do the work on their land first; an audience alone earns nothing. Travel from the painted map (M).',
      start() { if (S.audiences.size >= 5) S.complete('high_lords'); },
    },
    {
      id: 'war_table', act: 3, title: 'The war table', region: 'velaris', place: 'townhouse',
      objective: 'Go to the townhouse and stand at the war table. See who will march.',
      acts: [{ region: 'velaris', at: (R) => R.marks.townhouse, r: 3, label: 'E — stand at the war table', async run(R) {
        const table = ctx.state.warTable();
        const marching = table.filter((r) => r.marches);
        await S.talk(R.named.rhysand, async () => {
          await say('', `<i>Wooden counters on the painted map. ${marching.length} of seven courts have sent banners.</i>`, 3400);
          for (const r of table) if (!r.marches) await say('', `<i>The ${COURT_NAMES[r.court]}: an empty space on the map. You did not earn them.</i>`, 2400);
          await say('Rhysand', marching.length >= 6 ? 'Enough. Maybe more than enough. We hold the line.' : marching.length >= 4 ? 'It will cost us. But we can hold.' : 'This isn\'t an army. It\'s a gesture. We\'ll make it anyway.');
          await say('', '<i>The war comes. The rest of that story is told in another book. Velaris stays open; Nesta\'s story begins at the House of Wind.</i>', 4600);
        });
        S.set('done'); S.set('solstice'); ctx.regions.velaris?.setSolstice?.(true);
        S.complete('war_table');
      } }],
    },
  ];
}

// ==================================================================== Nesta's campaign
function nestaBeats(S) {
  const ctx = S.ctx;
  const say = (w, l, ms) => S.say(w, l, ms);
  return [
    {
      id: 'house', act: 'N', title: 'The House of Wind', region: 'velaris', place: 'house',
      objective: 'They brought you here so you would stop drinking. The only way down is ten thousand steps. Walk to the bottom of the stair.',
      start(R) {
        S.when(() => ctx.player.pos.distanceTo(R.marks.stair_foot) < 6, async () => {
          await S.talk(null, async () => {
            await say('', '<i>Every one of them. Your legs shake. You hate it, and for the first time in months you are not thinking about anything else.</i>', 3800);
          });
          S.complete('house');
        });
      },
    },
    {
      id: 'ring', act: 'N', title: 'The training ring', region: 'velaris', place: 'ring', travel: 'Back up. Cassian is waiting at the ring, insufferably cheerful.',
      objective: 'Spar with Cassian in the ring. Land five clean blows.',
      start(R) {
        if (!S._spar) { S._spar = true; ctx.combat.spawn(R, 'spar', R.named.cassian.pos.clone(), { tag: 'spar', hp: 5, body: R.named.cassian }); }
        S.when(() => ctx.combat.dead('spar'), async () => {
          await S.talk(R.named.cassian, async () => { await say('Cassian', 'Five. Don\'t smile, you\'ll crack something. Again tomorrow.'); });
          S.complete('ring');
        });
      },
    },
    {
      id: 'emerie', act: 'N', title: "Emerie's shop", region: 'windhaven', place: 'shop', travel: true,
      objective: 'Help Emerie in her shop in Windhaven. Serve three customers who would rather not be served by a woman.',
      acts: [{ region: 'windhaven', at: (R) => R.shopCounter, label: 'E — take a turn at the counter', async run(R) {
        await S.talk(R.named.emerie, async () => {
          await say('Emerie', 'They come in, look at my wings, and talk to the shelf behind me. You take the next one.');
          const lines = [['A warrior', 'Who runs this place?'], ['An old male', 'I\'ll wait for her husband.'], ['A young male', 'How much for the good rope?']];
          for (const [w, l] of lines) {
            await say(w, l);
            await S.ask('', '<i>Your answer:</i>', ['She does. Buy something or leave.', 'Ten silver. Same as yesterday. Same as tomorrow.']);
          }
          await say('Emerie', 'Three sales before noon. Come Thursday. Bring that face.');
        });
        S.complete('emerie');
      } }],
    },
    {
      id: 'blood_rite', act: 'N', title: 'The Blood Rite', region: 'windhaven', place: 'ramiel', travel: 'The Blood Rite. Seven days, one mountain, and every male who wants to prove something.',
      objective: 'Reach the cairn on Ramiel\'s summit. Keep Emerie and Gwyn alive. Fight only when they make you.',
      start(R) {
        if (!S._rite) { S._rite = true; for (const [dx, dz] of [[-12, -30], [14, -50], [-6, -75], [10, -95]]) ctx.combat.spawn(R, 'illyrian', R.ramiel.foot.clone().add(v3(dx, 0, dz)), { tag: 'rite', hp: 4 }); }
        S.when(() => ctx.player.pos.distanceTo(R.ramiel.summit) < 6, async () => {
          await S.talk(R.named.emerie, async () => {
            await say('', '<i>The cairn. The wind up here sounds like a crowd cheering for somebody else. You let it.</i>', 3600);
            await say('Emerie', 'We did it. The three of us. Nobody gets to say we didn\'t.');
          });
          S.complete('blood_rite');
        });
      },
    },
  ];
}

// ==================================================================== High Lords & favors (Act 3)
const AUDIENCES = [
  { court: 'summer', region: 'adriata', lord: 'tarquin', name: 'Tarquin', open: ['You mended my people\'s nets. Or you didn\'t. Either way, I hear about it.'], question: 'Why should Summer bleed for the Night Court?', good: 'Because the nets on your quay held through the storm, and I tied some of them.', weak: 'Because the war is coming either way.', earned: (s) => s.completed.has('adriata_nets'), yes: 'Then Summer will remember the nets.', no: 'Words. Come back with something my people can touch.' },
  { court: 'autumn', region: 'autumn_forest', lord: 'beron', name: 'Beron', open: ['A Night Court envoy in my hall. Brave or stupid.'], question: 'What has the Night Court ever done for the Forest Court?', good: 'Your riders\' hounds and your healer\'s herbs. Ask them who found them.', weak: 'Nothing yet. That can change.', earned: (s) => s.trust.autumn >= 1, yes: 'Hmph. My sons will hear of it. That is not a promise.', no: 'Then nothing is what you will get.' },
  { court: 'winter', region: 'winter_glasshouse', lord: 'kallias', name: 'Kallias', open: ['Viviane says you have been helping in the glasshouse. I wanted to see for myself.'], question: 'Winter lost children to the last war. What would you have me risk?', good: 'Only what you can see we risked first. Ask the gardeners and the sledge-masters.', weak: 'Everything. As we all will.', earned: (s) => s.trust.winter >= 1, yes: 'Then we will stand beside you in the snow.', no: 'Not enough. Not yet.' },
  { court: 'dawn', region: 'dawn_infirmary', lord: 'thesan', name: 'Thesan', open: ['My healers tell me a stranger with paint on her hands sat up with the fever beds.'], question: 'Dawn does not make war. Why should I start now?', good: 'You won\'t be making war. You\'ll be keeping the beds full of the living.', weak: 'Because there won\'t be a Dawn Court if you don\'t.', earned: (s) => s.trust.dawn >= 1, yes: 'Then Dawn will march, and mend behind the line.', no: 'Fear is a poor reason to fight. Find me a better one.' },
  { court: 'day', region: 'day_library', lord: 'helion', name: 'Helion', open: ['My librarians say the east wing is in order for the first time in a century. By hand. Was that you?'], question: 'Day keeps knowledge, not soldiers. What do you want from it?', good: 'Your soldiers, and your librarians\' patience. I\'ve seen what both can do.', weak: 'Whatever you can spare.', earned: (s) => s.completed.has('day_reshelve'), yes: 'Then you shall have both. Try not to get the books bloody.', no: 'I can spare a polite letter. Will that do?' },
];

const FAVORS = [
  { id: 'summer_rope', court: 'summer', region: 'adriata', title: 'Rope for the harbourmaster', giver: 'netmender', who: 'Net-mender', label: 'ask the net-mender what else needs doing', ask: ['The harbourmaster on the end of the middle pier is out of tarred rope. Take him this coil?'], deliver: () => v3(10, 1.6, 30), deliverLabel: 'hand the harbourmaster the rope', done: 'The harbourmaster takes the coil without a word and starts lashing a mast.', thanks: 'Word gets around a harbor fast.' },
  { id: 'autumn_hound', court: 'autumn', region: 'autumn_forest', title: 'A lost hound', giverIndex: 2, who: 'A rider', label: 'speak with the rider by the gate', ask: ['One of the lord\'s hounds bolted into the trees west of the keep. If he finds out, it\'s my hide.'], deliver: () => v3(-60, 0, -20), deliverLabel: 'whistle the hound out of the bracken', done: 'A copper-coloured hound comes out of the bracken, sheepish and burr-covered.', thanks: 'The rider looks at you differently after that.' },
  { id: 'autumn_herbs', court: 'autumn', region: 'autumn_forest', title: 'Herbs for the healer', giverIndex: 5, who: 'A healer', label: 'ask the healer if she needs a hand', ask: ['Bitterroot grows by the stream to the east. My knees won\'t take the bank anymore.'], deliver: () => v3(70, 0, 10), deliverLabel: 'dig up the bitterroot', done: 'You come back muddy to the elbow with a bundle of bitterroot.', thanks: 'The healer sends word of it up to the keep.' },
  { id: 'winter_sledge', court: 'winter', region: 'winter_glasshouse', title: 'A sledge in the drift', giverIndex: 3, who: 'A sledge-master', label: 'ask the sledge-master about the stuck sledge', ask: ['Supply sledge sank in a drift north of the glasshouse. Help me dig?'], deliver: () => v3(-20, 0, 70), deliverLabel: 'dig out the sledge', done: 'Your hands are raw and the sledge is free.', thanks: 'The sledge-masters tell the court.' },
  { id: 'winter_garden', court: 'winter', region: 'winter_glasshouse', title: 'Frost in the glasshouse', giverIndex: 5, who: 'A gardener', label: 'ask the gardener what is wrong', ask: ['The braziers at the far end went out overnight. Light them before the roses die?'], deliver: () => v3(0, 0, -26), deliverLabel: 'relight the far braziers', done: 'The braziers catch. Frost runs off the panes in thin streams.', thanks: 'Viviane hears about it before you are back at the door.' },
  { id: 'dawn_fever', court: 'dawn', region: 'dawn_infirmary', title: 'The fever beds', giverIndex: 1, who: 'A healer', label: 'offer to sit with the fever patients', ask: ['Sit with the beds on the east side till morning? Cool cloths, water, and listen if they talk.'], deliver: () => v3(14, 60, -10), deliverLabel: 'sit with the patients through the night', done: 'The night is long. By morning two fevers have broken.', thanks: 'The healers stop calling you the stranger.' },
  { id: 'day_letters', court: 'day', region: 'day_library', title: 'Letters to the scriptorium', giver: 'librarian', who: 'Under-librarian', label: 'offer to run an errand for the librarian', ask: ['These go to the scriptorium at the far end. Don\'t let anyone \'just borrow\' one on the way.'], deliver: () => v3(0, 0, -80), deliverLabel: 'deliver the letters', done: 'The scriptorium master counts them twice.', thanks: 'Day keeps records. This one goes in yours.' },
  { id: 'spring_alis', court: 'spring', region: 'spring_manor', title: 'Alis\'s nephews', giver: 'alis', who: 'Alis', label: 'ask Alis what she needs', ask: ['My nephews are hiding in the stables again. Bring them in before Tamlin notices.'], deliver: () => v3(-60, 0, 6), deliverLabel: 'call the boys out of the stables', done: 'Two small, bark-skinned boys climb down from the hayloft.', thanks: 'Alis says nothing. She doesn\'t need to.' },
];
