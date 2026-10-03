// Play Feyre's campaign end to end through the real game logic (no rendering), then Nesta's.
// Each step does what a player would: walk to a thing and press E, kill what attacks, stand
// somewhere. Fails loudly on any script error or a beat that will not advance.
// usage: node tools/playtest.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5195, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 180 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5195/?test=1&q=low&w=320&h=180', { waitUntil: 'commit', timeout: 600000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });

// helpers that run inside the page
await page.evaluate(() => {
  const G = window.__game;
  const { ctx } = G;
  window.T = {
    beat: () => ctx.story.beat?.id ?? null,
    region: () => ctx.region.id,
    async frames(n = 30) { for (let i = 0; i < n; i++) G.frame(1 / 30, false); await new Promise((r) => setTimeout(r, 5)); },
    async idle() { for (let i = 0; i < 400 && ctx.busy; i++) await new Promise((r) => setTimeout(r, 10)); },
    async press(part) {
      const it = ctx.region.interactables.find((x) => (!x.enabled || x.enabled()) && x.label().includes(part));
      if (!it) throw new Error(`no "${part}" in ${ctx.region.id} (beat ${T.beat()})`);
      G.player.pos.set(it.pos.x, ctx.region.ground(it.pos.x, it.pos.z) ?? it.pos.y, it.pos.z);
      await it.on();
      await T.idle(); await T.frames(5); await T.idle();
    },
    async killAll(tag) { for (const e of ctx.combat.enemies) if (e.tag === tag && !e.dead) ctx.combat.kill(e); await T.frames(10); await T.idle(); await T.frames(5); },
    async stand(v) { G.player.pos.set(v.x, ctx.region.ground(v.x, v.z) ?? v.y, v.z); await T.frames(10); await T.idle(); await T.frames(5); await T.idle(); },
    async pressAll(part) { // try every matching thing in turn, e.g. gifts that must go in order
      for (const it of ctx.region.interactables.filter((x) => (!x.enabled || x.enabled()) && x.label().includes(part))) {
        if (!it.enabled || it.enabled()) { G.player.pos.set(it.pos.x, ctx.region.ground(it.pos.x, it.pos.z) ?? it.pos.y, it.pos.z); await it.on(); await T.idle(); await T.frames(3); }
      }
    },
    done: (id) => G.state.completed.has(id),
    async go(id, where) { await ctx.travel(id, where, { instant: true }); await T.frames(5); await T.idle(); },
  };
});

const T = (fn, ...a) => page.evaluate(fn, ...a);
// some beats play themselves out the moment they start (a scene, not a task): accept those
const expect = async (id, campaign = 'feyre') => {
  const [b, want, at] = await T(([id, c]) => {
    const S = window.__game.ctx.story;
    return [S.beat?.id ?? null, S.indexOf(id, c), S.i];
  }, [id, campaign]);
  if (b === id) { console.log(`  ✓ ${id}`); return true; }
  if (at > want) { console.log(`  ✓ ${id} (played itself)`); return false; }
  throw new Error(`expected beat ${id}, at ${b}`);
};

const steps = {
  hunt: () => T(() => T.killAll('wolf')),
  home: () => T(() => T.press('go inside')),
  manor: () => T(() => T.press('fox-masked')),
  naga: () => T(() => T.killAll('naga')),
  firenight: () => T(() => T.press('step into the firelight')),
  trial1: () => T(async () => { await T.press('face the queen'); await T.stand(window.__game.ctx.region.maze.exit); }),
  bargain: () => T(() => T.frames(10).then(T.idle)),
  trial2: () => T(() => T.press('crowned heart')),
  trial3: () => T(() => T.press('approach the hooded')),
  the_bargain: () => T(() => T.press('walk up the aisle')),
  velaris: () => T(() => T.stand(window.__game.ctx.region.marks.rainbow_steps)),
  weaver: () => T(async () => {
    const R = window.__game.ctx.region;
    await T.press('lift the ring');
    await T.stand(R.places.path.pos);
  }),
  suriel: () => T(() => T.press('set the snare')),
  keir: () => T(() => T.press('stand before the Steward')),
  queens: () => T(() => T.press('go in to the queens')),
  spy: () => T(async () => { for (const n of ['Lucien', 'Alis', 'Tamlin']) await T.press(`speak with ${n}`); }),
  high_lords: () => T(async () => {
    for (const [id, lord] of [['adriata', 'Tarquin'], ['autumn_forest', 'Beron'], ['winter_glasshouse', 'Kallias'], ['dawn_infirmary', 'Thesan'], ['day_library', 'Helion']]) {
      await T.go(id); await T.press(`audience with ${lord}`);
    }
    await T.frames(5); await T.idle();
  }),
  war_table: () => T(async () => { if (T.region() !== 'velaris') await T.go('velaris'); await T.press('stand at the war table'); }),
};

