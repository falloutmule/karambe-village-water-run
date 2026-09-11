import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const manifest = JSON.parse(fs.readFileSync('src/build-manifest.json', 'utf8'));
const artifact = manifest.artifact;
const shellPath = manifest.shell;
const entry = manifest.entry;
const buildId = manifest.buildId;

if (!artifact || !shellPath || !entry || !buildId) throw Error('Missing build identity, entry, shell, or artifact');
if (path.dirname(artifact) !== '.' || path.extname(artifact) !== '.html') throw Error('Artifact must be a root HTML file');
if (!Array.isArray(manifest.runtimeExternalDependencies) || manifest.runtimeExternalDependencies.length !== 0) {
  throw Error('Invalid single-file release contract');
}
if (!fs.existsSync(entry)) throw Error(`Manifest entry does not exist: ${entry}`);

const bundled = await build({
  entryPoints: [entry],
  absWorkingDir: process.cwd(),
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  legalComments: 'inline',
  charset: 'utf8'
});
const script = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const bundleMarker = '<!-- GAME_BUNDLE -->';
const shell = fs.readFileSync(shellPath, 'utf8');
if (shell.split(bundleMarker).length !== 2) throw Error('Shell must contain exactly one GAME_BUNDLE marker');
const html = shell.replace(bundleMarker, `<script>\n${script}\n</script>`);

function assertStandalone(document) {
  const failures = [];
  const hasRemoteAttribute = (tagPattern, attribute) => {
    const tags = document.match(new RegExp(`<(?:${tagPattern})\\b[^>]*>`, 'gi')) ?? [];
    return tags.some(tag => {
      const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:(["'])(.*?)\\1|([^\\s>]+))`, 'i'));
      if (!match) return false;
      const value = (match[2] ?? match[3]).trim().toLowerCase();
      return value !== '' && !value.startsWith('data:') && !value.startsWith('#');
    });
  };
  if (/\son[a-z][\w:-]*\s*=/i.test(document)) failures.push('inline event handler');
  if (/<base\b/i.test(document)) failures.push('base URL');
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i.test(document)) failures.push('meta refresh');
  if (hasRemoteAttribute('script', 'src')) failures.push('script src');
  if (hasRemoteAttribute('link', 'href')) failures.push('link href');
  if (hasRemoteAttribute('img|audio|video|source|track|iframe|embed|input', 'src')) failures.push('resource src');
  if (hasRemoteAttribute('img|source', 'srcset')) failures.push('resource srcset');
  if (hasRemoteAttribute('video', 'poster')) failures.push('video poster');
  if (hasRemoteAttribute('object', 'data')) failures.push('object data');
  const cssText = [
    ...[...document.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]),
    ...[...document.matchAll(/\bstyle\s*=\s*(["'])(.*?)\1/gi)].map(match => match[2])
  ].join('\n');
  if (/@import\b/i.test(cssText)) failures.push('CSS @import');
  const cssUrls = [...cssText.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].map(match => match[2].trim());
  if (cssUrls.some(url => url && !url.startsWith('data:') && !url.startsWith('#'))) failures.push('CSS url');
  if (failures.length) throw Error(`Standalone guard failed: ${[...new Set(failures)].join(', ')}`);
}

assertStandalone(html);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(artifact) || fs.readFileSync(artifact, 'utf8') !== html) {
    throw Error(`Generated artifact differs from canonical source: ${artifact}`);
  }
  console.log(`PASS source/artifact parity and standalone guards: ${artifact}`);
} else {
  fs.writeFileSync(artifact, html);
  console.log(`Built ${artifact} (${Buffer.byteLength(html)} bytes)`);
}
