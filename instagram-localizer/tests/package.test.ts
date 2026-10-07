import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audit } from '../scripts/audit-source.mjs';

test('distribution audit rejects credentials and nonblank examples without printing values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'localizer-audit-'));
  const root = pathToFileURL(dir + sep);
  try {
    await writeFile(join(dir, 'PROJECT_FILES.json'), JSON.stringify(['sample.ts','.env.example']));
    await writeFile(join(dir, '.env.example'), 'VITE_SUPABASE_URL=\n');
    await writeFile(join(dir, 'sample.ts'), 'export const safe = true;\n');
    assert.equal((await audit(root)).length, 2);
    const synthetic = 'AIza' + 'x'.repeat(35);
    await writeFile(join(dir, 'sample.ts'), 'const token = "' + synthetic + '";');
    await assert.rejects(audit(root), error => {
      assert.match(error.message, /Google API key/); assert.ok(!error.message.includes(synthetic)); return true;
    });
    await writeFile(join(dir, 'sample.ts'), 'export const safe = true;\n');
    await writeFile(join(dir, '.env.example'), 'VITE_SUPABASE_URL=https://example.test\n');
    await assert.rejects(audit(root), /example contains a value/);
    await writeFile(join(dir, 'PROJECT_FILES.json'), JSON.stringify(['../outside']));
    await assert.rejects(audit(root), /Disallowed package path/);
  } finally { await rm(dir, {recursive:true,force:true}); }
});
