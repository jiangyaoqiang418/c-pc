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

function responseDataSchema(document, operationDefinition) {
  const wrapper = resolveSchema(document, operationDefinition.responses?.['200']?.content?.['*/*']?.schema);
  if (!wrapper) throw new Error(`缺少成功响应：${operationDefinition.summary || '未命名操作'}`);
  return resolveSchema(document, wrapper.properties?.data);
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

function expectParameters(operationDefinition, names, label) {
  const actual = new Map((operationDefinition.parameters || []).map(parameter => [parameter.name, parameter]));
  const missing = names.filter(name => !actual.has(name));
  if (missing.length) throw new Error(`${label} 缺少参数：${missing.join(', ')}`);
}

function expectParameterEnum(operationDefinition, name, values, label) {
  const parameter = (operationDefinition.parameters || []).find(item => item.name === name);
  const actual = parameter?.schema?.enum || [];
  const missing = values.filter(value => !actual.includes(value));
  if (missing.length) throw new Error(`${label} 的 ${name} 枚举缺少：${missing.join(', ')}`);
}

function expectEnum(schema, field, values, label) {
  const actual = schema.properties?.[field]?.enum || [];
  const missing = values.filter(value => !actual.includes(value));
  if (missing.length) throw new Error(`${label} 的 ${field} 枚举缺少：${missing.join(', ')}`);
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

const login = requestSchema(user, operation(user, '/auth/login', 'post'));
expectRequired(login, ['email', 'password'], '邮箱登录');
operation(user, '/auth/me', 'get');

operation(user, '/recharge/address', 'get');
const rechargeCancel = requestSchema(user, operation(user, '/recharge/cancel', 'put'));
expectRequired(rechargeCancel, ['id'], '取消充值申报');
operation(user, '/points/rules', 'get');
operation(user, '/points/vip-configs', 'get');
const withdrawDetail = responseDataSchema(user, operation(user, '/withdraw/detail', 'get'));
expectProperties(withdrawDetail, ['id', 'amount', 'fee', 'actualAmount', 'status', 'paidAt', 'confirmedAt'], '提现详情响应');
operation(user, '/kyc/files/upload', 'post');
operation(user, '/kyc/files/access', 'get');
const kycSubmit = requestSchema(user, operation(user, '/kyc/submit', 'post'));
expectRequired(kycSubmit, ['idCardFrontFileId', 'idNo', 'idType', 'realName'], 'KYC 提交');
const kycDetail = responseDataSchema(user, operation(user, '/kyc/detail', 'get'));
expectProperties(kycDetail, ['idCardFrontFileId', 'idCardBackFileId', 'holdingPhotoFileId', 'photoUrlExpireAt'], 'KYC 详情');
['/finance/products/list', '/finance/products/detail', '/finance/orders/overview', '/finance/orders/detail'].forEach(path => operation(user, path, 'get'));
const financeSubscribe = requestSchema(user, operation(user, '/finance/orders/subscribe', 'post'));
expectRequired(financeSubscribe, ['productId', 'amount'], '理财申购');
const financeRedeem = requestSchema(user, operation(user, '/finance/orders/redeem', 'post'));
expectRequired(financeRedeem, ['id'], '理财提前赎回');
operation(user, '/finance/orders/page', 'post');

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
expectRequired(ship, ['carrier', 'id', 'trackingNo'], '买手发货');
expectProperties(ship, ['carrier', 'carrierName', 'trackingNo', 'eta', 'purchaseNo', 'purchaseVouchers', 'shipVouchers', 'remark'], '买手发货');
operation(order, '/files/upload', 'post');
const orderUpload = operation(order, '/files/upload', 'post');
expectParameters(orderUpload, ['scene'], 'order 文件上传');
expectParameterEnum(orderUpload, 'scene', ['PRODUCT', 'DEMAND', 'REVIEW', 'ORDER_VOUCHER'], 'order 文件上传');
const logistics = responseDataSchema(order, operation(order, '/orders/logistics', 'get'));
expectProperties(logistics, ['logisticsStatus', 'carrier', 'trackingNo', 'tracks'], '订单物流');
expectEnum(logistics, 'logisticsStatus', ['PENDING_SHIPMENT', 'SHIPPED', 'IN_TRANSIT', 'DELIVERING', 'SIGNED', 'EXCEPTION', 'RETURNED'], '订单物流');
const logisticsTrack = requestSchema(order, operation(order, '/orders/logistics/track/create', 'post'));
expectRequired(logisticsTrack, ['description', 'orderId', 'status'], '物流轨迹登记');
const logisticsException = requestSchema(order, operation(order, '/orders/logistics/exception/mark', 'put'));
expectRequired(logisticsException, ['exception', 'orderId'], '物流异常标记');

const confirmReceipt = requestSchema(order, operation(order, '/orders/confirm', 'post'));
expectRequired(confirmReceipt, ['id'], '确认收货');

const orderDetail = operation(order, '/orders/detail', 'get');
const orderDetailResponse = resolveSchema(order, orderDetail.responses?.['200']?.content?.['*/*']?.schema);
const orderDetailDto = resolveSchema(order, orderDetailResponse?.properties?.data);
expectProperties(
  orderDetailDto,
  ['receiverName', 'receiverPhone', 'country', 'province', 'city', 'district', 'detailAddress', 'logisticsCompanyCode', 'trackingNo', 'logisticsStatus', 'eta', 'purchaseNo', 'purchaseVouchers', 'shipVouchers', 'paymentBizNo', 'refundId', 'refundStatus', 'refundAmount'],
  '订单详情'
);

const refundApply = requestSchema(order, operation(order, '/orders/refunds/create', 'post'));
expectRequired(refundApply, ['orderId', 'reason'], '仅退款申请');
const refundCancel = requestSchema(order, operation(order, '/orders/refunds/cancel', 'post'));
expectRequired(refundCancel, ['refundId'], '撤销仅退款');
operation(order, '/orders/refunds/bought/page', 'post');
operation(order, '/orders/refunds/sold/page', 'post');
operation(order, '/orders/refunds/detail', 'get');

['/reviews/reviewable/page', '/reviews/mine/page', '/reviews/received/page', '/reviews/appeals/mine/page', '/storefront/reviews/page'].forEach(path => operation(order, path, 'post'));
['/reviews/detail', '/storefront/reviews/summary', '/storefront/reviews/seller-rating'].forEach(path => operation(order, path, 'get'));
const reviewCreate = requestSchema(order, operation(order, '/reviews/create', 'post'));
expectRequired(reviewCreate, ['orderId', 'productScore', 'sellerScore'], '提交评价');
const reviewReply = requestSchema(order, operation(order, '/reviews/reply', 'put'));
expectRequired(reviewReply, ['reviewId', 'content'], '买手回复评价');
const reviewAppeal = requestSchema(order, operation(order, '/reviews/appeals/create', 'post'));
expectRequired(reviewAppeal, ['reviewId', 'reason'], '买手评价申诉');
operation(order, '/reviews/delete', 'delete');
const reviewDetail = operation(order, '/reviews/detail', 'get');
expectParameters(reviewDetail, ['id'], '评价详情');

const createDemand = requestSchema(order, operation(order, '/demands/create', 'post'));
expectRequired(
  createDemand,
  ['addressId', 'afterSaleType', 'budget', 'categoryId', 'demandNote', 'expectDeliveryDays', 'title'],
  '发起求购'
);
const demandDetail = responseDataSchema(order, operation(order, '/demands/detail', 'get'));
expectProperties(demandDetail, ['status', 'statusText', 'reviewComment', 'reviewedAt'], '求购状态与审核信息');
const demandCancel = requestSchema(order, operation(order, '/demands/cancel', 'post'));
expectRequired(demandCancel, ['id'], '取消求购');
expectProperties(demandCancel, ['reason'], '取消求购');

const grabDemand = requestSchema(order, operation(order, '/demands/grab', 'post'));
expectRequired(grabDemand, ['id'], '抢单');

[
  ['/addresses/list', 'get'],
  ['/addresses/create', 'post'],
  ['/addresses/update', 'put'],
  ['/addresses/default', 'put'],
  ['/addresses/delete', 'delete']
].forEach(([path, method]) => operation(user, path, method));

const notifyResponse = await fetch(groups.notify);
let notifySummary;
if (notifyResponse.status === 404) {
  notifySummary = 'notify: HTTP 404（当前后端未提供通知 Swagger）';
} else {
  if (!notifyResponse.ok) throw new Error(`notify Swagger 请求失败：HTTP ${notifyResponse.status}`);
  const notify = await notifyResponse.json();
  [
    ['/notifications/page', 'post'],
    ['/notifications/unread/count', 'get'],
    ['/notifications/delete', 'delete'],
    ['/notifications/clear', 'delete'],
    ['/im/conversations/page', 'post'],
    ['/im/messages/page', 'post'],
    ['/im/messages/incr', 'get'],
    ['/im/messages/read', 'put'],
    ['/im/messages/recall', 'put'],
    ['/im/unread/count', 'get'],
    ['/im/conversations/delete', 'delete']
  ].forEach(([path, method]) => operation(notify, path, method));
  const markRead = requestSchema(notify, operation(notify, '/notifications/read', 'put'));
  expectRequired(markRead, ['id'], '标记通知已读');
  const messagePage = requestSchema(notify, operation(notify, '/im/messages/page', 'post'));
  expectRequired(messagePage, ['conversationId'], '会话消息分页');
  const sendMessage = requestSchema(notify, operation(notify, '/im/messages/send', 'post'));
  expectRequired(sendMessage, ['conversationId', 'msgType'], '发送会话消息');
  expectProperties(sendMessage, ['content', 'mediaFileId', 'clientMsgId'], '发送会话消息');
  operation(notify, '/im/files/upload', 'post');
  expectParameterEnum(operation(notify, '/im/files/upload', 'post'), 'scene', ['IM_IMAGE', 'IM_VOICE'], 'IM 文件上传');
  const sendMessageResponse = responseDataSchema(notify, operation(notify, '/im/messages/send', 'post'));
  expectProperties(sendMessageResponse, ['id', 'conversationId', 'msgType', 'clientMsgId', 'recalled'], '发送消息响应');
  const readMessage = requestSchema(notify, operation(notify, '/im/messages/read', 'put'));
  expectRequired(readMessage, ['conversationId', 'lastReadMessageId'], '消息已读');
  const recallMessage = requestSchema(notify, operation(notify, '/im/messages/recall', 'put'));
  expectRequired(recallMessage, ['id'], '消息撤回');
  const conversationSchema = notify.components?.schemas?.ImConversationVO;
  expectProperties(conversationSchema, ['lastReadMessageId', 'peerName', 'orderNo', 'orderStatusText', 'productTitle', 'amount'], '会话响应');
  const messageSchema = notify.components?.schemas?.ImMessageVO;
  expectProperties(messageSchema, ['senderName', 'senderAvatar', 'eventType', 'params', 'clientMsgId', 'recalled'], '消息响应');
  const notificationSchema = notify.components?.schemas?.NotificationVO;
  expectProperties(notificationSchema, ['bizType', 'bizId', 'templateCode', 'readFlag'], '站内通知响应');
  operation(notify, '/notifications/read-all', 'put');
  operation(notify, '/im/conversations/by-order', 'get');
  operation(notify, '/back/im/status', 'get');
  notifySummary = `notify: ${Object.keys(notify.paths || {}).length} paths, ${countOperations(notify)} operations, ${Object.keys(notify.components?.schemas || {}).length} schemas`;
}

for (const [name, document] of Object.entries({ admin, user, order })) {
  const schemas = Object.keys(document.components?.schemas || {}).length;
  console.log(`${name}: ${Object.keys(document.paths || {}).length} paths, ${countOperations(document)} operations, ${schemas} schemas`);
}
console.log(notifySummary);
console.log('关键 C 端契约检查通过：登录、测试充值到账、地址、订单、仅退款、合并下单、订单组支付、买手发货、确认收货、发起求购、抢单和通知/IM。');
