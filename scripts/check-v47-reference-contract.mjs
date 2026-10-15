// Read-only contract audit against the supplied prototype; writes only its QA report.
// This checks source/assets/fixtures, not browser pixels or animation acceptance.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const reference = resolve(root, '../Umaomao-v47/dist');
const reportFile = resolve(root, process.argv[2] || 'qa/v47/2026-10-15/reference-contract-check.json');
if (!reportFile.startsWith(resolve(root, 'qa') + sep)) {
  throw new Error('The report must stay inside the repository qa directory.');
}
const read = file => readFileSync(resolve(root, file), 'utf8');
const source = file => readFileSync(resolve(reference, file), 'utf8');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const normalizedText = file => readFileSync(file, 'utf8').replaceAll('\r\n', '\n').trimEnd();
const normalizedHash = file => createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const manifest = JSON.parse(read('v47-reference-manifest.json'));
const html = source('index.html');
const cssFiles = [...html.matchAll(/<link[^>]+href="([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const stylesheetChecks = manifest.stylesheets.map(entry => ({ ...entry,
  actualSha256: hash(resolve(reference, entry.file)),
  pass: entry.sha256 === hash(resolve(reference, entry.file))
}));
const stylesheetOrderMatches = JSON.stringify(cssFiles) === JSON.stringify(manifest.stylesheets.map(entry => entry.file));
const require = createRequire(import.meta.url);
const postcssVersion = readdirSync(resolve(root, 'node_modules/.pnpm')).find(name => name.startsWith('postcss@'));
if (!postcssVersion) throw new Error('The existing locked PostCSS dependency is required; this script never installs it.');
const postcss = require(resolve(root, 'node_modules/.pnpm', postcssVersion, 'node_modules/postcss'));
let generated = '/* Generated from the supplied Umaomao v47 reference. Do not hand-edit.\n'
  + ' * Source order, selector specificity, media queries and !important are authoritative.\n'
  + ' * Palette aliases are normalized in umaomao-themes-v47.css.\n'
  + ' * Regenerate: node scripts/generate-v47-reference-css.mjs\n */\n';
for (const file of cssFiles) {
  const css = postcss.parse(source(file), { from: file });
  css.walkDecls(declaration => { if (/^--ui-[\da-f]{3,8}$/i.test(declaration.prop)) declaration.remove(); });
  css.walkRules(rule => { if (!rule.nodes.length) rule.remove(); });
  css.walkComments(comment => comment.remove());
  generated += `\n/* ${file} */\n${css.toString()}\n`;
}
const generatedCssMatches = generated.trimEnd() + '\n' === read('src/styles/umaomao-reference-v47.css');
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
}
const assets = ['src/assets/images/v47', 'src/assets/images/v47-home', 'src/visual/assets'].flatMap(folder =>
  walk(resolve(root, folder)).map(file => {
    const path = relative(resolve(root, folder), file).replaceAll('\\', '/');
    const origin = resolve(reference, 'assets', path);
    const byteIdentical = existsSync(origin) && hash(file) === hash(origin);
    const textWhitespaceOnly = !byteIdentical && path.endsWith('.svg') && existsSync(origin)
      && normalizedText(file).replace(/>\s+</g, '><') === normalizedText(origin).replace(/>\s+</g, '><');
    return { implementation: relative(root, file).replaceAll('\\', '/'), reference: 'assets/' + path,
      byteIdentical, textWhitespaceOnly, pass: byteIdentical || textWhitespaceOnly };
  }));
