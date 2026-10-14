// Regenerate component styles from the supplied reference, retaining cascade order.
// Uses PostCSS already locked by Vite; never downloads dependencies.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const postcssDir = readdirSync(resolve(root, 'node_modules/.pnpm')).find(name => name.startsWith('postcss@'));
if (!postcssDir) throw new Error('Restore the existing lockfile dependencies before extracting styles.');
const postcss = require(resolve(root, 'node_modules/.pnpm', postcssDir, 'node_modules/postcss'));
const reference = resolve(root, '../Umaomao-v47/dist');
const files = [...readFileSync(resolve(reference, 'index.html'), 'utf8').matchAll(/<link[^>]+href="([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const moduleName = process.argv[2] || 'product';
const selections = {
  product: /\.(?:product-(?:card|image|meta|name|price|service)|meme-card-[\w-]+|image-button|quick-view|favorite)(?![\w-])/,
  brand: /\.(?:brand-(?:page|hero|grid|card|filters|tabs|search|category|list|empty|logo|intro|heading)[\w-]*)(?![\w-])/
};
const selection = selections[moduleName];
if (!selection) throw new Error(`Unknown style module: ${moduleName}`);
function scopedRoot(selector) {
  // Vue scopes the last node. Wrapping an ancestor in :global() drops its descendant selector.
  return selector;
}
function prune(node) {
  if (node.type === 'rule') {
    const selectors = postcss.list.comma(node.selector).filter(selector => selection.test(selector));
    if (!selectors.length) return;
    const clone = node.clone({ selector: selectors.map(scopedRoot).join(',\n') });
    clone.raws.before = '\n';
    clone.raws.between = ' ';
    clone.raws.after = '\n';
    clone.nodes.forEach(declaration => { declaration.raws.before = '\n  '; declaration.raws.between = ': '; });
    return clone;
  }
  if (node.type === 'atrule' && node.nodes && !/keyframes$/.test(node.name)) {
    const children = node.nodes.map(prune).filter(Boolean);
    if (!children.length) return;
    const clone = node.clone({ nodes: children });
    clone.raws.before = '\n';
    clone.raws.between = ' ';
    clone.raws.after = '\n';
    return clone;
  }
}
let output = '/* Generated from Umaomao-v47/dist. Preserve source cascade; regenerate with scripts/extract-v47-css.mjs. */\n';
for (const file of files) {
  const stylesheet = postcss.parse(readFileSync(resolve(reference, file), 'utf8'), { from: file });
  const nodes = stylesheet.nodes.map(prune).filter(Boolean);
  if (nodes.length) output += `\n/* ${file} */\n${postcss.root({ nodes }).toString()}\n`;
}
const destination = resolve(root, moduleName === 'product' ? 'src/components/product/v47-product-card.css' : 'src/views/brand/v47-brand.css');
writeFileSync(destination, output);
console.log(`${files.length} source stylesheets -> ${destination}`);
