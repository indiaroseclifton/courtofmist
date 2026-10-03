// Record scripted gameplay clips frame by frame and encode them to MP4.
// Each frame is a fixed 1/30 s step of the real game (input, physics, hair, crowd, camera),
// captured with the DOM so subtitles and paper overlays are in the shot.
// usage: node tools/record.mjs [clip ...] [--w 1280 --h 720 --seconds 10 --out docs/video]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const w = +opt('--w', '1280'), h = +opt('--h', '720'), secs = +opt('--seconds', '10'), out = opt('--out', 'docs/video');
const clips = args.length ? args : ['market', 'boat', 'stairwalk', 'flight', 'summons'];
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5198, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const clip of clips) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
  page.on('pageerror', (e) => console.error(`[${clip}]`, e.message));
  await page.goto(`http://localhost:5198/?record=${clip}&w=${w}&h=${h}`, { waitUntil: 'commit', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  const file = `${out}/${clip}.mp4`;
  rmSync(file, { force: true });
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', file]);
  const t0 = Date.now();
  const frames = Math.round(secs * 30);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => window.__step());
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, timeout: 120000 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`${clip}: frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`${clip}: ${file} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await page.close();
}
await browser.close();
await server.close();