const runtimeChecks = (manifest.runtimeAssets || []).map(entry => ({
  reference: entry.file, implementation: entry.implementation,
  referencePass: hash(resolve(reference, entry.file)) === entry.sha256,
  implementationByteIdentical: hash(resolve(root, entry.implementation)) === entry.implementationSha256,
  implementationPass: hash(resolve(root, entry.implementation)) === entry.implementationSha256
    || normalizedHash(resolve(root, entry.implementation)) === entry.implementationSha256,
  adaptation: entry.adaptation
}));
function array(file, name) {
  const text = source(file);
  const marker = text.indexOf(`const ${name}=`);
  const start = text.indexOf('[', marker);
  let depth = 0, quote = '', escaped = false;
  if (marker < 0 || start < 0) throw new Error(`Cannot find ${name}`);
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
    } else if ('"\'`'.includes(ch)) quote = ch;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return runInNewContext(text.slice(start, i + 1), {}, { timeout: 1000 });
  }
  throw new Error(`Cannot extract ${name}`);
}
const products = [...array('app.js', 'PRODUCTS'), ...array('products-demo.js', 'DEMO_PRODUCTS')];
const fixture = JSON.parse(read('src/visual/v47-reference-data.json'));
const fixtureDrift = products.flatMap(product => {
  const actual = fixture.records.find(record => record.id === String(product.id));
  if (!actual) return [{ id: String(product.id), field: 'record', expected: 'present', actual: 'missing' }];
  const expected = { title: product.name, brandName: product.brand, categoryPath: product.cat,
    summary: product.subtitle, price: String(product.price), stock: product.stock, salesCount: product.sales,
    shippingFee: String(product.shipping || 0), tax: String(product.tax || 0), overseasCustoms: !!product.overseas,
    sellerName: product.seller, images: product.gallery || [product.img] };
  return Object.entries(expected).flatMap(([field, value]) => {
    const actualValue = field === 'images' ? actual.images.map(image => image.url) : actual[field];
    return JSON.stringify(value) === JSON.stringify(actualValue) ? [] : [{ id: actual.id, field, expected: value, actual: actualValue }];
  });
});
const referenceThemes = [...source('theme-boot.js').matchAll(/"([a-z][a-z0-9-]+)"/g)].map(match => match[1]);
const themeIds = [...new Set(referenceThemes.filter(id => id !== 'um.uiTheme'))];
const implementationThemes = [...read('src/composables/use-ui-theme.ts').matchAll(/\{ id: '([^']+)'/g)].map(match => match[1]);
const themeIdsMatch = JSON.stringify(themeIds) === JSON.stringify(implementationThemes);
const entry = read('src/visual-v47.ts');
const wallet = read('src/views/wallet/index.vue');
const home = read('src/views/home/index.vue');
const guards = {
  devOnly: entry.includes("if (!import.meta.env.DEV) throw new Error"),
  independentMemoryRouter: entry.includes('createMemoryHistory()') && !/from ['"]@\/router/.test(entry),
  separatePinia: entry.includes('const visualPinia = createPinia()') && entry.includes('app.use(visualPinia)'),
  noBusinessApiImport: !/from ['"]@\/service\//.test(entry),
  noDirectWriteRequest: !/\b(?:fetch|XMLHttpRequest)\s*\(|\.\s*(?:post|put|patch|delete)\s*\(/.test(entry),
  noUserInitialization: !/\b(?:userStore|user|visualUser)\.init\s*\(/.test(entry),
  isolatedIdentityActions: entry.includes('visualUser.init = async () => {}') && entry.includes('visualUser.syncExternalSession = async () => false')
    && entry.includes('visualUser.setAudience = () => false') && entry.includes('visualUser.logout = () => {}'),
  noDirectStorageMutation: !/\blocalStorage\.(?:setItem|removeItem|clear)\s*\(/.test(entry),
  paletteInMemory: entry.includes("new StorageEvent('storage', { key: 'um.uiTheme', newValue: theme })")
    && entry.includes("event.target.closest('.theme-option')") && entry.includes('event.stopImmediatePropagation()'),
  notImportedByProductionEntry: !read('src/main.ts').includes('visual-v47') && !read('index.html').includes('visual-v47'),
  walletFixtureProvided: entry.includes('h(WalletView, { visualFixture: walletFixture })'),
  walletReadsShortCircuited: /async function loadAll\(\)\s*\{\s*if \(props\.visualFixture\) return;/.test(wallet),
  homeLoadShortCircuited: /async function loadSection[^]*?if \(props\.visualFixture\) return;/.test(home),
  homeRoleSwitchGuarded: /function switchRole[^]*?if \(props\.visualFixture\) return;/.test(home),
  homeFavoriteNoop: home.includes('function ignoreVisualFavorite()') && home.includes('ignoreVisualFavorite')
};
const views = [
  { page: 'home', reference: '/#/', visual: '/visual-v47.html', readiness: 'same 50 products; guest; hero 1; first image',
    nodes: ['.header', '.desktop-nav', '.meme-market-heading', '.home-hero-layout', '.hero', '.hero-content', '.meme-hero-art', '.home-account', '.trust-strip', '.product-card', '.product-image', '.product-meta', '.product-name', '.product-price'] },
  { page: 'detail-components', reference: '/#/product/1', visual: '/visual-v47.html?view=gallery', readiness: 'gallery/share/zoom local nodes only; incomplete product-info content; do not compare full page',
    nodes: ['.product-detail', '.gallery', '.main-image', '.thumbnails', '.gallery-actions', '.dialog', '.dialog h2', '.dialog input', '.dialog .demo-note', '.zoom-overlay'] },
  { page: 'wallet', reference: '/#/wallet', visual: '/visual-v47.html?view=wallet', readiness: 'fresh prototype balance=2400; orders=[]; compare with production supplements hidden only by existing visualFixture; actual reference DOM has both breadcrumb and page heading',
    nodes: ['.breadcrumb', '.page-heading.compact', '.wallet-hero', '.wallet-hero h1', '.wallet-hero p', '.wallet-hero .button-row', '.stats-grid', '.stats-grid .paper', '.section-heading', '.transaction', '.muted.center'] },
  { page: 'catalog', reference: '/#/product/list', visual: null, readiness: 'visual entry /product/list still maps to HomeView; needs a dedicated read-only fixture before same-data pixel acceptance',
    nodes: ['.catalog-layout', '.catalog-categories', '.catalog-toolbar', '.catalog-content', '.product-grid', '.product-card'] },
  { page: 'login', reference: '/#/auth/login', visual: null, readiness: 'production additions include password visibility and real OAuth; compare shared art/form separately from added controls',
    nodes: ['.auth-layout', '.auth-art', '.auth-art img', '.auth-form', '.field', '.primary.full'] },
  { page: 'profile', reference: '/#/profile', visual: null, readiness: 'prototype guest page differs from production auth guard; match logged-in identity, balance, orders and VIP first',
    nodes: ['.profile-hero', '.profile-hero h1', '.order-shortcuts', '.profile-assets', '.service-grid'] },
  { page: 'buyer', reference: '/#/buyer/dashboard', visual: null, readiness: 'reference demo role and production approved buyer are different states; needs explicit read-only fixture',
    nodes: ['.buyer-workspace', '.buyer-sidebar', '.buyer-content', '.profile-hero', '.stats-grid', '.service-grid'] }
];
const pass = stylesheetOrderMatches && generatedCssMatches && stylesheetChecks.every(check => check.pass)
  && assets.every(check => check.pass) && runtimeChecks.every(check => check.referencePass && check.implementationPass)
  && fixture.records.length === products.length && !fixtureDrift.length && themeIdsMatch && Object.values(guards).every(Boolean);
const report = { checkedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Reference source/assets/readonly fixtures only. Not a browser pixel, motion or business acceptance result.',
  pass, stylesheetOrderMatches, generatedCssMatches, stylesheetChecks, assets, runtimeChecks,
  fixtures: { sourceProducts: products.length, implementationProducts: fixture.records.length, drift: fixtureDrift },
  themes: { pass: themeIdsMatch, ids: themeIds, priorities: ['web3-meme', 'navy-coral', 'web3-cyber'],
    visualQuery: 'Append &theme=navy-coral or &theme=web3-cyber; no saved palette is changed.' }, guards, views,
  conditions: { widths: [1920, 1440, 1024, 701, 700, 390, 320], align: ['same Chrome/window/viewport/DPR', 'same theme and local state', 'same scroll and loaded fonts/images', 'same screenshot pixel dimensions; never resized', 'default/hover/focus/open/disabled/error separately', 'motion samples at matching timestamps'] },
  knownContentDifferences: ['Share link is complete production URL instead of prototype hash, and production share footer copy differs.',
    'Gallery view has complete source images but is a component harness, not the full product page.',
    'Actual reference wallet DOM contains both breadcrumb and .page-heading.compact. The missing heading and wrapper-dependent spacing have been restored; browser revalidation and pixel evidence are recorded separately in design-qa.md, not established by this source audit.',
    'Only home/gallery/wallet are deterministic visual views. Other routes must not be counted as same-data accepted.'] };
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass, stylesheets: stylesheetChecks.length, assets: assets.length,
  products: products.length, themes: themeIds.length, report: relative(root, reportFile) }));
if (!pass) process.exitCode = 1;
