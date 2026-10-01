// Game rules. Pure and serialisable, so tests can drive it without a renderer.
import { COURTS, REGIONS, WINNOW_MARKS, SIDE_JOBS } from './content.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Trust a court needs before it marches. Below this, its army is missing from the war table.
export const ARMY_TRUST = 3;

export class GameState {
  constructor(data) {
    this.bargains = [];
    this.heat = 0; // Hewn City: how closely Keir's court is watching you, 0..100
    this.social = {}; // Velaris shopkeepers, -5..5 each
    this.trust = Object.fromEntries(COURTS.map((c) => [c, 0]));
    this.trustLedger = []; // why each point of trust moved
    this.visitedMarks = new Set();
    this.completed = new Set();
    this.unlocked = { shop: new Set(), camp: new Set(), sibling: new Set() };
    this.region = 'velaris';
    this.stamina = 1;
    this.flying = false;
    this.declinedSummons = 0;
    if (data) this.load(data);
  }

  // ---- bargains: tracked debts written on slips ----
  strikeBargain({ id, withWhom, owe, terms }) {
    if (this.bargains.some((b) => b.id === id)) throw new Error(`bargain ${id} already struck`);
    const b = { id, withWhom, owe, terms, settled: false };
    this.bargains.push(b);
    return b;
  }

  settleBargain(id) {
    const b = this.bargains.find((x) => x.id === id);
    if (!b) throw new Error(`no bargain ${id}`);
    b.settled = true;
    return b;
  }

  get openDebts() {
    return this.bargains.filter((b) => !b.settled);
  }

  // ---- tracks ----
  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 100);
    return this.heat;
  }

  // Refusing a summons to Keir's throne room is always allowed. It costs heat, never the game.
  declineSummons() {
    this.declinedSummons += 1;
    return this.addHeat(8);
  }

  addSocial(keeper, n) {
    this.social[keeper] = clamp((this.social[keeper] ?? 0) + n, -5, 5);
    return this.social[keeper];
  }

  // ---- trust: only moves for work done on that court's own land ----
  recordWork(court, region, reason) {
    if (!COURTS.includes(court)) throw new Error(`unknown court ${court}`);
    const r = REGIONS[region];
    if (!r) throw new Error(`unknown region ${region}`);
    if (r.court !== court) return false; // work elsewhere does not count, however kind
    this.trust[court] += 1;
    this.trustLedger.push({ court, region, reason });
    return true;
  }

  // The war table: who actually shows up.
  warTable() {
    return COURTS.map((court) => ({
      court,
      trust: this.trust[court],
      marches: this.trust[court] >= ARMY_TRUST,
    }));
  }

  // ---- winnowing: only to marks you have walked to ----
  visitMark(id) {
    if (!WINNOW_MARKS[id]) throw new Error(`unknown mark ${id}`);
    this.visitedMarks.add(id);
  }

  canWinnow(id) {
    return this.visitedMarks.has(id);
  }

  // ---- wings ----
  // City flights are short and cheap; steppe air is long and tiring. Returns false when you must land.
  tickFlight(dt) {
    const kind = REGIONS[this.region]?.flight ?? 'none';
    if (!this.flying) {
      this.stamina = clamp(this.stamina + dt * 0.12, 0, 1);
      return true;
    }
    if (kind === 'none') {
      this.flying = false;
      return false;
    }
    const drain = kind === 'steppe' ? 0.09 : 0.035;
    this.stamina = clamp(this.stamina - dt * drain, 0, 1);
    if (this.stamina <= 0) this.flying = false;
    return this.flying;
  }

  takeOff() {
    const kind = REGIONS[this.region]?.flight ?? 'none';
    if (kind === 'none' || this.stamina < 0.15) return false;
    this.flying = true;
    return true;
  }

  // ---- side jobs ----
  completeJob(id) {
    const job = SIDE_JOBS[id];
    if (!job) throw new Error(`unknown job ${id}`);
    if (this.completed.has(id)) return false;
    this.completed.add(id);
    for (const [kind, what] of Object.entries(job.unlocks ?? {})) this.unlocked[kind].add(what);
    for (const [keeper, n] of Object.entries(job.social ?? {})) this.addSocial(keeper, n);
    if (job.heat) this.addHeat(job.heat);
    const court = REGIONS[job.region]?.court;
    if (court) this.recordWork(court, job.region, job.title);
    return true;
  }

  // ---- save / load ----
  save() {
    return {
      bargains: this.bargains,
      heat: this.heat,
      social: this.social,
      trust: this.trust,
      trustLedger: this.trustLedger,
      visitedMarks: [...this.visitedMarks],
      completed: [...this.completed],
      unlocked: Object.fromEntries(Object.entries(this.unlocked).map(([k, v]) => [k, [...v]])),
      region: this.region,
      declinedSummons: this.declinedSummons,
    };
  }

  load(d) {
    this.bargains = d.bargains ?? [];
    this.heat = d.heat ?? 0;
    this.social = d.social ?? {};
    this.trust = { ...this.trust, ...d.trust };
    this.trustLedger = d.trustLedger ?? [];
    this.visitedMarks = new Set(d.visitedMarks ?? []);
    this.completed = new Set(d.completed ?? []);
    for (const k of Object.keys(this.unlocked)) this.unlocked[k] = new Set(d.unlocked?.[k] ?? []);
    this.region = d.region ?? 'velaris';
    this.declinedSummons = d.declinedSummons ?? 0;
  }
}
