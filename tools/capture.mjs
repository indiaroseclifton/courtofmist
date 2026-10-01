// Render staged gameplay frames from the built game in headless Chromium.
// usage: npm run build && node tools/capture.mjs [shot ...] [--w 2560 --h 1440]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const w = opt('--w', '2560'), h = opt('--h', '1440'), out = opt('--out', 'docs/shots'), warm = opt('--warm', '90');
const shots = args.length ? args : ['market', 'boat', 'stairs', 'summons', 'table', 'slips'];
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5199, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, ignoreHTTPSErrors: true });
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${shot}]`, m.text()); });
  page.on('pageerror', (e) => console.error(`[${shot}]`, e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:5199/?shot=${shot}&w=${w}&h=${h}&warm=${warm}`, { waitUntil: 'commit', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(800); // fonts and DOM transitions
  await page.screenshot({ path: `${out}/${shot}.png`, timeout: 300000 });
  console.log(`${shot}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.close();
}
await browser.close();
await server.close();