let ok = true;
try {
  console.log('Feyre');
  for (const id of Object.keys(steps)) {
    if (await expect(id)) await steps[id]();
    await T(() => T.frames(10).then(T.idle));
  }
  const end = await T(() => ({ beat: T.beat(), flags: [...window.__game.ctx.story.flags], bargains: window.__game.state.bargains.length, table: window.__game.state.warTable() }));
  if (end.beat !== null) throw new Error(`campaign did not end: ${end.beat}`);
  console.log(`  campaign complete; flags ${end.flags.join(', ')}; ${end.bargains} bargains; marching: ${end.table.filter((r) => r.marches).map((r) => r.court).join(', ') || 'none'}`);

  console.log('Nesta');
  await T(() => window.__game.ctx.story.startNesta());
  await T(() => T.frames(5).then(T.idle));
  await expect('house', 'nesta');
  await T(() => T.stand(window.__game.ctx.region.marks.stair_foot));
  await expect('ring', 'nesta');
  await T(() => T.killAll('spar'));
  await expect('emerie', 'nesta');
  await T(() => T.press('take a turn at the counter'));
  await expect('blood_rite', 'nesta');
  await T(async () => { await T.killAll('rite'); await T.stand(window.__game.ctx.region.ramiel.summit); });
  const nb = await T(() => T.beat());
  if (nb !== null) throw new Error(`Nesta did not end: ${nb}`);
  console.log('  campaign complete');
  console.log('Side jobs');
  const job = async (id, fn) => { await T(fn); const d = await T((k) => T.done(k), id); if (!d) throw new Error(`job ${id} did not complete`); console.log(`  ✓ ${id}`); };
  await T(() => { window.__game.ctx.playAs('feyre'); window.__game.ctx.story.campaign = 'feyre'; });
  await job('cottage_roof', async () => { await T.go('mortal_village', 'cottage'); await T.press('man by the cottage door'); for (let i = 0; i < 5; i++) { await T.press('take a bundle'); await T.press('lay the bundle'); } });
  await job('clipped_wings', async () => { await T.go('windhaven'); await T.press('quartermaster'); for (let i = 0; i < 9; i++) await T.press('ask her about her wings'); await T.press('quartermaster'); });
  await job('adriata_nets', async () => { await T.go('adriata'); await T.press('speak with the net-mender'); for (let i = 0; i < 15; i++) await T.press('mend this net'); });
  await job('day_reshelve', async () => {
    await T.go('day_library'); await T.press('under-librarian');
    const cats = ['Histories', 'Poetry', 'Maps', 'Law'];
    for (let i = 0; i < 8; i++) { await T.press('take a book'); await T.press(`under ${cats[window.__game.ctx.jobs.carry.what.cat]}`); }
  });
  await job('confession_hour', async () => { await T.go('hewn_city'); await T.press('confession hour'); });
  await job('solstice_gifts', async () => { await T.go('velaris'); await T.press('Solstice gifts'); for (let i = 0; i < 5; i++) await T.pressAll('give a Solstice gift'); });
  await job('rainbow_singer', async () => {
    const G = window.__game;
    await T.go('velaris'); await T.press('speak with the singer');
    await T.go('hewn_city', 'stage');
    for (let i = 0; i < 40 && !G.ctx.busy; i++) await T.frames(10);
    await T.idle();
    await T.stand(G.ctx.region.marks.hewn_gate);
    for (let i = 0; i < 300 && !T.done('rainbow_singer'); i++) await T.frames(10);
  });
  const trust = await T(() => window.__game.state.trust);
  console.log(`  trust after jobs: ${Object.entries(trust).map(([k, v]) => `${k} ${v}`).join(', ')}`);
} catch (e) {
  ok = false;
  console.log(`FAIL: ${e.message.split('\n')[0]}`);
}
if (errors.length) { ok = false; console.log('page errors:\n  ' + errors.slice(0, 8).join('\n  ')); }
await browser.close();
await server.close();
console.log(ok ? 'PLAYTEST PASSED' : 'PLAYTEST FAILED');
process.exit(ok ? 0 : 1);
