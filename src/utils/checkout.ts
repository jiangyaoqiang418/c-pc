import { getOrderCapabilities } from './order';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import type { CartItem } from '@/stores/cart';

export interface PendingCheckout {
  idempotencyKey: string;
  productIds: Array<string | number>;
  orderItems: Api.RealOrder.OrderCreateItemParams[];
  addressId?: string | number;
  orderGroupNo?: string;
  orderIds?: Array<string | number>;
  firstOrderId?: string | number;
  contextId?: string;
  cartSnapshot?: CartItem[];
  paymentResult?: Api.RealOrder.OrderGroupPayResult;
}

/** 按十进制原值相加，不使用浮点累加或截断到展示精度。 */
export function sumPaymentAmounts(values: Array<string | number>) {
  const parts = values.map(value => {
    let text = String(value);
    if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(text)) {
      const [coefficient, exponent] = text.toLowerCase().split('e');
      const power = Number(exponent);
      if (!Number.isSafeInteger(power) || Math.abs(power) > 100) throw new Error('订单金额格式无效，请重新核对');
      const [integer, fraction = ''] = coefficient.split('.');
      const digits = integer + fraction;
      const point = integer.length + power;
      text = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
        : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
    }
    if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('订单金额格式无效，请重新核对');
    return text.split('.');
  });
  const scale = Math.max(0, ...parts.map(([, fraction = '']) => fraction.length));
  const sum = parts.reduce((total, [integer, fraction = '']) => total + BigInt(integer + fraction.padEnd(scale, '0')), 0n);
  const digits = sum.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') || '0' : digits;
}

export function validateGroupPayResult(result: Api.RealOrder.OrderGroupPayResult, group: string, orderIds: Array<string | number>) {
  const ids = new Set(orderIds.map(String));
  if (!result || result.orderGroupNo !== group || !Array.isArray(result.items)
    || ![result.totalCount, result.paidCount, result.failedCount].every(n => Number.isSafeInteger(n) && n >= 0)
    || result.totalCount !== result.items.length || result.paidCount + result.failedCount !== result.totalCount
    || new Set(result.items.map(item => String(item.orderId))).size !== result.items.length
    || result.items.some(item => !ids.has(String(item.orderId)) || typeof item.success !== 'boolean')
    || result.items.filter(item => item.success).length !== result.paidCount) {
    throw new Error('组付款回执不完整或归属不符，请重新核对订单');
  }
  sumPaymentAmounts([result.paidAmount, result.unpaidAmount, ...result.items.map(item => item.amount)]);
  return result;
}

export function isPaidOrderStatus(status: string) {
  return ['PAID', 'SHIPPED', 'REFUND_REVIEW', 'REFUNDED', 'COMPLETED'].includes(status);
}

export function isGroupPaymentComplete(result: Api.RealOrder.OrderGroupPayResult, payableIds: Array<string | number>) {
  return Number(result.unpaidAmount) === 0 && result.failedCount === 0
    && payableIds.every(id => result.items.some(item => String(item.orderId) === String(id) && item.success && isPaidOrderStatus(item.status)));
}

export function pendingCheckoutStorageKey(userId: string | number) {
  return `cpc:checkout:pending:${userId}`;
}

/** 读取失败不能证明原请求未执行，禁止删除记录或创建新的幂等键。 */
export function readPendingCheckout(userId: string | number): PendingCheckout | undefined {
  try {
    const raw = localStorage.getItem(pendingCheckoutStorageKey(userId));
    if (raw === null) return;
    const value = JSON.parse(raw) as PendingCheckout;
    const isId = (id: unknown) => (typeof id === 'string' && id.trim().length > 0)
      || (typeof id === 'number' && Number.isSafeInteger(id));
    if (!value || typeof value.idempotencyKey !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.idempotencyKey)
      || !Array.isArray(value.productIds) || !value.productIds.length || !value.productIds.every(isId)
      || !Array.isArray(value.orderItems) || !value.orderItems.length
      || value.orderItems.some(item => !item || !isId(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity! < 1)
      || !isId(value.addressId)
      || (value.orderIds !== undefined && (!Array.isArray(value.orderIds) || !value.orderIds.length || !value.orderIds.every(isId)))
      || (value.orderGroupNo !== undefined && (typeof value.orderGroupNo !== 'string' || !value.orderGroupNo.trim()))
      || (value.firstOrderId !== undefined && !isId(value.firstOrderId))
      || (value.contextId !== undefined && typeof value.contextId !== 'string')
      || (value.cartSnapshot !== undefined && (!Array.isArray(value.cartSnapshot) || value.cartSnapshot.some(item => !item
        || !isId(item.productId) || !Number.isSafeInteger(item.qty) || item.qty < 1 || typeof item.addedAt !== 'string')))) {
      throw new Error('invalid pending checkout');
    }
    return value;
  } catch {
    throw new Error('原结算记录无法读取，请前往我的订单并联系平台核实；暂不可创建新的结算');
  }
}

