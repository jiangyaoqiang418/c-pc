// Keep one authoritative cascade for the complete v47 UI. Vue scoped rewriting changes
// :root/:is specificity, so reference classes intentionally form a global design contract.
// Component-scoped styles are reserved for real-business states absent from the prototype.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const version = readdirSync(resolve(root, 'node_modules/.pnpm')).find(name => name.startsWith('postcss@'));
if (!version) throw new Error('Restore the existing lockfile dependencies first.');
const postcss = require(resolve(root, 'node_modules/.pnpm', version, 'node_modules/postcss'));
const reference = resolve(root, '../Umaomao-v47/dist');
const html = readFileSync(resolve(reference, 'index.html'), 'utf8');
const files = [...html.matchAll(/<link[^>]+href="([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const manifest = [];
let output = '/* Generated from the supplied Umaomao v47 reference. Do not hand-edit.\n'
  + ' * Source order, selector specificity, media queries and !important are authoritative.\n'
  + ' * Palette aliases are normalized in umaomao-themes-v47.css.\n'
  + ' * Regenerate: node scripts/generate-v47-reference-css.mjs\n */\n';
for (const file of files) {
  const source = readFileSync(resolve(reference, file), 'utf8');
  manifest.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
  const css = postcss.parse(source, { from: file });
  css.walkDecls(declaration => { if (/^--ui-[\da-f]{3,8}$/i.test(declaration.prop)) declaration.remove(); });
  css.walkRules(rule => { if (!rule.nodes.length) rule.remove(); });
  css.walkComments(comment => comment.remove());
  output += `\n/* ${file} */\n${css.toString()}\n`;
}
writeFileSync(resolve(root, 'src/styles/umaomao-reference-v47.css'), output.trimEnd() + '\n');
writeFileSync(resolve(root, 'v47-reference-manifest.json'), JSON.stringify({ reference: 'Umaomao-v47/dist', stylesheets: manifest }, null, 2) + '\n');
console.log(`${files.length} reference stylesheets, ${Buffer.byteLength(output)} CSS bytes; source hashes frozen.`);
