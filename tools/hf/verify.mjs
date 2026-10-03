// Render staged shots in a browser that can reach the Higgsfield CDN and report what loaded.
// usage (Higgsfield sandbox): node tools/hf/verify.mjs <outdir> shot [shot ...]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [out, ...shots] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5190, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const cdn = { ok: 0, fail: [] };
  page.on('response', (r) => { if (/cloudfront\.net/.test(r.url())) { if (r.ok()) cdn.ok++; else cdn.fail.push(`${r.status()} ${r.url().slice(-48)}`); } });
  page.on('requestfailed', (r) => { if (/cloudfront\.net/.test(r.url())) cdn.fail.push(`${r.failure()?.errorText} ${r.url().slice(-48)}`); });
  page.on('pageerror', (e) => console.log(`[${shot}] error`, e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:5190/?shot=${shot}&w=1280&h=720&warm=40`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ready === true || window.__failed, null, { timeout: 900000 });
  await page.waitForTimeout(3000); // models stream in after the first frames
  const info = await page.evaluate(() => {
    const g = window.__game; let skinned = 0, authored = 0;
    g.ctx.scene.traverse((o) => { if (o.isSkinnedMesh) { skinned++; if (o.material?.map?.image && !o.material.onBeforeCompile?.toString().includes('courtBody')) authored++; } });
    return { playerAuthored: g.ctx.feyre.body.visible === false, skinned, authoredMeshes: authored, failed: window.__failed ?? null };
  });
  await page.screenshot({ path: `${out}/${shot.replace(/[:]/g, '_')}.png` });
  console.log(JSON.stringify({ shot, secs: Math.round((Date.now() - t0) / 1000), cdnOk: cdn.ok, cdnFail: cdn.fail.slice(0, 5), ...info }));
  await page.close();
}
await browser.close();
await server.close();
