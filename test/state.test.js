import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState, ARMY_TRUST } from '../src/core/state.js';
import { SIDE_JOBS, REGIONS, COURTS } from '../src/core/content.js';

test('side jobs open shops but never add troops on their own', () => {
  const s = new GameState();
  s.completeJob('sunk_pigment');
  assert.ok(s.unlocked.shop.has('rainbow_pigment_seller'));
  assert.equal(s.trust.night, 1);
  assert.equal(s.warTable().find((c) => c.court === 'night').marches, false);
  assert.equal(s.completeJob('sunk_pigment'), false, 'a job only counts once');
});

test('trust moves only for work on that court\'s land', () => {
  const s = new GameState();
  assert.equal(s.recordWork('summer', 'velaris', 'favour done in the wrong place'), false);
  assert.equal(s.trust.summer, 0);
  assert.equal(s.recordWork('summer', 'adriata', 'nets'), true);
  assert.equal(s.trust.summer, 1);
});

test('unearned trust means a missing army at the war table', () => {
  const s = new GameState();
  for (let i = 0; i < ARMY_TRUST; i++) s.recordWork('day', 'day_library', `shelf ${i}`);
  const table = Object.fromEntries(s.warTable().map((r) => [r.court, r.marches]));
  assert.equal(table.day, true);
  assert.equal(table.dawn, false);
  assert.equal(s.warTable().length, 7);
});

test('winnow only to marks already visited', () => {
  const s = new GameState();
  assert.equal(s.canWinnow('palace_thread'), false);
  s.visitMark('palace_thread');
  assert.equal(s.canWinnow('palace_thread'), true);
  assert.throws(() => s.visitMark('hybern_shore'));
});

test('bargains are tracked debts', () => {
  const s = new GameState();
  s.strikeBargain({ id: 'pigment', withWhom: 'painter', owe: 'a portrait', terms: 'one sitting' });
  assert.equal(s.openDebts.length, 1);
  assert.throws(() => s.strikeBargain({ id: 'pigment' }));
  s.settleBargain('pigment');
  assert.equal(s.openDebts.length, 0);
});

test('refusing the throne room is allowed and costs heat', () => {
  const s = new GameState();
  s.declineSummons();
  assert.equal(s.declinedSummons, 1);
  assert.ok(s.heat > 0);
  s.addHeat(500);
  assert.equal(s.heat, 100);
});

test('steppe flight tires faster than city flight; no flight underground', () => {
  const city = new GameState();
  city.region = 'velaris';
  city.takeOff();
  const steppe = new GameState();
  steppe.region = 'windhaven';
  steppe.takeOff();
  for (let i = 0; i < 50; i++) { city.tickFlight(0.1); steppe.tickFlight(0.1); }
  assert.ok(steppe.stamina < city.stamina);
  const hewn = new GameState();
  hewn.region = 'hewn_city';
  assert.equal(hewn.takeOff(), false);
});

test('save/load round-trips', () => {
  const s = new GameState();
  s.completeJob('thread_shakedown');
  s.visitMark('sidra_dock');
  s.strikeBargain({ id: 'b', withWhom: 'x', owe: 'y', terms: 'z' });
  const t = new GameState(JSON.parse(JSON.stringify(s.save())));
  assert.deepEqual(t.save(), s.save());
});

test('content is consistent: every job is in a real region, no Hybern', () => {
  for (const [id, job] of Object.entries(SIDE_JOBS)) assert.ok(REGIONS[job.region], id);
  assert.ok(!Object.keys(REGIONS).some((r) => r.includes('hybern')));
  assert.equal(COURTS.length, 7);
});
