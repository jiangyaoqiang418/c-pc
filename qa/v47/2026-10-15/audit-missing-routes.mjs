/**
 * Offline engineering audit of the eight previously unvisited v47 routes.
 * No app/store initialization, network request, login, payment, or fixture injection.
 * Run from c-pc: node qa/v47/2026-10-15/audit-missing-routes.mjs --write
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse, compileScript, compileTemplate, compileStyleAsync } from 'vue/compiler-sfc';
import { createMemoryHistory, createRouter } from 'vue-router';

const outputDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDirectory, '../../..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');
const expected = [
  ['login-password', '/profile/login-password', 'src/views/profile/login-password.vue'],
  ['checkout-wallet-pay', '/checkout/wallet-pay/:orderGroupNo', 'src/views/checkout/wallet-pay.vue'],
  ['finance-detail', '/finance/:id', 'src/views/finance/detail.vue'],
  ['finance-lockup-detail', '/finance/lockup/:id', 'src/views/finance/lockup-detail.vue'],
  ['aftersale-create', '/aftersale/create/:orderId', 'src/views/aftersale/create.vue'],
  ['review-write', '/review/write/:orderId', 'src/views/review/write.vue'],
  ['im-order-group', '/im/order-group/:orderCode', 'src/views/im/order-group.vue'],
  ['buyer-product-edit', '/buyer/products/:id/edit', 'src/views/buyer/product-create.vue']
];

const routerSource = read('src/router/index.ts');
const routerAst = ts.createSourceFile('src/router/index.ts', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let routesNode;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(routerAst) === 'routes') routesNode = node.initializer;
  ts.forEachChild(node, visit);
}
visit(routerAst);
assert.ok(routesNode && ts.isArrayLiteralExpression(routesNode), 'Find the real router routes array');
const property = (node, key) => node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(routerAst) === key)?.initializer;
const literal = node => node && ts.isStringLiteralLike(node) ? node.text : undefined;
const routes = routesNode.elements.filter(ts.isObjectLiteralExpression).map(node => {
  const routePath = literal(property(node, 'path'));
  const name = literal(property(node, 'name'));
  const metaNode = property(node, 'meta');
  const requiresAuth = metaNode && property(metaNode, 'requiresAuth')?.kind === ts.SyntaxKind.TrueKeyword;
  const requiresBuyer = metaNode && property(metaNode, 'requiresBuyer')?.kind === ts.SyntaxKind.TrueKeyword;
  const component = property(node, 'component');
  assert.ok(component && ts.isArrowFunction(component) && ts.isCallExpression(component.body), `Dynamic component: ${name}`);
  const modulePath = literal(component.body.arguments[0]);
  assert.ok(modulePath?.startsWith('@/views/'), `Local view path: ${name}`);
  return { path: routePath, name, requiresAuth: !!requiresAuth, requiresBuyer: !!requiresBuyer, file: modulePath.replace('@/', 'src/') };
});

// Use the real Vue Router matcher with declared paths/meta, without importing pages or running guards.
const matcher = createRouter({ history: createMemoryHistory(), routes: routes.map(route => ({
  path: route.path, name: route.name, component: { render: () => null },
  meta: { requiresAuth: route.requiresAuth, requiresBuyer: route.requiresBuyer }
})) });
const routeResults = [];
for (const [name, routePath, file] of expected) {
  const route = routes.find(item => item.name === name);
  assert.ok(route, `${name} exists`);
  assert.equal(route.path, routePath, `${name}: path contract`);
  assert.equal(route.file, file, `${name}: component contract`);
  assert.equal(route.requiresAuth, true, `${name}: protected route`);
  assert.equal(route.requiresBuyer, name === 'buyer-product-edit', `${name}: buyer permission contract`);
  // This string is an offline matcher sentinel, never an API identifier or browser URL.
  const params = Object.fromEntries([...routePath.matchAll(/:(\w+)/g)].map(([, key]) => [key, '__OFFLINE_ROUTE_SENTINEL__']));
  const resolved = matcher.resolve({ name, params });
  const byPath = matcher.resolve(resolved.fullPath);
  assert.equal(byPath.name, name, `${name}: matching back from the resolved path`);
  assert.deepEqual({ ...byPath.params }, params, `${name}: string parameters preserved`);
  routeResults.push({ ...route, matcher: 'pass', authMeta: 'pass' });
}
for (const [url, name] of [
  ['/finance/my-lockups', 'finance-my-lockups'],
  ['/buyer/products/create', 'buyer-product-create'],
  ['/aftersale', 'aftersale-list']
]) assert.equal(matcher.resolve(url).name, name, `${url}: static route is not consumed by a parameter route`);

const compilerFiles = [...new Set(expected.map(([, , file]) => file)),
  'src/components/review/review-form.vue',
  'src/components/buyer/buyer-product-form.vue',
  'src/components/finance/interest-preview.vue',
  'src/components/finance/early-unlock-modal.vue',
  'src/components/im/message-input.vue',
  'src/components/aftersale/aftersale-evidence-uploader.vue'
];
const compiled = [];
for (const file of compilerFiles) {
  const filename = path.join(root, file);
  const source = read(file);
  const { descriptor, errors } = parse(source, { filename });
  assert.equal(errors.length, 0, `${file}: SFC parse`);
  const id = hash(file).slice(0, 8);
  const script = compileScript(descriptor, { id });
  const template = compileTemplate({
    source: descriptor.template.content, filename, id, scoped: descriptor.styles.some(style => style.scoped),
    compilerOptions: { bindingMetadata: script.bindings }
  });
  assert.equal(template.errors.length, 0, `${file}: template compilation: ${template.errors.join(', ')}`);
  const styles = [];
  for (const style of descriptor.styles) {
    const stylePath = style.src ? path.resolve(path.dirname(filename), style.src) : filename;
    const styleSource = style.src ? readFileSync(stylePath, 'utf8') : style.content;
    assert.ok(!style.lang || style.lang === 'css', `${file}: unsupported preprocessor needs its real compiler`);
    const result = await compileStyleAsync({ filename: stylePath, source: styleSource, id: `data-v-${id}`, scoped: !!style.scoped });
    assert.equal(result.errors.length, 0, `${file}: CSS compilation: ${result.errors.join(', ')}`);
    styles.push({ file: path.relative(root, stylePath).replaceAll('\\', '/'), sha256: hash(styleSource), scoped: !!style.scoped });
  }
  compiled.push({ file, sha256: hash(source), script: 'pass', template: 'pass', styles });
}

// These source anchors record the precise entry/write distinction found by manual call-chain review.
// They are not runtime business or visual assertions; changes invalidate the evidence for re-review.
const anchors = [
  ['src/router/index.ts', 'if (to.meta.requiresAuth && !userStore.isLoggedIn)', 'Unauthenticated protected routes redirect to login.'],
  ['src/router/index.ts', 'if (to.meta.requiresBuyer)', 'Buyer edit has an additional role guard.'],
  ['src/views/profile/login-password.vue', 'await userStore.refreshCurrentUser({ deferAccount: true });', 'Password entry reads current status; an existing password redirects away.'],
  ['src/views/checkout/wallet-pay.vue', "if (saved?.txHash && result.status === 'PENDING') void retryReport();", 'Wallet entry can auto-report a saved hash; not unconditionally read-only.'],
  ['src/views/checkout/wallet-pay.vue', "if (current.status === 'SUCCESS') void settleSuccess(current);", 'Success entry performs checkout/cart cleanup and redirects.'],
  ['src/views/finance/detail.vue', 'onMounted(() => {', 'Entry loads product/wallet and reads pending state; does not restore the purchase automatically.'],
  ['src/views/finance/detail.vue', 'async function restoreSubscription()', 'Explicit restore may resend the original keyed subscription after lookup.'],
  ['src/views/finance/lockup-detail.vue', 'onMounted(load);', 'Holding entry reads the existing finance order.'],
  ['src/views/aftersale/create.vue', 'pendingIntent.value = readRefundIntent(userId, orderId.value);', 'Refund entry reads local intent without replaying it.'],
  ['src/views/review/write.vue', 'onMounted(load);', 'Review entry reads order eligibility; submit/restore require explicit confirmation.'],
  ['src/views/buyer/product-create.vue', "if (p.rawStatus !== 'OFF_SHELF' && p.rawStatus !== 'REJECTED')", 'Editing requires an owned off-shelf/rejected product.'],
  ['src/views/buyer/product-create.vue', "if (String(p.sellerId) !== String(userStore.currentUser?.id))", 'The fetched product must belong to the current user.'],
  ['src/views/buyer/product-create.vue', 'p.imageFiles.length !== p.images.length', 'Image file metadata must be complete before edit form mounts.'],
  ['src/service/api/notify.ts', "realNotifyRequest.get<Api.RealNotify.ImConversationVO>('/im/conversations/by-order'", 'Order conversation lookup is GET, with orderId rather than displayed order number.'],
  ['src/service/api/notify.ts', '{ ...params, markRead: false }', 'Message page query itself requests no read marking.'],
  ['src/views/im/order-group.vue', 'void reportRead();', 'Scrolling to the latest visible message can mark it read.'],
  ['src/service/api/notify.ts', "('/im/messages/read', params, notifyRequestOptions)", 'Read marking is a separate PUT side effect.']
].map(([file, needle, meaning]) => {
  const source = read(file);
  const index = source.indexOf(needle);
  assert.ok(index >= 0, `${file}: audit anchor changed: ${needle}`);
  return { file, line: source.slice(0, index).split('\n').length, meaning };
});

const report = {
  generatedAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Offline source engineering checks only. No Chrome, network, real data, write, pixel, animation or auth-session acceptance.',
  counts: { routes: routeResults.length, sfcFiles: compiled.length, guardedSourceAnchors: anchors.length },
  routes: routeResults, compiled, anchors,
  result: 'pass',
  realRouteAcceptance: 'not-performed',
  pixelAcceptance: 'not-performed',
  writeAcceptance: 'not-performed'
};
if (process.argv.includes('--write')) writeFileSync(path.join(outputDirectory, 'missing-route-source-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${routeResults.length} real route contracts, ${compiled.length} SFC script/template/style compilations, ${anchors.length} reviewed source anchors.`);
console.log('Boundary: offline source audit; real-data Chrome/pixel/animation/write acceptance remains separate.');
