// Read only the supplied prototype data arrays; the development visual entry has no business mutations.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
const root = resolve(import.meta.dirname, '..');
const reference = resolve(root, '../Umaomao-v47/dist');
function readArray(file, name, variables = {}) {
  const source = readFileSync(resolve(reference, file), 'utf8');
  const start = source.indexOf(`const ${name}=`);
  const arrayStart = source.indexOf('[', start);
  let depth = 0, quote = '', escaped = false, end = -1;
  for (let i = arrayStart; i < source.length; i++) {
    const character = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
    } else if ('"\'`'.includes(character)) quote = character;
    else if (character === '[') depth++;
    else if (character === ']' && --depth === 0) { end = i + 1; break; }
  }
  if (start < 0 || end < 0) throw new Error(`Cannot extract ${name}`);
  return runInNewContext(source.slice(arrayStart, end), variables, { timeout: 1000 });
}
const products = [...readArray('app.js', 'PRODUCTS'), ...readArray('products-demo.js', 'DEMO_PRODUCTS')];
// The category source intentionally places whitespace around '='.
const categoryText = readFileSync(resolve(reference, 'categories.js'), 'utf8');
const categoryStart = categoryText.indexOf('[');
const categoryEnd = categoryText.indexOf('\n];', categoryStart);
if (categoryEnd < 0) throw new Error('Cannot extract CATEGORY_TREE');
const categorySource = runInNewContext(categoryText.slice(categoryStart, categoryEnd + 2), {}, { timeout: 1000 });
function category(node, level = 1, parentId = null, parentPath = '') {
  return { id: node.id, code: node.id, name: node.name, icon: node.icon, summary: node.summary, level, parentId, parentPath, sort: 0, status: '1',
    productCount: products.filter(product => product.cat === node.name).length, createdAt: '', updatedAt: '', creatorType: 'system',
    children: node.children?.map(child => category(child, level + 1, node.id, parentPath ? `${parentPath}/${node.name}` : node.name)) };
}
const categories = categorySource.map(node => category(node));
const visual = resolve(root, 'src/visual');
mkdirSync(resolve(visual, 'assets'), { recursive: true });
const serviceTypes = { '7 天无理由': '7day-no-reason', '全国联保': 'national-warranty', '店铺保修': 'shop-warranty', '无售后': 'none' };
const records = products.map(product => {
  const source = resolve(reference, 'assets', product.img);
  if (!source.startsWith(resolve(reference, 'assets') + sep)) throw new Error('Invalid reference asset path');
  const destination = resolve(visual, 'assets', product.img);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return { id: String(product.id), code: String(product.id), title: product.name, brandName: product.brand,
    sellerId: 'visual-only', sellerName: product.seller, categoryId: categories.find(item => item.name === product.cat)?.id || '',
    categoryPath: product.cat, price: String(product.price), stock: product.stock, shippingFee: String(product.shipping || 0),
    tax: String(product.tax || 0), images: [{ url: product.img, name: product.img, type: 'image', sort: 0 }],
    summary: product.subtitle, description: '', aftersaleType: serviceTypes[product.service] || 'unknown',
    overseasCustoms: !!product.overseas, status: 'NORMAL', shelfStatus: 'on-shelf', salesCount: product.sales,
    viewCount: 0, favoriteCount: 0, createdAt: '', submittedAt: '', updatedAt: '' };
});
writeFileSync(resolve(visual, 'v47-reference-data.json'), JSON.stringify({ records, categories }, null, 2) + '\n');
console.log(`Generated ${records.length} readonly visual products and ${categories.length} category roots.`);