/** 只有首次请求的明确拒绝能解除下单保护；重试拒绝不能推翻原请求的未知结果。 */
export function canDiscardRejectedCheckout(error: unknown, hadPendingAttempt: boolean) {
  if (error instanceof RequestError && error.code === '-311') return false;
  return !hadPendingAttempt && (isDefinitiveRejection(error)
    || (error instanceof RequestError && /不能购买自己(?:的|发布的)?商品/.test(error.message)));
}

/** 支付已经确认，逐项清理本地状态；任一清理失败不改变付款结果，也不阻断其余清理。 */
export async function cleanupPaidCheckout(actions: Array<() => unknown | Promise<unknown>>) {
  let complete = true;
  for (const action of actions) {
    try { await action(); } catch { complete = false; }
  }
  return complete;
}

interface CheckoutIntent {
  items: Array<{ productId: string | number; quantity: number }>;
  ownerId?: string | number;
  createdAt: number;
}

const prefix = 'cpc:checkout:intent:';

/** 本次购买意图独立于账号购物车；登录回跳只携带不可猜测的上下文标识。 */
export function createCheckoutIntent(items: CheckoutIntent['items'], ownerId?: string | number) {
  const id = crypto.randomUUID();
  sessionStorage.setItem(`${prefix}${id}`, JSON.stringify({ items, ownerId, createdAt: Date.now() }));
  return id;
}

export function readCheckoutIntent(id: string, ownerId: string | number): CheckoutIntent {
  let value: CheckoutIntent;
  try {
    value = JSON.parse(sessionStorage.getItem(`${prefix}${id}`) || 'null');
  } catch {
    throw new Error('本次结算信息无法读取，请返回商品或购物车重新结算');
  }
  if (!value || !Array.isArray(value.items) || !value.items.length
    || !Number.isFinite(value.createdAt) || Date.now() - value.createdAt > 60 * 60 * 1000
    || value.items.some(item => !item || !['string', 'number'].includes(typeof item.productId)
      || !String(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1)
    || (value.ownerId !== undefined && String(value.ownerId) !== String(ownerId))) {
    throw new Error('本次结算信息已失效或不属于当前账号，请重新选择商品');
  }
  value.ownerId = ownerId;
  sessionStorage.setItem(`${prefix}${id}`, JSON.stringify(value));
  return value;
}

export function clearCheckoutIntent(id: string) {
  sessionStorage.removeItem(`${prefix}${id}`);
}

function orderSignature(orders: Api.RealOrder.Record[]) {
  return JSON.stringify([...orders].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(order => [
    order.id, order.status, order.totalAmount, order.customerId, order.productId, order.quantity,
    order.shippingAddress, order.receiverName, order.receiverPhone, order.postalCode
  ]));
}

/** 付款只使用已展示且再次回读一致的订单，不引用当前购物车或旧订单号。 */
export function prepareCheckoutPayment(
  confirmed: Api.RealOrder.Record[],
  latest: Api.RealOrder.Record[],
  userId: string | number,
  orderGroupNo?: string
) {
  const ids = new Set(confirmed.map(order => String(order.id)));
  if (!confirmed.length || ids.size !== confirmed.length || latest.length !== ids.size
    || new Set(latest.map(order => String(order.id))).size !== ids.size
    || latest.some(order => !ids.has(String(order.id)))) {
    throw new Error('订单回读对象不一致，请重新读取已有订单');
  }
  if (latest.some(order => !getOrderCapabilities(order, userId).isCustomer)) {
    throw new Error('已有订单不属于当前顾客');
  }
  if (orderSignature(confirmed) !== orderSignature(latest)) {
    return { changed: true, payable: [] as Api.RealOrder.Record[], orderGroupNo: undefined };
  }
  const payable = latest.filter(order => getOrderCapabilities(order, userId).pay);
  if (!payable.length) throw new Error('当前没有待付款订单，请查看订单实际状态');
  if (payable.some(order => !String(order.totalAmount ?? '').trim()
    || !Number.isFinite(Number(order.totalAmount)) || Number(order.totalAmount) < 0)) {
    throw new Error('订单待付金额无效，请重新读取订单');
  }
  return { changed: false, payable, orderGroupNo };
}
