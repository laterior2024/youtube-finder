import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
try {
  const raw = await readFile(new URL('PACKAGE_CHECKSUMS.json', root), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (raw === null) {
    console.log('Source checkout: no release checksum file. Continue with source tests.');
  } else {
    const manifest = JSON.parse(raw);
    const expected = JSON.parse(await readFile(new URL('PROJECT_FILES.json', root), 'utf8'));
    if (manifest.format !== 1 || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify([...expected].sort())) {
      throw new Error('Checksum inventory does not match PROJECT_FILES.json.');
    }
    for (const name of expected) {
      if (name.includes('..') || name.startsWith('/') || name.includes('\\') || name.includes(':')) throw new Error('Invalid package path.');
      const digest = createHash('sha256').update(await readFile(new URL(name, root))).digest('hex');
      if (digest !== manifest.files[name]) throw new Error('Changed or missing file: ' + name);
    }
    console.log('Package integrity OK: ' + expected.length + ' source files.');
  }
} catch (error) {
  console.error('Package verification failed: ' + error.message);
  process.exitCode = 1;
}
