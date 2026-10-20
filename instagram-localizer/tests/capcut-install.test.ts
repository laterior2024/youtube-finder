import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, access, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCapcutDraft } from '../src/lib/capcut-draft';

test('Windows draft installer resolves media, preserves old drafts, reimports safely, and rejects traversal', { skip: process.platform !== 'win32' }, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'capcut-install-test-'));
  try {
    const source = join(sandbox, 'package 한글'), target = join(sandbox, 'drafts 한글');
    await mkdir(join(source, 'desktop-draft', 'media'), { recursive: true });
    await mkdir(target); await writeFile(join(target, 'existing-project.txt'), 'preserve me');
    const { content, meta } = createCapcutDraft([{ background: 'media/001_background.png', textLayers: [] }], 1080, 1350);
    await writeFile(join(source, 'desktop-draft', 'draft_content.json'), JSON.stringify(content));
    await writeFile(join(source, 'desktop-draft', 'draft_meta_info.json'), JSON.stringify(meta));
    await writeFile(join(source, 'desktop-draft', 'media', '001_background.png'), 'fixture bytes');
    await copyFile(new URL('../src/lib/capcut-install.ps1', import.meta.url), join(source, 'install-capcut.ps1'));
    // Only the process-presence probe is stubbed; all filesystem writes use the actual exported installer.
    // No real CapCut draft folder or running CapCut process is accessed or changed.
    const runner = join(source, 'test-runner.ps1');
    await writeFile(runner, '\uFEFFparam([string]$DraftRoot)\nfunction global:Get-Process { param($Name, $ErrorAction) }\n& (Join-Path $PSScriptRoot "install-capcut.ps1") -DraftRoot $DraftRoot\n');
    const run = () => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', runner, '-DraftRoot', target], { encoding: 'utf8' });
    for (let i = 0; i < 2; i++) { const result = run(); assert.equal(result.status, 0, result.stderr); }
    const dirs = (await readdir(target)).filter(n => n.startsWith('Instagram_'));
    assert.equal(dirs.length, 2);
    const ids = [];
    for (const dir of dirs) {
      const draft = JSON.parse(await readFile(join(target, dir, 'draft_content.json'), 'utf8'));
      const metadata = JSON.parse(await readFile(join(target, dir, 'draft_meta_info.json'), 'utf8'));
      ids.push(draft.id); assert.equal(draft.id, metadata.draft_id);
      const material = draft.materials.videos[0];
      await access(material.path);
      assert.equal(await readFile(material.path, 'utf8'), 'fixture bytes');
      assert.ok(material.path.startsWith(join(target, dir).replaceAll('\\', '/') + '/'));
    }
    assert.notEqual(ids[0], ids[1]);
    (content.materials.videos[0] as { path: string }).path = '../outside.png';
    await writeFile(join(source, 'desktop-draft', 'draft_content.json'), JSON.stringify(content));
    assert.notEqual(run().status, 0);
    assert.equal((await readdir(target)).length, 3);
    assert.equal(await readFile(join(target, 'existing-project.txt'), 'utf8'), 'preserve me');
  } finally {
    assert.equal(dirname(resolve(sandbox)), resolve(tmpdir()));
    assert.ok(basename(sandbox).startsWith('capcut-install-test-'));
    await rm(sandbox, { recursive: true, force: true });
  }
});
