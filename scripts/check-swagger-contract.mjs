const swaggerBaseUrl = (process.env.CPC_SWAGGER_BASE_URL || 'https://testhou.merchantsale.store/api').replace(/\/$/, '');

const groups = {
  admin: `${swaggerBaseUrl}/admin/v3/api-docs`,
  user: `${swaggerBaseUrl}/user/v3/api-docs`,
  order: `${swaggerBaseUrl}/order/v3/api-docs`,
  notify: `${swaggerBaseUrl}/notify/v3/api-docs`
};

async function fetchJson(name, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name} Swagger 请求失败：HTTP ${response.status}`);
  return response.json();
}

function resolveSchema(document, schema) {
  let resolved = schema;
  const visited = new Set();
  while (resolved?.$ref) {
    if (visited.has(resolved.$ref)) throw new Error(`检测到循环引用：${resolved.$ref}`);
    visited.add(resolved.$ref);
    const name = resolved.$ref.replace('#/components/schemas/', '');
    resolved = document.components?.schemas?.[name];
  }
  return resolved;
}

function operation(document, path, method) {
  const item = document.paths?.[path];
  const result = item?.[method];
  if (!result) throw new Error(`缺少契约：${method.toUpperCase()} ${path}`);
  return result;
}

function requestSchema(document, operationDefinition) {
  const schema = operationDefinition.requestBody?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`缺少 application/json 请求体：${operationDefinition.summary || '未命名操作'}`);
  return resolveSchema(document, schema);
}

function expectRequired(schema, fields, label) {
  const required = new Set(schema.required || []);
  const missing = fields.filter(field => !required.has(field));
  if (missing.length) throw new Error(`${label} 缺少必填字段：${missing.join(', ')}`);
}

function expectProperties(schema, fields, label) {
  const missing = fields.filter(field => !schema.properties?.[field]);
  if (missing.length) throw new Error(`${label} 缺少字段：${missing.join(', ')}`);
}

function countOperations(document) {
  return Object.values(document.paths || {}).reduce(
    (total, pathItem) => total + Object.keys(pathItem).filter(key => ['get', 'post', 'put', 'delete', 'patch'].includes(key)).length,
    0
  );
}

const [admin, user, order] = await Promise.all([
  fetchJson('admin', groups.admin),
  fetchJson('user', groups.user),
  fetchJson('order', groups.order)
]);

const createBatch = operation(order, '/orders/create-batch', 'post');
const createBatchRequest = requestSchema(order, createBatch);
expectRequired(createBatchRequest, ['addressId', 'items'], '合并下单');

const createBatchResponse = resolveSchema(
  order,
  createBatch.responses?.['200']?.content?.['*/*']?.schema
);
const orderGroup = resolveSchema(order, createBatchResponse?.properties?.data);
expectProperties(orderGroup, ['orderGroupNo', 'orderIds'], '合并下单响应');

const groupPay = requestSchema(order, operation(order, '/orders/group/pay', 'post'));
expectRequired(groupPay, ['orderGroupNo'], '订单组支付');

const ship = requestSchema(order, operation(order, '/orders/ship', 'post'));
expectRequired(ship, ['id', 'logisticsCompany', 'trackingNo'], '买手发货');

[
  ['/addresses/list', 'get'],
  ['/addresses/create', 'post'],
  ['/addresses/update', 'put'],
  ['/addresses/default', 'put'],
  ['/addresses/delete', 'delete']
].forEach(([path, method]) => operation(user, path, method));

const notifyResponse = await fetch(groups.notify);
if (notifyResponse.status !== 404) throw new Error(`notify Swagger 预期为 HTTP 404，实际为 ${notifyResponse.status}`);

for (const [name, document] of Object.entries({ admin, user, order })) {
  const schemas = Object.keys(document.components?.schemas || {}).length;
  console.log(`${name}: ${Object.keys(document.paths || {}).length} paths, ${countOperations(document)} operations, ${schemas} schemas`);
}
console.log('notify: HTTP 404（当前后端未提供通知 Swagger）');
console.log('关键 C 端契约检查通过：地址、合并下单、订单组支付、买手发货。');
