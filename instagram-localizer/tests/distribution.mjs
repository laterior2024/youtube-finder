import { readFile, writeFile, appendFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const bytes = await readFile(new URL('release/instagram-localizer-v' + pkg.version + '-windows-source.zip', root));
const zip = await JSZip.loadAsync(bytes);
const temp = await mkdtemp(join(tmpdir(), 'localizer-distribution-'));
const destination = join(temp, '\uC774\uAD00 \uAC80\uC99D space');
const app = join(destination, 'instagram-localizer');
for (const [name, entry] of Object.entries(zip.files)) {
  assert.ok(!name.includes('..') && !name.includes('\\') && name.startsWith('instagram-localizer/'));
  if (entry.dir) continue;
  const path = join(destination, name);
  await mkdir(dirname(path), {recursive:true});
  await writeFile(path, await entry.async('nodebuffer'));
}
const manifest = JSON.parse(await readFile(join(app, 'PACKAGE_CHECKSUMS.json'), 'utf8'));
for (const [name, digest] of Object.entries(manifest.files)) {
  assert.equal(createHash('sha256').update(await readFile(join(app, name))).digest('hex'), digest);
}
assert.equal(zip.file('instagram-localizer/.env.local'), null);
assert.ok(!Object.keys(zip.files).some(name => /node_modules|\/dist\/|\.vercel/.test(name)));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide:true, timeout:240000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'command must succeed');
}
run(process.execPath, [join(app, 'scripts/verify-package.mjs')], temp);
const checksumPath = join(app, 'README.md');
const original = await readFile(checksumPath);
await writeFile(checksumPath, 'changed by integrity regression test');
const tampered = spawnSync(process.execPath, [join(app, 'scripts/verify-package.mjs')], {cwd:temp,windowsHide:true});
assert.notEqual(tampered.status, 0);
await writeFile(checksumPath, original);

if (process.platform === 'win32') {
  const ps = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  // Preserve a pre-existing local file during installation. No real credentials.
  const localConfig = '# keep-existing-config\nVITE_SUPABASE_URL=https://example.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=public-test-only\n';
  await writeFile(join(app, '.env.local'), localConfig);
  run(ps, ['-NoProfile','-NonInteractive','-File',join(app,'setup.ps1')], temp);
  assert.equal(await readFile(join(app, '.env.local'),'utf8'), localConfig);
  const port = 5189;
  const child = spawn(ps, ['-NoProfile','-NonInteractive','-File',join(app,'start.ps1'),'-NoBrowser','-Port',String(port)], {
    cwd:temp, windowsHide:true, stdio:'ignore',
  });
  try {
    const deadline = Date.now() + 60000;
    let response;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('start.ps1 exited before serving HTTP');
      try { response = await fetch('http://127.0.0.1:' + port, {signal:AbortSignal.timeout(1000)}); if (response.ok) break; } catch {}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.ok(response?.ok, 'start.ps1 must serve the app');
    assert.match(await response.text(), /id="root"/);
    const proxy = await fetch('http://127.0.0.1:' + port + '/api/image?url=https%3A%2F%2Fa.cdninstagram.com%2Fx');
    assert.equal(proxy.status, 401, 'unauthenticated image proxy remains protected');
  } finally {
    if (child.pid) spawnSync('taskkill.exe', ['/PID',String(child.pid),'/T','/F'], {stdio:'ignore',windowsHide:true});
  }
}
if (process.env.GITHUB_OUTPUT && process.platform !== 'win32') await appendFile(process.env.GITHUB_OUTPUT, 'package-directory=' + app + '\n');
console.log('Distribution verified: isolated extraction, checksums, tamper detection' + (process.platform === 'win32' ? ', Windows PowerShell 5.1 setup/start and protected HTTP endpoint.' : '.'));
