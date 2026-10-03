// Load every region headlessly, report script errors, and save a small frame of each.
// usage: node tools/smoke.mjs [region ...] [--out dir] [--w 640 --h 360]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const out = opt('--out', 'smoke'), w = opt('--w', '640'), h = opt('--h', '360'), warm = opt('--warm', '6');
const ALL = ['velaris', 'mortal_village', 'spring_manor', 'under_mountain', 'hewn_city', 'windhaven', 'adriata', 'autumn_forest', 'winter_glasshouse', 'dawn_infirmary', 'day_library', 'the_middle'];
const targets = args.length ? args : ALL;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5196, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = 0;
for (const id of targets) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, ignoreHTTPSErrors: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  const t0 = Date.now();
  const shot = id.includes(':') || ['market', 'table', 'journal', 'slips', 'boat', 'summons', 'stairs'].includes(id) ? id : `region:${id}`;
  try {
    await page.goto(`http://localhost:5196/?shot=${shot}&w=${w}&h=${h}&warm=${warm}`, { waitUntil: 'commit', timeout: 600000 });
    await page.waitForFunction(() => window.__ready === true || window.__failed, null, { timeout: 600000 });
    await page.screenshot({ path: `${out}/${id.replace(':', '_')}.png`, timeout: 300000 });
  } catch (e) { errs.push(String(e.message).split('\n')[0]); }
  console.log(`${errs.length ? 'FAIL' : 'ok  '} ${id} ${((Date.now() - t0) / 1000).toFixed(0)}s${errs.length ? '\n     ' + errs.slice(0, 4).join('\n     ') : ''}`);
  if (errs.length) failed++;
  await page.close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
