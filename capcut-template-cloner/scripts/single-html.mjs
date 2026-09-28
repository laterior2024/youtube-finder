// dist/ 결과물을 HTML 파일 하나로 합친다 → 더블클릭으로 바로 열 수 있는 "틀복사스튜디오.html"
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = join(dist, 'assets');
for (const file of readdirSync(assets)) {
  const body = readFileSync(join(assets, file), 'utf8');
  if (file.endsWith('.js')) {
    const tag = new RegExp(`<script[^>]*src="[^"]*${file}"[^>]*></script>`);
    html = html.replace(tag, () => `<script type="module">${body.replace(/<\/script/gi, '<\\/script')}</script>`);
  } else if (file.endsWith('.css')) {
    const tag = new RegExp(`<link[^>]*href="[^"]*${file}"[^>]*>`);
    html = html.replace(tag, () => `<style>${body}</style>`);
  }
}
if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\//.test(html)) throw new Error('합치지 못한 파일이 남아 있어요');
const out = fileURLToPath(new URL('../틀복사스튜디오.html', import.meta.url));
writeFileSync(out, html);
console.log(`만들었어요: ${out} (${Math.round(html.length / 1024)} KB)`);
