import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5202, strictPort: true }, plugins: [{
  name: 'capcut-local-fixture', configureServer(vite) {
    vite.middlewares.use('/__capcut-test', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/__capcut-test', '<html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/mobile-fixture.tsx"></script></body></html>'));
    });
  },
}] });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.MOBILE_BROWSER_CHANNEL ? { channel: process.env.MOBILE_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5202/__capcut-test');
  const button = page.getByRole('button', { name: '캡컷 다운로드', exact: true });
  await page.locator('.workspace-tools').waitFor();
  assert.equal(await button.isVisible(), false, 'download panel stays collapsed by default');
  await page.getByText('다운로드·공유 더보기', { exact: true }).click();
  await page.evaluate(() => { delete window.LocalizerNative; window.shareCalls = 0; navigator.share = async () => { window.shareCalls++; }; });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await button.isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  const out = resolve(root, 'release/capcut-check'); await mkdir(out, { recursive: true });
  for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await button.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - innerHeight * 0.6));
    await page.screenshot({ path: resolve(out, name + '.png') });
  }
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'instagram_KR_capcut.zip');
  assert.equal(await download.failure(), null);
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const draft = JSON.parse(await zip.file('desktop-draft/draft_content.json').async('string'));
  assert.equal(draft.duration, 9_000_000);
  for (const m of draft.materials.videos) assert.ok(zip.file('desktop-draft/' + m.path));
  assert.equal(Object.keys(zip.files).filter(n => /^photos\/.*png$/.test(n)).length, 3);
  const base64 = {};
  for (const name of ['photos/001.png', 'desktop-draft/media/001_background.png', 'desktop-draft/media/001_text_01.png']) base64[name] = await zip.file(name).async('base64');
  // Actual canvas rendering, not mocked: transparent text has both empty and painted pixels.
  const pixels = await page.evaluate(async files => {
    const load = async name => {
      const image = new Image(); image.src = 'data:image/png;base64,' + files[name]; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return { image, canvas, ctx };
    };
    const complete = await load('photos/001.png');
    const background = await load('desktop-draft/media/001_background.png');
    const layer = await load('desktop-draft/media/001_text_01.png');
    const rgba = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height).data;
    let transparent = 0, visible = 0;
    for (let i = 3; i < rgba.length; i += 4) { if (!rgba[i]) transparent++; else visible++; }
    background.ctx.drawImage(layer.image, 0, 0);
    const merged = background.ctx.getImageData(0, 0, background.canvas.width, background.canvas.height).data;
    const expected = complete.ctx.getImageData(0, 0, complete.canvas.width, complete.canvas.height).data;
    let maxDifference = 0;
    for (let i = 0; i < merged.length; i++) maxDifference = Math.max(maxDifference, Math.abs(merged[i] - expected[i]));
    return { transparent, visible, maxDifference, width: complete.image.width, height: complete.image.height };
  }, base64);
  assert.equal(pixels.width, 1080); assert.equal(pixels.height, 1350);
  assert.ok(pixels.transparent > 1000 && pixels.visible > 100);
  assert.ok(pixels.maxDifference <= 3, JSON.stringify(pixels)); // PNG premultiplication rounding
  assert.equal(await page.evaluate(() => window.shareCalls), 0);
  await download.saveAs(resolve(out, 'capcut-example.zip'));

  // Existing Android bridge receives a ZIP save, not the share purpose, with cancel feedback.
  await page.reload(); await page.locator('.workspace-tools').waitFor();
  await page.getByText('다운로드·공유 더보기', { exact: true }).click();
  await page.evaluate(() => { window.saveMode = 'cancel'; });
  await page.getByRole('button', { name: '캡컷 다운로드', exact: true }).click();
  await page.waitForFunction(() => window.messages.some(m => m.op === 'begin'));
  const begin = await page.evaluate(() => window.messages.find(m => m.op === 'begin'));
  assert.equal(begin.name ?? begin.filename, 'instagram_KR_capcut.zip');
  assert.notEqual(begin.purpose, 'share');
  await page.getByRole('button', { name: /취소/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log('CapCut UI OK: real 3-image ZIP, 4 viewport widths, transparent layers, pixel composition, no share, Android ZIP cancellation.');
} finally { await browser?.close(); await server.close(); }
