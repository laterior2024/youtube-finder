import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5201, strictPort: true }, plugins: [{
  name: 'editor-local-fixture', configureServer(vite) {
    vite.middlewares.use('/__editor-test', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/__editor-test', '<html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/mobile-fixture.tsx"></script></body></html>'));
    });
  },
}] });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.MOBILE_BROWSER_CHANNEL ? { channel: process.env.MOBILE_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5201/__editor-test');
  await page.getByRole('button', { name: '⬇️ 사진 3장 한 번에 저장', exact: true }).waitFor();
  await page.evaluate(() => { delete window.LocalizerNative; });
  assert.equal(await page.locator('.workspace-tools details[open]').count(), 0);
  assert.equal(await page.getByRole('spinbutton', { name: '글자 크기 수치', exact: true }).isVisible(), false);
  const out = resolve(root, 'release/editor-screenshots'); await mkdir(out, { recursive: true });
  await page.screenshot({ path: resolve(out, 'desktop-collapsed.png'), fullPage: true });
  for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflow`);
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole('button',{name:'생성된 사진 크게보기',exact:true}).click();
    const viewer=page.getByRole('dialog',{name:'생성된 사진 크게보기'});
    await viewer.waitFor();
    await viewer.locator('canvas').waitFor();
    await viewer.getByRole('slider',{name:'사진 확대 비율'}).fill('3');
    assert.equal(await viewer.getByTestId('zoom-scroll').evaluate(e=>e.scrollWidth>e.clientWidth),true);
    await viewer.getByRole('button',{name:'다음 사진 →'}).click();
    await viewer.getByText('사진 2 / 3',{exact:true}).waitFor();
    assert.equal(await viewer.getByRole('slider').inputValue(),'1');
    await page.keyboard.press('Escape');assert.equal(await viewer.count(),0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const textSummary = page.getByText('✏️ 글자·폰트·위치', { exact: true });
  await textSummary.click();
  const text = page.getByRole('textbox', { name: '사진 위 글자', exact: true });
  await text.fill('첫 문장\n두 번째 강조\n세 번째 문장');
  const font = page.getByRole('spinbutton', { name: '글자 크기 수치', exact: true });
  await font.fill('8');
  await page.getByRole('button', { name: /사진 너비 가득/ }).click();
  await page.getByRole('button', { name: '글자 오른쪽으로 이동', exact: true }).click();
  await page.waitForTimeout(700);
  const preview = await page.locator('.preview-image').boundingBox();
  const header = await page.locator('header').boundingBox();
  assert.ok(preview && preview.y >= header.y + header.height && preview.y + preview.height < 844, 'entire photo must stay below header while moving text');
  assert.ok(await page.locator('.preview-image canvas').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) if (data[i] > 245 && data[i+1] > 210 && data[i+1] < 235 && data[i+2] < 100) return true;
    return false;
  }), 'default yellow title line is rendered');
  await page.screenshot({ path: resolve(out, 'mobile-editing.png'), fullPage: false });
  await textSummary.click(); await textSummary.focus(); await page.keyboard.press('Enter');
  assert.equal(await text.inputValue(), '첫 문장\n두 번째 강조\n세 번째 문장');
  await textSummary.click();
  await page.getByRole('button', { name: '📋 최종 설명글 복사', exact: true }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /교토의 두부/);

  // Real browser download fallback contains all three PNGs in one archive.
  await page.evaluate(() => { window.showDirectoryPicker = undefined; });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇️ 사진 3장 한 번에 저장', exact: true }).click();
  const download = await downloading; assert.equal(await download.failure(), null);
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  assert.equal(Object.keys(zip.files).filter(n => n.endsWith('.png')).length, 3);
  for (const file of Object.values(zip.files)) { const bytes = await file.async('uint8array'); assert.deepEqual([...bytes.slice(0, 8)], [137,80,78,71,13,10,26,10]); }

  // Folder picker contract: one selection, unique folder, sequential complete PNG writes.
  await page.evaluate(() => {
    window.writes = []; window.picks = 0;
    window.showDirectoryPicker = async () => { window.picks++; return { getDirectoryHandle: async () => ({
      getFileHandle: async name => ({ createWritable: async () => ({ write: async blob => window.writes.push({ name, size: blob.size }), close: async () => {}, abort: async () => {} }) }),
    }) }; };
  });
  await page.locator('.primary-actions .save-button').nth(1).click();
  await page.waitForFunction(() => window.writes.length === 3);
  assert.equal(await page.evaluate(() => window.picks), 1);
  assert.ok(await page.evaluate(() => window.writes.every(file => file.size > 100)));

  await page.getByText('다운로드·공유 더보기', { exact: true }).click();
  await page.evaluate(() => {
    window.shares = 0;
    navigator.canShare = () => true;
    navigator.share = async data => { window.shares++; window.sharedName = data.files[0].name; };
  });
  const pngDownload = page.waitForEvent('download');
  await page.locator('.primary-actions .save-button').first().click();
  assert.match((await pngDownload).suggestedFilename(), /\.png$/);
  assert.equal(await page.evaluate(() => window.shares), 0, 'saving never opens sharing');
  await page.getByRole('button', { name: '↗ 이 사진 공유', exact: true }).click();
  assert.equal(await page.evaluate(() => window.shares), 0, 'prepare does not auto-share');
  await page.getByRole('button', { name: '↗ 이 사진 공유 · 공유 창 열기', exact: true }).click();
  assert.equal(await page.evaluate(() => window.shares), 1);
  assert.match(await page.evaluate(() => window.sharedName), /\.png$/);
  await page.getByRole('button', { name: '↗ 전체 ZIP 공유', exact: true }).click();
  await page.getByRole('button', { name: '↗ 전체 ZIP 공유 · 공유 창 열기', exact: true }).click();
  assert.match(await page.evaluate(() => window.sharedName), /\.zip$/);
  await page.getByRole('button', { name: '사진 2 선택', exact: true }).click();
  assert.equal(await page.locator('.workspace-tools details[open]').filter({ hasText: '글자·폰트·위치' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Editor UI OK: collapsed controls, 7 viewport widths, sticky live preview, yellow text, keyboard toggling, clipboard, 3 PNG ZIP, folder contract, separate PNG/ZIP sharing.');
} finally { await browser?.close(); await server.close(); }
