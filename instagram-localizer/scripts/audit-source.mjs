import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export async function audit(root = new URL('../', import.meta.url)) {
  const names = JSON.parse(await readFile(new URL('PROJECT_FILES.json', root), 'utf8'));
  if (!Array.isArray(names) || new Set(names).size !== names.length) throw new Error('Invalid source inventory.');
  const rules = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['Google API key', /AIza[A-Za-z0-9_-]{30,}/],
    ['Apify token', /\bapify_api_[A-Za-z0-9_-]{20,}\b/],
    ['Google authorization key', /\bAQ\.[A-Za-z0-9_.-]{30,}\b/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
    ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{15,}/],
    ['JWT credential', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{15,}/],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['credential URL', /https?:\/\/[^/\s:@]+:[^/\s@]+@/],
    ['machine path', /(?:^|[\s"'(=])[A-Za-z]:[\\/]|file:\/\/\/|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\//m],
  ];
  const findings = [];
  for (const name of names) {
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || name.includes(':') ||
        /(^|\/)(node_modules|dist|\.git|\.vercel|\.tools|release)(\/|$)/.test(name) ||
        (/(^|\/)\.env/.test(name) && name !== '.env.example')) throw new Error('Disallowed package path: ' + name);
    const contents = await readFile(new URL(name, root), 'utf8');
    // Package tests deliberately include synthetic URLs; these are not credentials.
    const activeRules = name.startsWith('tests/') ? rules.filter(([rule]) => rule !== 'credential URL') : rules;
    for (const [rule, pattern] of activeRules) {
      if (pattern.test(contents)) findings.push(name + ': ' + rule);
    }
    if (name === '.env.example' && contents.split(/\r?\n/).some(line => /^\s*[A-Z][A-Z0-9_]*\s*=\s*\S/.test(line))) {
      findings.push(name + ': example contains a value');
    }
  }
  if (findings.length) throw new Error('Source audit failed (values withheld):\n' + findings.join('\n'));
  return names;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log('Source audit OK: ' + (await audit()).length + ' allowlisted files.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
