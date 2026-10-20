import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5199, strictPort: true }, plugins: [{
  name: 'mobile-test-only', configureServer(vite) {
    vite.middlewares.use('/__mobile-test', async (_req, res) => {
      const html = await vite.transformIndexHtml('/__mobile-test', '<html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/mobile-fixture.tsx"></script></body></html>');
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    });
  },
}] });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.MOBILE_BROWSER_CHANNEL ? { channel: process.env.MOBILE_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/__mobile-test');
  await page.getByRole('tab', { name: /게시물 5/ }).waitFor();
  for (const width of [320, 360, 390, 412, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const size = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const tab = document.querySelector('.post-tab').getBoundingClientRect();
      const overflowing = [...document.querySelectorAll('main *')].filter(e => {
        const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.overflow-x-auto');
      }).map(e => e.tagName + '.' + e.className).slice(0, 8);
      return { width: document.documentElement.scrollWidth, client: innerWidth, left: main.left, right: innerWidth - main.right, tabW: tab.width, tabH: tab.height, overflowing };
    });
    assert.equal(size.width, size.client, JSON.stringify(size)); assert.ok(Math.abs(size.left - size.right) <= 1);
    assert.ok(size.tabW >= 130 && size.tabH >= 48); assert.deepEqual(size.overflowing, [], `${width}px overflow`);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('tab', { name: /게시물 5/ }).click();
  assert.equal(await page.getByRole('tab', { name: /게시물 5/ }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.workspace-tools details[open]').count(), 0);
  await page.getByText('✏️ 글자·폰트·위치', { exact: true }).click();
  await page.getByRole('button', { name: /사진 너비 가득/ }).click();
  const font = page.getByRole('spinbutton', { name: '글자 크기 수치', exact: true });
  await font.fill('8'); await page.waitForTimeout(350);
  const canvas = page.locator('canvas').first(); const smaller = await canvas.screenshot();
  await font.fill('16'); await page.waitForTimeout(350); const larger = await canvas.screenshot();
  assert.notDeepEqual(smaller, larger, 'font control must change rendered pixels');
  assert.equal(await page.getByRole('checkbox', { name: '상자 안에 자동 맞춤' }).isChecked(), false);
  await page.getByRole('button', { name: '글자 위로 이동', exact: true }).click();
  await page.getByRole('button', { name: '글자 왼쪽으로 이동', exact: true }).click();
  assert.ok(await page.getByText(/가로 0% · 세로 29%/).isVisible());
  await page.getByRole('button', { name: '글자 오른쪽으로 이동', exact: true }).click();
  await page.getByRole('button', { name: '글자 아래로 이동', exact: true }).click();
  assert.ok(await page.getByText(/가로 1% · 세로 30%/).isVisible());
  const save = page.getByRole('button', { name: '⬇️ 이 사진 저장 (PNG)', exact: true });
  await save.click();
  await page.waitForFunction(() => !!window.pendingBegin);
  const busy = page.getByRole('button', { name: '⏳ 저장 중…', exact: true });
  assert.equal(await busy.isDisabled(), true);
  assert.ok((await busy.getAttribute('class')).includes('save-saving'));
  await page.evaluate(() => window.completeBegin());
  const success = page.getByRole('button', { name: '✓ 저장 완료', exact: true });
  await success.waitFor(); assert.ok((await success.getAttribute('class')).includes('save-saved'));
  await page.evaluate(() => window.saveMode = 'cancel'); await success.click();
  const cancelled = page.getByRole('button', { name: '저장 취소 · 다시 저장', exact: true }); await cancelled.waitFor();
  await page.evaluate(() => window.saveMode = 'error'); await cancelled.click();
  const failed = page.getByRole('button', { name: '저장 실패 · 다시 시도', exact: true }); await failed.waitFor();
  assert.ok((await failed.getAttribute('class')).includes('save-error'));
  await page.evaluate(() => window.saveMode = 'ok'); await failed.click(); await success.waitFor();
  // Reload really restores editing controls; native API mock state is separate.
  await page.waitForTimeout(1200); await page.reload(); await page.getByText('✏️ 글자·폰트·위치', { exact: true }).click(); await font.waitFor();
  assert.equal(await font.inputValue(), '16');
  assert.ok(await page.getByText(/가로 1% · 세로 30%/).isVisible());
  assert.deepEqual(errors, []);
  const out = resolve(process.env.MOBILE_SCREENSHOT_DIR || resolve(root, 'release/mobile-screenshots'));
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: resolve(out, 'mobile-editor.png'), fullPage: true });
  console.log('Mobile UI OK: 320/360/390/412/768px, five post tabs, font pixels, arrows, persistence, save pending/success/cancel/error.');
} finally { await browser?.close(); await server.close(); }
