// Diegetic interface: subtitles, paper slips, a painted map on a table. No bars, no arrows.
import { COURT_NAMES, WINNOW_MARKS, REGIONS } from '../core/content.js';
import { ARMY_TRUST } from '../core/state.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.sub = $('subtitle');
    this.promptEl = $('prompt');
    this.slipsEl = $('slips');
    this.tableEl = $('table');
    this.mapEl = $('map');
    this.ledgerEl = $('ledger');
    this.fadeEl = $('fade');
    this.journalEl = $('journal');
    this.wardEl = $('ward');
    this.regionSpots = [];
    this.ctx = null;
    this.choiceResolve = null;
    this.lineTimer = null;
    this.mapMarks = [];
    this.onWinnow = null;
    this.mapEl.addEventListener('click', (e) => this.mapClick(e));
    window.addEventListener('keydown', (e) => {
      if (!this.choiceResolve) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.choiceCount) {
        const r = this.choiceResolve; this.choiceResolve = null;
        r(n - 1);
      }
    });
  }

  get overlayOpen() { return !this.slipsEl.hidden || !this.tableEl.hidden || !this.journalEl.hidden || !this.wardEl.hidden; }

  closeAll() { this.slipsEl.hidden = true; this.tableEl.hidden = true; this.journalEl.hidden = true; }

  // ---------------- the journal: Feyre's own hand ----------------
  toggleJournal(story, force) {
    const show = force ?? this.journalEl.hidden;
    this.closeAll();
    this.journalEl.hidden = !show;
    if (show) this.journalEl.innerHTML = `<div class="page">${story.journal()}</div>`;
  }

  // ---------------- copying a ward: trace the line in one steady stroke ----------------
  wardGame() {
    return new Promise((resolve) => {
      const el = this.wardEl;
      el.hidden = false;
      document.exitPointerLock?.();
      el.innerHTML = '<div class="sheet"><canvas width="900" height="600"></canvas><p>Hold the mouse button and trace the grey line in one stroke. Stray too far and the ink smudges.</p></div>';
      const cv = el.querySelector('canvas');
      const g = cv.getContext('2d');
      // the ward: a spiral knot of seven turns, drawn as a polyline
      const pts = [];
      for (let i = 0; i <= 420; i++) {
        const t = i / 420, a = t * Math.PI * 6.2;
        const r = 60 + t * 190 + Math.sin(a * 3) * 18;
        pts.push([450 + Math.cos(a) * r, 300 + Math.sin(a) * r * 0.85]);
      }
      const hit = new Array(pts.length).fill(false);
      const draw = () => {
        g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 900, 600);
        g.strokeStyle = 'rgba(80,60,40,.25)'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      };
      draw();
      let down = false, last = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 900 / r.width, (e.clientY - r.top) * 600 / r.height]; };
      const end = (ok) => { el.hidden = true; el.innerHTML = ''; resolve(ok); };
      cv.onmousedown = (e) => { down = true; last = pos(e); };
      cv.onmousemove = (e) => {
        if (!down) return;
        const p = pos(e);
        let best = 1e9, bi = -1;
        pts.forEach(([x, y], i) => { const d = Math.hypot(x - p[0], y - p[1]); if (d < best) { best = d; bi = i; } });
        g.strokeStyle = best < 16 ? '#1d1712' : '#5a1a10'; g.lineWidth = best < 16 ? 3 : 9;
        g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke();
        last = p;
        if (best > 26) { down = false; setTimeout(() => end(false), 700); return; } // a smudge
        for (let k = Math.max(0, bi - 3); k <= Math.min(pts.length - 1, bi + 3); k++) hit[k] = true;
      };
      cv.onmouseup = () => {
        if (!down) return;
        down = false;
        const cover = hit.filter(Boolean).length / hit.length;
        end(cover > 0.85);
      };
    });
  }

  // A single spoken line. Resolves after a reading-speed delay.
  say(who, text, ms) {
    clearTimeout(this.lineTimer);
    this.sub.innerHTML = `${who ? `<span class="who">${who}</span>` : ''}${text}`;
    this.sub.classList.add('on');
    const dur = ms ?? Math.max(2200, text.length * 55);
    return new Promise((res) => { this.lineTimer = setTimeout(() => { res(); }, dur); });
  }

  clearSay() { this.sub.classList.remove('on'); }

  // A line followed by numbered replies. Resolves with the chosen index.
  ask(who, text, options) {
    clearTimeout(this.lineTimer);
    this.choiceCount = options.length;
    this.sub.innerHTML = `${who ? `<span class="who">${who}</span>` : ''}${text}<ol>${options
      .map((o, i) => `<li><span class="n">${i + 1}</span>${o}</li>`).join('')}</ol>`;
    this.sub.classList.add('on');
    return new Promise((res) => { this.choiceResolve = (i) => { this.clearSay(); res(i); }; });
  }

  prompt(text) {
    if (text) { this.promptEl.textContent = text; this.promptEl.classList.add('on'); }
    else this.promptEl.classList.remove('on');
  }

  fade(on) { this.fadeEl.classList.toggle('on', on); return new Promise((r) => setTimeout(r, 520)); }

  // ---------------- bargain slips ----------------
  toggleSlips(state, force) {
    const show = force ?? this.slipsEl.hidden;
    this.tableEl.hidden = true;
    this.slipsEl.hidden = !show;
    if (!show) return;
    const b = state.bargains;
    this.slipsEl.innerHTML = b.length
      ? b.map((x) => `
        <div class="slip ${x.settled ? 'settled' : ''}">
          <div class="to">${x.owe.startsWith('You') ? 'struck with' : 'owed by'} ${x.withWhom}</div>
          <div class="body">${x.terms}</div>
          <span class="seal">${x.settled ? 'paid' : x.owe}</span>
        </div>`).join('')
      : '<div class="slip empty">No bargains. Keep it that way, if you can.</div>';
  }

  // ---------------- the war table ----------------
  toggleTable(state, force, ctx) {
    if (ctx) this.ctx = ctx;
    const show = force ?? this.tableEl.hidden;
    this.slipsEl.hidden = true; this.journalEl.hidden = true;
    this.tableEl.hidden = !show;
    if (!show) return;
    this.paintMap(state);
    this.writeLedger(state);
    // the hand on the map is a webfont: repaint once it has arrived
    document.fonts?.load('26px "Homemade Apple"').then(() => { if (!this.tableEl.hidden) this.paintMap(state); }).catch(() => {});
  }

  writeLedger(state) {
    const heatWords = ['barely notice you', 'have your name', 'watch the townhouse', 'follow you at night', 'have a price on your silence'];
    const hw = heatWords[Math.min(heatWords.length - 1, Math.floor(state.heat / 20))];
    const rows = state.warTable().map((r) => `
      <div class="court"><span>${COURT_NAMES[r.court]}</span>
      <span class="notch ${r.marches ? '' : 'absent'}">${'|'.repeat(r.trust) || '—'} ${r.marches ? 'marches' : 'absent'}</span></div>`).join('');
    const social = Object.entries(state.social).map(([k, v]) => `<div class="court"><span>${k.replace(/_/g, ' ')}</span><span>${v > 2 ? 'warm' : v > 0 ? 'civil' : v < 0 ? 'cold' : 'unknown'}</span></div>`).join('')
      || '<div><i>No one in the markets knows you yet.</i></div>';
    this.ledgerEl.innerHTML = `
      <h3>Armies</h3>${rows}
      <div style="font-size:11px;opacity:.7">a court marches at ${ARMY_TRUST} marks, earned on its own land</div>
      <hr/><h3>The Hewn City</h3><div>Keir's people ${hw}.</div>
      <hr/><h3>Velaris</h3>${social}
      <hr/><div>${state.openDebts.length} open bargain${state.openDebts.length === 1 ? '' : 's'}</div>`;
  }

  paintMap(state) {
    const c = this.mapEl.getContext('2d');
    const W = this.mapEl.width, H = this.mapEl.height;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // the sea: layered washes
    c.fillStyle = '#2c3e44'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(${40 + r() * 30},${60 + r() * 30},${66 + r() * 30},0.08)`;
      c.beginPath(); c.ellipse(r() * W, r() * H, 40 + r() * 120, 6 + r() * 18, r() * 0.4 - 0.2, 0, Math.PI * 2); c.fill();
    }
    // Prythian, a long island lying north to south (north is up)
    const isle = [[560, 70], [720, 50], [880, 90], [1010, 120], [1080, 210], [1060, 330], [1120, 420], [1090, 520], [1040, 600], [1060, 700],
      [990, 790], [900, 880], [760, 940], [600, 930], [500, 860], [440, 760], [470, 650], [420, 540], [450, 430], [400, 320], [450, 200], [500, 120]];
    const path = () => { c.beginPath(); isle.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
    c.save(); path(); c.clip();
    c.fillStyle = '#cdbb93'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(${150 + r() * 60},${120 + r() * 50},${70 + r() * 40},0.05)`;
      c.beginPath(); c.arc(r() * W, r() * H, 10 + r() * 60, 0, Math.PI * 2); c.fill();
    }
    // court washes
    const courts = {
      night: [[760, 200], '#3a3f6a'], winter: [[980, 300], '#9fb6c6'], day: [[900, 450], '#d6b25a'],
      dawn: [[1010, 560], '#d48a74'], autumn: [[520, 520], '#a4532c'], summer: [[560, 760], '#3f8a8c'], spring: [[820, 760], '#7aa25a'],
    };
    for (const [court, [[x, y], col]] of Object.entries(courts)) {
      for (let i = 0; i < 40; i++) {
        c.fillStyle = col + '14';
        c.beginPath(); c.ellipse(x + (r() - 0.5) * 120, y + (r() - 0.5) * 90, 70 + r() * 70, 50 + r() * 50, r(), 0, Math.PI * 2); c.fill();
      }
      c.font = '26px "Homemade Apple", cursive'; c.fillStyle = 'rgba(40,28,18,.85)';
      c.fillText(COURT_NAMES[court], x - 70, y);
      // trust tokens: notches carved in a wooden counter; a banner only if the army marches
      const t = state.trust[court];
      c.fillStyle = '#5a3b22'; c.fillRect(x - 70, y + 14, 90, 22);
      c.strokeStyle = '#e8d5b0'; c.lineWidth = 2;
      for (let k = 0; k < t; k++) { c.beginPath(); c.moveTo(x - 62 + k * 9, y + 18); c.lineTo(x - 62 + k * 9, y + 32); c.stroke(); }
      if (t >= ARMY_TRUST) { c.fillStyle = '#7a1e18'; c.beginPath(); c.moveTo(x + 30, y + 36); c.lineTo(x + 30, y - 10); c.lineTo(x + 58, y + 2); c.lineTo(x + 30, y + 12); c.fill(); }
    }
    // mountains: ink chevrons, densest around the Middle
    c.strokeStyle = 'rgba(50,36,24,.7)'; c.lineWidth = 1.6;
    for (let i = 0; i < 140; i++) {
      const x = 640 + (r() - 0.5) * 300, y = 420 + (r() - 0.5) * 220, s = 8 + r() * 10;
      c.beginPath(); c.moveTo(x - s, y + s * 0.6); c.lineTo(x, y - s * 0.6); c.lineTo(x + s, y + s * 0.6); c.stroke();
    }
    c.font = '20px "Homemade Apple", cursive'; c.fillStyle = 'rgba(40,28,18,.75)'; c.fillText('the Middle', 600, 420);
    // the Wall: faint, broken, across the south
    c.setLineDash([6, 10]); c.strokeStyle = 'rgba(240,240,255,.7)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(380, 860); c.bezierCurveTo(600, 840, 820, 880, 1100, 850); c.stroke(); c.setLineDash([]);
    c.restore();
    c.fillStyle = 'rgba(40,28,18,.7)'; c.font = '18px "Homemade Apple", cursive'; c.fillText('the Wall', 860, 900);
    c.fillText('mortal lands', 540, 960);
    // coastline in ink, gone over twice
    c.strokeStyle = 'rgba(30,22,14,.85)';
    for (let pass = 0; pass < 2; pass++) {
      c.lineWidth = 2.4 - pass;
      c.beginPath();
      isle.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 4, jy = y + (r() - 0.5) * 4; i ? c.lineTo(jx, jy) : c.moveTo(jx, jy); });
      c.closePath(); c.stroke();
    }
    c.fillStyle = 'rgba(230,220,200,.7)'; c.font = 'italic 24px "Cormorant Garamond", serif';
    c.fillText('to Hybern, across the sea — not ours to walk', 30, 560);

    // Velaris inset with winnow marks: pins only where you have stood
    const ix = 1180, iy = 60, iw = 380, ih = 300;
    c.fillStyle = '#d9c9a2'; c.fillRect(ix, iy, iw, ih);
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.strokeRect(ix, iy, iw, ih);
    c.fillStyle = '#41606a'; c.fillRect(ix, iy + 150, iw, 30); // the Sidra
    c.font = '20px "Homemade Apple", cursive'; c.fillStyle = '#2a1d12'; c.fillText('Velaris', ix + 14, iy + 30);
    const inset = {
      rainbow_steps: [ix + 90, iy + 205], palace_thread: [ix + 290, iy + 215], sidra_dock: [ix + 150, iy + 192],
      stair_foot: [ix + 190, iy + 90], townhouse: [ix + 120, iy + 125], house_of_wind: [ix + 200, iy + 50],
    };
    this.mapMarks = [];
    for (const [id, [x, y]] of Object.entries(inset)) {
      const seen = state.canWinnow(id);
      c.beginPath(); c.arc(x, y, seen ? 9 : 7, 0, Math.PI * 2);
      if (seen) { c.fillStyle = '#8a1c14'; c.fill(); c.strokeStyle = '#3a0a06'; c.stroke(); }
      else { c.setLineDash([3, 3]); c.strokeStyle = 'rgba(60,40,20,.6)'; c.stroke(); c.setLineDash([]); }
      c.font = '14px "Homemade Apple", cursive'; c.fillStyle = seen ? '#2a1d12' : 'rgba(42,29,18,.45)';
      c.fillText(WINNOW_MARKS[id].name.split(' — ')[0], x + 12, y + 5);
      this.mapMarks.push({ id, x, y, seen });
    }
    c.font = 'italic 15px "Cormorant Garamond", serif'; c.fillStyle = '#2a1d12';
    c.fillText('red wax: winnow there · ink seal: set out by road', ix + 14, iy + ih - 14);

    // every region you could go: a wax pin if you have stood there, an ink seal if the road is open
    const SPOTS = {
      mortal_village: [640, 905], spring_manor: [830, 805], adriata: [560, 805], autumn_forest: [520, 575],
      the_middle: [610, 515], under_mountain: [680, 465], day_library: [900, 495], dawn_infirmary: [1030, 610],
      winter_glasshouse: [990, 345], windhaven: [690, 120], hewn_city: [800, 245], velaris: [770, 160],
    };
    this.regionSpots = [];
    const story = this.ctx?.story;
    for (const [id, [x, y]] of Object.entries(SPOTS)) {
      const marks = Object.entries(WINNOW_MARKS).filter(([, m]) => m.region === id).map(([k]) => k);
      const pin = marks.find((k) => state.canWinnow(k));
      const open = story ? story.regionOpen(id) : true;
      c.beginPath(); c.arc(x, y, pin ? 11 : 8, 0, Math.PI * 2);
      if (pin && open) { c.fillStyle = '#8a1c14'; c.fill(); c.strokeStyle = '#3a0a06'; c.lineWidth = 2; c.stroke(); }
      else if (open) { c.fillStyle = '#2a1d12'; c.fill(); }
      else { c.setLineDash([3, 3]); c.strokeStyle = 'rgba(40,28,18,.5)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
      c.font = '15px "Homemade Apple", cursive'; c.fillStyle = open ? '#2a1d12' : 'rgba(42,29,18,.45)';
      c.fillText(REGIONS[id].name.replace(/ &.*$/, '').replace(/^The /, ''), x + 14, y + 5);
      this.regionSpots.push({ id, x, y, pin, open });
    }
  }

  mapClick(e) {
    const rect = this.mapEl.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.mapEl.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.mapEl.height;
    for (const m of this.mapMarks) {
      if (Math.hypot(m.x - x, m.y - y) < 28 && m.seen && this.onWinnow) { this.onWinnow(m.id); return; }
    }
    for (const s of this.regionSpots) {
      if (Math.hypot(s.x - x, s.y - y) > 30 || !s.open) continue;
      if (s.pin) this.onWinnow?.(s.pin); else this.onTravel?.(s.id);
      return;
    }
  }
}
