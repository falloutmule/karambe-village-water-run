// Product-local offline derivative. Keep the stock Archify delivery unmodified.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const records = [];
for (const name of ['gameplay', 'runtime']) {
  const native = await fs.readFile(path.join(root, `test-results/atlas/${name}.native.html`));
  const text = native.toString('utf8');
  const links = text.match(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g) || [];
  if (links.length !== 3) throw new Error(`Unexpected stock font markup in ${name}`);
  const offline = Buffer.from(text.replace(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, ''));
  const output = `docs/atlas/${name}.html`;
  await fs.writeFile(path.join(root, output), offline);
  records.push({view: name, nativeSha256: digest(native), offlineSha256: digest(offline), output,
    adaptation: 'Removed only three optional Google font/preconnect link elements; stock system-monospace fallback remains.'});
}
await fs.writeFile(path.join(root, 'docs/atlas/export-record.json'), JSON.stringify({
  producer: 'Installed Atlas-pinned Archify 2.16.0',
  status: 'Repository diagram export; not an accepted Atlas workspace artifact',
  records
}, null, 2) + '\n');
