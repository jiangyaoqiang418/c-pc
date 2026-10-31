const swaggerBaseUrl = (process.env.CPC_SWAGGER_BASE_URL || 'https://testhou.merchantsale.store/api').replace(/\/$/, '');

const groups = {
  admin: `${swaggerBaseUrl}/admin/v3/api-docs`,
  user: `${swaggerBaseUrl}/user/v3/api-docs`,
  order: `${swaggerBaseUrl}/order/v3/api-docs`,
  notify: `${swaggerBaseUrl}/notify/v3/api-docs`
};

async function fetchJson(name, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
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

function expectFieldType(schema, field, type, label, format) {
  const property = schema?.properties?.[field];
  if (property?.type !== type || (format && property.format !== format)) {
    throw new Error(`${label} 的 ${field} 类型应为 ${type}${format ? `/${format}` : ''}`);
  }
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

const unavailable = [];
const [admin, user, order] = await Promise.all([
  fetchJson('admin', groups.admin),
  fetchJson('user', groups.user).catch(error => { unavailable.push(error.message); return undefined; }),
  fetchJson('order', groups.order)
]);

if (user) {
const login = requestSchema(user, operation(user, '/auth/login', 'post'));
expectRequired(login, ['email', 'password'], '邮箱登录');
operation(user, '/auth/me', 'get');

const rechargeAddress = operation(user, '/recharge/address', 'get');
const addressAsset = rechargeAddress.parameters?.find(parameter => parameter.name === 'asset');
if (!addressAsset || addressAsset.required === true || addressAsset.schema?.type !== 'string' || addressAsset.schema?.default !== 'USDT') {
  throw new Error('充值地址 asset 应为可选字符串，默认 USDT');
}
for (const path of ['/recharge/create', '/recharge/page']) {
  const schema = requestSchema(user, operation(user, path, 'post'));
  const asset = schema.properties?.asset;
  if (schema.required?.includes('asset') || asset?.type !== 'string' || asset.default !== 'USDT'
    || asset.enum?.length !== 2 || !['USDT', 'USDC'].every(value => asset.enum.includes(value))) {
    throw new Error(`${path} asset 应为可选字符串，默认 USDT，支持 USDT/USDC`);
  }
}
const rechargeAssets = responseDataSchema(user, operation(user, '/recharge/assets', 'get'));
expectProperties(resolveSchema(user, rechargeAssets.items), ['asset', 'chain', 'enabled', 'methods', 'tokenContract', 'decimals', 'minAmount', 'minConfirmations', 'walletNetwork', 'memoRule'], '充值资产矩阵');
expectProperties(responseDataSchema(user, operation(user, '/recharge/detail', 'get')), ['asset', 'chain', 'source', 'reportedTxHash', 'logIndex', 'tokenContract', 'confirmations', 'minConfirmations'], '充值记录关联');
const rechargeCancel = requestSchema(user, operation(user, '/recharge/cancel', 'put'));
expectRequired(rechargeCancel, ['id'], '取消充值申报');
operation(user, '/points/rules', 'get');
const pointRuleSchema = user.components?.schemas?.PointRuleItemVO;
expectProperties(pointRuleSchema, ['defaultScore', 'defaultDailyCap', 'defaultCumulativeCap', 'defaultEnabled'], '积分规则默认值');
operation(user, '/points/vip-configs', 'get');
const withdrawDetail = responseDataSchema(user, operation(user, '/withdraw/detail', 'get'));
expectProperties(withdrawDetail, ['id', 'asset', 'amount', 'fee', 'actualAmount', 'status', 'paidAt', 'confirmedAt'], '提现详情响应');
for (const path of ['/wallet/overview', '/withdraw/chains']) {
  const op = operation(user, path, 'get');
  expectParameters(op, ['asset'], path);
  const parameter = op.parameters.find(item => item.name === 'asset');
  if (parameter.schema?.type !== 'string' || parameter.schema.default !== 'USDT') throw new Error(`${path} 资产契约变化`);
}
const withdrawChains = responseDataSchema(user, operation(user, '/withdraw/chains', 'get'));
expectProperties(resolveSchema(user, withdrawChains.items), ['asset', 'chain', 'label', 'decimals', 'enabled', 'minAmount', 'maxAmount', 'estimatedNetworkFee'], '提现网络配置');
const withdrawFee = operation(user, '/withdraw/fee-preview', 'post');
expectRequired(requestSchema(user, withdrawFee), ['chain', 'tokenSymbol', 'toAddress', 'amount'], '提现网络费预览');
expectEnum(requestSchema(user, withdrawFee), 'tokenSymbol', ['USDT', 'USDC'], '提现网络费资产');
expectProperties(responseDataSchema(user, withdrawFee), ['chain', 'tokenSymbol', 'estimatedNetworkFee', 'networkFeeSymbol', 'expiresAt', 'isEstimate'], '提现网络费结果');
for (const path of ['/withdraw/create', '/withdraw/page']) expectProperties(requestSchema(user, operation(user, path, 'post')), ['asset'], path);
const aiStream = operation(user, '/ai/customer-service/chat/stream', 'post');
const aiInput = requestSchema(user, aiStream);
if (aiInput.required?.includes('message')) throw new Error('AI 纯图片消息不应强制 message 必填');
expectProperties(aiInput, ['message', 'imageFileIds', 'conversationId', 'clientMessageId'], 'AI 客服会话');
if (aiInput.properties.imageFileIds.maxItems !== 3) throw new Error('AI 图片上限变化');
expectProperties(responseDataSchema(user, operation(user, '/ai/customer-service/welcome', 'get')), ['message'], 'AI 欢迎语');
operation(user, '/ai/customer-service/images/upload', 'post');
expectParameters(operation(user, '/ai/customer-service/images/access', 'get'), ['fileId'], 'AI 图片续签');
expectParameters(operation(admin, '/ai/customer-service/images/access', 'get'), ['fileId', 'reason'], '后台 AI 图片续签');
expectProperties(requestSchema(order, operation(order, '/storefront/search/images/page', 'post')), ['fileId', 'hint', 'pageNo', 'pageSize'], '识图分页');
// id 的必填采用服务端更新校验组，OpenAPI 未标为全局 required。
expectProperties(requestSchema(order, operation(order, '/demands/update', 'put')), ['id', 'addressId'], '驳回求购重新提交');
for (const [path, method] of [['/products/create', 'post'], ['/products/update', 'put']]) {
  const input = requestSchema(order, operation(order, path, method));
  expectProperties(input, ['categoryId', 'categoryIds', 'parameters'], '商品分类与参数');
  expectRequired(input, ['categoryId'], '商品主分类');
  expectFieldType(input, 'categoryId', 'integer', '商品主分类', 'int64');
  expectFieldType(input, 'categoryIds', 'array', '商品多分类');
  const ids = input.properties.categoryIds;
  if (ids.maxItems !== 20 || ids.items?.type !== 'integer' || ids.items?.format !== 'int64') throw new Error('商品多分类上限或ID类型变化');
}
for (const [document, label] of [[order, '顾客/买手商品详情'], [admin, '后台商品详情']]) {
  const detail = responseDataSchema(document, operation(document, '/products/detail', 'get'));
  expectProperties(detail, ['categoryId', 'categories'], label);
  expectFieldType(detail, 'categories', 'array', label);
}
expectProperties(admin.components?.schemas?.ProductSnapshotDTO, ['categoryId', 'categories'], '商品审核快照');
if (aiInput.properties.message.maxLength !== 2000 || !aiStream.responses?.['200']?.content?.['text/event-stream']) throw new Error('AI 客服流式契约变化');
for (const path of ['/sessions/list', '/messages/list']) {
  const op = operation(user, `/ai/customer-service${path}`, 'post');
  expectProperties(requestSchema(user, op), ['cursor', 'limit'], `AI ${path} 查询`);
  const page = responseDataSchema(user, op);
  expectProperties(page, ['rows', 'hasMore', 'nextCursor'], `AI ${path} 分页`);
  expectFieldType(page, 'hasMore', 'boolean', `AI ${path} 分页`);
}
const aiMessages = operation(user, '/ai/customer-service/messages/list', 'post');
expectRequired(requestSchema(user, aiMessages), ['conversationId'], 'AI 历史消息');
expectProperties(resolveSchema(user, responseDataSchema(user, aiMessages).properties.rows.items),
  ['messageId', 'requestId', 'clientMessageId', 'role', 'content', 'structuredData', 'status', 'images'], 'AI 消息');
const aiActivate = operation(user, '/ai/customer-service/sessions/activate', 'put');
expectRequired(requestSchema(user, aiActivate), ['conversationId'], 'AI 切换会话');
for (const op of [aiActivate, operation(user, '/ai/customer-service/sessions/create', 'post')]) {
  expectProperties(responseDataSchema(user, op), ['conversationId', 'current'], 'AI 当前会话');
}
operation(user, '/kyc/files/upload', 'post');
operation(user, '/kyc/files/access', 'get');
const kycSubmit = requestSchema(user, operation(user, '/kyc/submit', 'post'));
expectRequired(kycSubmit, ['idCardFrontFileId', 'idNo', 'idType', 'realName'], 'KYC 提交');
const kycDetail = responseDataSchema(user, operation(user, '/kyc/detail', 'get'));
expectProperties(kycDetail, ['idCardFrontFileId', 'idCardBackFileId', 'holdingPhotoFileId', 'photoUrlExpireAt'], 'KYC 详情');
['/finance/products/list', '/finance/products/detail', '/finance/orders/overview', '/finance/orders/detail'].forEach(path => operation(user, path, 'get'));
const financeSubscribe = requestSchema(user, operation(user, '/finance/orders/subscribe', 'post'));
expectProperties(responseDataSchema(user, operation(user, '/finance/orders/overview', 'get')), ['dailyExpectedInterest', 'estimatedAt', 'estimateUntil'], '每日预估利息');
expectRequired(financeSubscribe, ['productId', 'amount'], '理财申购');
const financeRedeem = requestSchema(user, operation(user, '/finance/orders/redeem', 'post'));
expectRequired(financeRedeem, ['id'], '理财提前赎回');
operation(user, '/finance/orders/page', 'post');
for (const path of ['/withdraw', '/recharge', '/finance/orders']) {
  const createPath = path === '/finance/orders' ? `${path}/subscribe` : `${path}/create`;
  const create = requestSchema(user, operation(user, createPath, 'post'));
  expectFieldType(create, 'idempotencyKey', 'string', createPath);
  if (create.properties.idempotencyKey.maxLength !== 64) throw new Error(`${createPath} 幂等键长度契约变更`);
  const lookup = operation(user, `${path}/by-key`, 'get');
  const key = lookup.parameters?.find(parameter => parameter.name === 'idempotencyKey');
  if (!key?.required || key.schema?.type !== 'string') throw new Error(`${path}/by-key 缺少必填字符串幂等键`);
  expectProperties(responseDataSchema(user, lookup), path === '/finance/orders' ? ['id', 'productId', 'principal'] : ['id', 'chain', 'amount', ...(path === '/withdraw' ? ['toAddress'] : [])], `${path}/by-key`);
}
const kycConfig = responseDataSchema(user, operation(user, '/kyc/schema', 'get'));
expectProperties(kycConfig, ['version', 'allowedIdTypes', 'nationalityRequired', 'idCardBackRequired', 'holdingPhotoRequired', 'resubmitAfterRejectAllowed', 'noticeText', 'updatedAt'], 'KYC 配置');
expectFieldType(kycConfig, 'version', 'integer', 'KYC 配置', 'int32');
for (const field of ['nationalityRequired', 'idCardBackRequired', 'holdingPhotoRequired', 'resubmitAfterRejectAllowed']) expectFieldType(kycConfig, field, 'boolean', 'KYC 配置');
expectFieldType(kycConfig, 'allowedIdTypes', 'array', 'KYC 配置');
if (kycConfig.properties.allowedIdTypes.items?.type !== 'string') throw new Error('KYC 证件类型必须为字符串数组');
expectEnum(kycSubmit, 'idType', ['ID_CARD', 'PASSPORT'], 'KYC 提交');
expectProperties(requestSchema(user, operation(user, '/wallet/ledger/page', 'post')), ['currency', 'balanceType', 'keyword', 'startAt', 'endAt'], '钱包全量筛选');
expectProperties(requestSchema(user, operation(user, '/points/ledger/page', 'post')), ['behaviorCodes', 'earned', 'startAt', 'endAt'], '积分全量筛选');
for (const path of ['/wallet/ledger/page', '/points/ledger/page']) {
  const query = requestSchema(user, operation(user, path, 'post'));
  for (const field of ['startAt', 'endAt']) expectFieldType(query, field, 'integer', path, 'int64');
  if (path.includes('/points/')) {
    expectFieldType(query, 'earned', 'boolean', path);
    expectFieldType(query, 'behaviorCodes', 'array', path);
    if (query.properties.behaviorCodes.items?.type !== 'string') throw new Error('积分行为必须为字符串数组');
  } else {
    for (const field of ['balanceType', 'keyword']) expectFieldType(query, field, 'string', path);
  }
}
}

const createBatch = operation(order, '/orders/create-batch', 'post');
const createBatchRequest = requestSchema(order, createBatch);
expectRequired(createBatchRequest, ['addressId', 'items'], '合并下单');

const createBatchResponse = resolveSchema(
  order,
  createBatch.responses?.['200']?.content?.['*/*']?.schema
);
const orderGroup = resolveSchema(order, createBatchResponse?.properties?.data);
expectProperties(orderGroup, ['orderGroupNo', 'orderIds'], '合并下单响应');

const creationLookup = operation(order, '/orders/by-key', 'get');
const creationKey = creationLookup.parameters?.find(parameter => parameter.name === 'idempotencyKey');
if (!creationKey?.required || creationKey.schema?.type !== 'string') throw new Error('下单原键只读回查缺少必填字符串键');
const creation = responseDataSchema(order, creationLookup);
expectProperties(creation, ['status', 'orderGroupNo', 'orderIds', 'rejectionCode', 'rejectionMessage'], '下单原键结果');
expectEnum(creation, 'status', ['NOT_FOUND', 'PROCESSING', 'CREATED', 'REJECTED'], '下单原键结果');
for (const schemaName of ['OrderCreateQO', 'OrderCreateItemQO']) {
  expectProperties(order.components?.schemas?.[schemaName], ['skuId', 'confirmedUnitPrice'], schemaName);
}

const productDto = order.components?.schemas?.ProductDTO;
expectProperties(productDto, ['imageFiles'], '商品编辑原图');
expectProperties(productDto, ['hasSku', 'specGroups', 'skus', 'brandId', 'brand'], '商品真实规格与品牌');
expectProperties(resolveSchema(order, productDto.properties.skus.items), ['id', 'specs', 'price', 'stock', 'enabled', 'image'], '真实 SKU');
expectProperties(order.components?.schemas?.OrderDTO, ['skuId', 'skuSpecs', 'stage', 'canProcure', 'canShip', 'canConfirmAftersale'], '订单规格与操作资格');
expectEnum(order.components?.schemas?.OrderDTO, 'stage', ['PROCURING', 'PROCURED', 'AFTERSALE_CONFIRM', 'REFUND_REVIEW'], '订单权威阶段');
expectProperties(order.components?.schemas?.OrderPageQuery, ['stage', 'orderNo', 'productTitle'], '订单阶段与搜索');
operation(order, '/storefront/brands/page', 'post');
expectParameters(operation(order, '/storefront/brands/detail', 'get'), ['id'], '品牌详情');
expectProperties(order.components?.schemas?.PublicProductPageQuery, ['brandId'], '品牌商品筛选');
expectRequired(requestSchema(order, operation(order, '/products/favorites/status', 'post')), ['productIds'], '本人收藏状态');
expectProperties(resolveSchema(order, responseDataSchema(order, operation(order, '/products/favorites/status', 'post')).items), ['productId', 'favorited'], '本人收藏状态响应');
expectProperties(responseDataSchema(order, operation(order, '/storefront/sellers/qualification', 'get')), ['sellerId', 'verifiedBuyer', 'approvedAt'], '卖家资格');
operation(order, '/products/update', 'put');
expectRequired(requestSchema(order, operation(order, '/products/price', 'put')), ['id', 'price'], '快捷改价');
expectProperties(productDto, ['sellerName', 'categoryName', 'reviewerId', 'reviewedAt'], '商品详情审核信息');

const groupPay = requestSchema(order, operation(order, '/orders/group/pay', 'post'));
expectRequired(groupPay, ['orderGroupNo', 'confirmedAmount'], '订单组支付');
expectRequired(requestSchema(order, operation(order, '/orders/pay', 'post')), ['id', 'confirmedAmount'], '单笔支付');
for (const [path, method] of [['/orders/group/pay', 'post'], ['/orders/group/pay-result', 'get']]) {
  const result = responseDataSchema(order, operation(order, path, method));
  expectProperties(result, ['orderGroupNo', 'totalCount', 'paidCount', 'failedCount', 'paidAmount', 'unpaidAmount', 'items'], path);
  expectProperties(resolveSchema(order, result.properties.items.items), ['orderId', 'orderNo', 'amount', 'success', 'status', 'message'], `${path} 逐单结果`);
}
expectParameters(operation(order, '/orders/group/pay-result', 'get'), ['orderGroupNo'], '付款回查');
const carriers = responseDataSchema(order, operation(order, '/orders/carriers', 'get'));
expectProperties(resolveSchema(order, carriers.items), ['id', 'code', 'name', 'enabled', 'defaultCarrier', 'customNameRequired', 'sortNo'], '承运商字典');

const ship = requestSchema(order, operation(order, '/orders/ship', 'post'));
expectRequired(ship, ['carrier', 'id', 'trackingNo'], '买手发货');
expectProperties(ship, ['carrier', 'carrierName', 'trackingNo', 'eta', 'shipVouchers', 'remark'], '买手发货');
const procure = requestSchema(order, operation(order, '/orders/procure', 'post'));
expectRequired(procure, ['id', 'purchaseNo', 'purchaseVouchers'], '完成采购');
expectFieldType(procure, 'purchaseNo', 'string', '完成采购');
expectFieldType(procure, 'purchaseVouchers', 'array', '完成采购');
const purchaseVouchers = procure.properties.purchaseVouchers;
if (procure.properties.purchaseNo.maxLength !== 128 || purchaseVouchers.minItems !== 1 || purchaseVouchers.maxItems !== 6
  || purchaseVouchers.items?.type !== 'string' || purchaseVouchers.items.maxLength !== 1024
  || purchaseVouchers.items.pattern !== 'https://[^\\s]+') {
  throw new Error('采购凭证契约应为1–6张无空白HTTPS地址，每项最多1024字符，单号最多128字符');
}
const confirmAftersale = requestSchema(order, operation(order, '/orders/refunds/confirm', 'post'));
expectRequired(confirmAftersale, ['refundId', 'agree', 'remark'], '卖家售后确认');
expectEnum(order.components?.schemas?.OrderRefundDTO, 'status', ['CONFIRMING', 'APPLYING', 'AGREED', 'REJECTED', 'CANCELED'], '退款阶段');
operation(order, '/files/upload', 'post');
const orderUpload = operation(order, '/files/upload', 'post');
expectParameters(orderUpload, ['scene'], 'order 文件上传');
expectParameterEnum(orderUpload, 'scene', ['PRODUCT', 'DEMAND', 'REVIEW', 'ORDER_VOUCHER'], 'order 文件上传');
const logistics = responseDataSchema(order, operation(order, '/orders/logistics', 'get'));
expectProperties(logistics, ['logisticsStatus', 'carrier', 'trackingNo', 'tracks'], '订单物流');
expectEnum(logistics, 'logisticsStatus', ['PENDING_SHIPMENT', 'SHIPPED', 'IN_TRANSIT', 'DELIVERING', 'SIGNED', 'EXCEPTION', 'RETURNED'], '订单物流');
for (const [schema, field] of [[logistics, 'carrier'], [ship, 'carrier']]) {
  if (schema.properties[field]?.type !== 'string' || schema.properties[field]?.enum) throw new Error('承运商仍受固定枚举限制');
}
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
expectProperties(refundApply, ['idempotencyKey'], '仅退款幂等键');
expectParameters(operation(order, '/orders/refunds/by-key', 'get'), ['idempotencyKey'], '退款回查');
const refundCancel = requestSchema(order, operation(order, '/orders/refunds/cancel', 'post'));
expectRequired(refundCancel, ['refundId'], '撤销仅退款');
operation(order, '/orders/refunds/bought/page', 'post');
operation(order, '/orders/refunds/sold/page', 'post');
operation(order, '/orders/refunds/detail', 'get');

['/reviews/reviewable/page', '/reviews/mine/page', '/reviews/received/page', '/reviews/appeals/mine/page', '/storefront/reviews/page'].forEach(path => operation(order, path, 'post'));
['/reviews/detail', '/storefront/reviews/summary', '/storefront/reviews/seller-rating'].forEach(path => operation(order, path, 'get'));
const reviewCreate = requestSchema(order, operation(order, '/reviews/create', 'post'));
const publicReviewQuery = requestSchema(order, operation(order, '/storefront/reviews/page', 'post'));
expectProperties(publicReviewQuery, ['keyword', 'topic', 'sortBy'], '评价服务端筛选');
expectFieldType(publicReviewQuery, 'keyword', 'string', '评价关键词');
if (publicReviewQuery.properties.keyword.maxLength !== 100) throw new Error('评价关键词长度契约变更');
expectEnum(publicReviewQuery, 'sortBy', ['NEWEST', 'MOST_HELPFUL', 'SCORE_DESC', 'SCORE_ASC'], '评价排序');
expectRequired(requestSchema(order, operation(order, '/reviews/helpful', 'put')), ['reviewId', 'helpful'], '评价帮助投票');
expectProperties(responseDataSchema(order, operation(order, '/reviews/helpful', 'put')), ['reviewId', 'helpful', 'helpfulCount'], '评价帮助响应');
expectRequired(reviewCreate, ['orderId', 'productScore', 'sellerScore'], '提交评价');
const reviewReply = requestSchema(order, operation(order, '/reviews/reply', 'put'));
expectRequired(reviewReply, ['reviewId', 'content'], '买手回复评价');
const reviewAppeal = requestSchema(order, operation(order, '/reviews/appeals/create', 'post'));
expectRequired(reviewAppeal, ['reviewId', 'reason'], '买手评价申诉');
operation(order, '/reviews/delete', 'delete');
const eligibility = requestSchema(order, operation(order, '/reviews/eligibility', 'post'));
expectRequired(eligibility, ['orderIds'], '批量评价资格');
if (eligibility.properties.orderIds.maxItems !== 200) throw new Error('评价资格单批上限变更');
expectProperties(resolveSchema(order, responseDataSchema(order, operation(order, '/reviews/eligibility', 'post')).items), ['orderId', 'reviewable', 'reason', 'reasonText', 'deadline', 'reviewId'], '评价资格响应');
expectProperties(orderDetailDto, ['reviewEligibility'], '订单详情评价资格');
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
for (const path of ['/demands/my/page', '/demands/hall/page']) {
  expectProperties(requestSchema(order, operation(order, path, 'post')), ['statuses', 'minBudget', 'maxBudget', 'minDeliveryDays', 'maxDeliveryDays'], path);
}
const progress = responseDataSchema(order, operation(order, '/demands/my/progress', 'get'));
expectProperties(progress, ['demandId', 'status', 'pushBatchCount', 'reachedBuyerCount', 'lastPushedAt', 'timeline'], '求购进度');
expectProperties(resolveSchema(order, progress.properties.timeline.items), ['code', 'name', 'description', 'occurredAt'], '进度节点');
expectParameters(operation(order, '/stats/mine', 'get'), ['startTime', 'endTime'], '我的经营数据');
expectProperties(responseDataSchema(order, operation(order, '/stats/mine', 'get')), ['sellerId', 'reviewRate', 'complaintRate', 'avgShipDurationMs', 'avgShipDurationHours', 'completedOrderCount', 'reviewedOrderCount', 'orderCount', 'refundCount', 'shippedOrderCount'], '经营数据响应');
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
].forEach(([path, method]) => { if (user) operation(user, path, method); });

const notifyResponse = await fetch(groups.notify);
let notifySummary;
if (notifyResponse.status === 404) {
  notifySummary = 'notify: HTTP 404（当前后端未提供通知 Swagger）';
  unavailable.push(notifySummary);
} else {
  if (!notifyResponse.ok) throw new Error(`notify Swagger 请求失败：HTTP ${notifyResponse.status}`);
  const notify = await notifyResponse.json();
  for (const path of ['/content/help', '/content/announcements']) {
    operation(notify, `${path}/page`, 'post');
    expectProperties(responseDataSchema(notify, operation(notify, `${path}/detail`, 'get')), ['id', 'title', 'body', 'contentVersion', 'status', 'audience', 'publishedAt', 'effectiveAt'], '正式内容详情');
  }
  expectParameters(operation(notify, '/content/agreements/current', 'get'), ['kind'], '当前协议');
  const helpQuery = requestSchema(notify, operation(notify, '/content/help/page', 'post'));
  expectFieldType(helpQuery, 'topic', 'string', '帮助主题');
  // 七类已确认编码可用；description不是结构化枚举，不以文案检查代替真实查询。
  const helpTopicEnum = helpQuery.properties.topic.enum;
  if (helpTopicEnum && ['pay', 'delivery', 'return', 'buyer', 'shopping', 'demand', 'wallet'].some(topic => !helpTopicEnum.includes(topic))) {
    throw new Error('帮助主题枚举缺少已确认的七类编码');
  }
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
  expectProperties(messagePage, ['markRead'], '显式消息已读');
  if (messagePage.properties.markRead.type !== 'boolean' || messagePage.properties.markRead.default !== false) throw new Error('消息分页 markRead 默认值变更');
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
  expectProperties(notificationSchema, ['bizType', 'bizId', 'templateCode', 'deptId', 'readFlag'], '站内通知响应');
  operation(notify, '/notifications/read-all', 'put');
  operation(notify, '/im/conversations/by-order', 'get');
  operation(notify, '/back/im/status', 'get');
  notifySummary = `notify: ${Object.keys(notify.paths || {}).length} paths, ${countOperations(notify)} operations, ${Object.keys(notify.components?.schemas || {}).length} schemas`;
}

const aiAdminList = operation(admin, '/ai/customer-service/sessions/list', 'post');
expectRequired(requestSchema(admin, aiAdminList), ['reason'], '后台 AI 会话');
expectProperties(requestSchema(admin, aiAdminList), ['userId', 'conversationId', 'status', 'startTime', 'endTime', 'cursor', 'limit'], '后台 AI 筛选');
expectParameters(operation(admin, '/ai/customer-service/sessions/detail', 'get'), ['conversationId', 'reason', 'cursor', 'limit'], '后台 AI 详情');
expectRequired(requestSchema(admin, operation(admin, '/ai/customer-service/messages/list', 'post')), ['conversationId', 'reason'], '后台 AI 历史消息');
const aiPrompt = operation(admin, '/ai/customer-service/prompts/detail', 'get');
expectParameters(aiPrompt, ['reason'], '后台 AI 提示词');
expectProperties(responseDataSchema(admin, aiPrompt), ['configuredPrompt', 'defaultPrompt', 'effectivePrompt', 'source', 'version', 'history', 'enforcedCodeBoundaries'], '后台 AI 提示词详情');
expectRequired(requestSchema(admin, operation(admin, '/ai/customer-service/prompts/update', 'put')), ['content', 'expectedVersion', 'reason'], '后台 AI 提示词更新');

// 2026-10-30 搜索、评论举报与内容治理；Long 传输按对接约定保留字符串，不依赖 integer 注解转换。
for (const path of ['/storefront/search/promotions', '/storefront/search/hot', '/storefront/search/suggest']) operation(order, path, 'get');
expectParameters(operation(order, '/storefront/search/suggest', 'get'), ['keyword'], '搜索联想');
expectRequired(requestSchema(order, operation(order, '/storefront/search/track', 'post')), ['keyword'], '搜索打点');
expectRequired(requestSchema(order, operation(order, '/storefront/reviews/comments/page', 'post')), ['reviewId'], '评价评论分页');
expectRequired(requestSchema(order, operation(order, '/reviews/comments/create', 'post')), ['reviewId', 'content'], '发表评论');
expectRequired(requestSchema(order, operation(order, '/reviews/reports/create', 'post')), ['reviewId', 'reason'], '评价举报');
expectParameters(operation(order, '/reviews/comments/delete', 'delete'), ['id'], '本人评论删除');
expectFieldType(order.components?.schemas?.ReviewCommentDTO, 'canDelete', 'boolean', '评论删除权限');
for (const prefix of ['/search-keywords', '/sensitive-words']) {
  operation(admin, `${prefix}/page`, 'post'); operation(admin, `${prefix}/create`, 'post');
  operation(admin, `${prefix}/update`, 'put'); expectParameters(operation(admin, `${prefix}/delete`, 'delete'), ['id'], prefix);
}
operation(admin, '/review-discussions/reports/page', 'post');
expectRequired(requestSchema(admin, operation(admin, '/review-discussions/reports/handle', 'put')), ['id', 'accepted', 'reason'], '处理举报');
expectRequired(requestSchema(admin, operation(admin, '/review-discussions/remove', 'put')), ['reviewId', 'reason'], '违规内容移除');

for (const [name, document] of Object.entries({ admin, user, order })) {
  if (!document) continue;
  const schemas = Object.keys(document.components?.schemas || {}).length;
  console.log(`${name}: ${Object.keys(document.paths || {}).length} paths, ${countOperations(document)} operations, ${schemas} schemas`);
}
console.log(notifySummary);
if (unavailable.length) {
  console.error(`部分服务已校验，其余外部阻塞：${unavailable.join('；')}`);
  process.exitCode = 1;
} else {
console.log('关键 C 端契约检查通过：登录、测试充值到账、地址、订单、仅退款、合并下单、订单组支付、买手发货、确认收货、发起求购、抢单和通知/IM。');
}
