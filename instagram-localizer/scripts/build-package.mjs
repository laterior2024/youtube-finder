import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { audit } from './audit-source.mjs';
const root = new URL('../', import.meta.url);
const names = await audit(root);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const zip = new JSZip();
const files = {};
const date = new Date('2000-01-01T00:00:00Z');
for (const name of names) {
  const bytes = await readFile(new URL(name, root));
  files[name] = createHash('sha256').update(bytes).digest('hex');
  zip.file('instagram-localizer/' + name, bytes, { date });
}
const checksums = { format: 1, version: pkg.version, sourceCommit: process.env.GITHUB_SHA || 'local-source-checkout', files };
zip.file('instagram-localizer/PACKAGE_CHECKSUMS.json', JSON.stringify(checksums, null, 2) + '\n', { date });
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
const directory = new URL('release/', root);
await mkdir(directory, { recursive: true });
const archiveName = 'instagram-localizer-v' + pkg.version + '-windows-source.zip';
await writeFile(new URL(archiveName, directory), bytes);
await writeFile(new URL(archiveName + '.sha256', directory), createHash('sha256').update(bytes).digest('hex') + '  ' + archiveName + '\n');
console.log('Packaged ' + names.length + ' source files; ' + bytes.length + ' bytes. No credentials or user media included.');
