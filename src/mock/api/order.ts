/**
 * 订单 mock API：列表（含 9 状态筛选）/ 详情 / 支付 / 确认收货 / 取消。
 */
import { ORDERS, appendOrder, findOrderById, transitionOrder } from '../mock/data/orders';
import { findAccount, moveBucket } from '../mock/data/wallet-accounts';
import { appendTxn } from '../mock/data/wallet-txns';
import { findUserById } from '../mock/data/users';
import { delay, delayPaginated } from '../utils/mock-delay';

export interface OrderListQuery {
  current?: number;
  size?: number;
  customerId?: number;
  shopperId?: number;
  statuses?: Api.Order.OrderStatus[];
  keyword?: string;
}

function filterOrders(q: OrderListQuery): Api.Order.OrderRecord[] {
  let list = [...ORDERS];
  if (q.customerId != null) list = list.filter(o => o.customerId === q.customerId);
  if (q.shopperId != null) list = list.filter(o => o.shopperId === q.shopperId);
  if (q.statuses?.length) list = list.filter(o => q.statuses!.includes(o.status));
  if (q.keyword) {
    const kw = q.keyword.toLowerCase();
    list = list.filter(o => o.code.toLowerCase().includes(kw) || o.productTitle.toLowerCase().includes(kw));
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function fetchMyOrders(q: OrderListQuery) {
  return delayPaginated(filterOrders(q), q.current || 1, q.size || 10);
}

export async function fetchOrderDetail(orderId: number) {
  return delay(findOrderById(orderId));
}

export async function countMyOrdersByStatus(customerId: number): Promise<Record<Api.Order.OrderStatus, number>> {
  const counts: Record<string, number> = {};
  ORDERS.filter(o => o.customerId === customerId).forEach(o => {
    counts[o.status] = (counts[o.status] || 0) + 1;
  });
  return delay(counts as Record<Api.Order.OrderStatus, number>, 100);
}

export interface CreateOrderParams {
  customerId: number;
  productId: number;
  shopperId: number;
  productTitle: string;
  productCover?: string;
  price: string;
  shippingFee: string;
  tax: string;
  receiverName: string;
  receiverPhone: string;
  shippingAddress: string;
  aftersaleType: Api.Product.AftersaleType;
}

function nextOrderCode(): string {
  const seq = ORDERS.length + 1;
  return `ORD-2026-${String(seq).padStart(5, '0')}`;
}

export async function createOrderMock(p: CreateOrderParams): Promise<Api.Order.OrderRecord> {
  const totalAmount = (Number(p.price) + Number(p.shippingFee) + Number(p.tax)).toFixed(2);
  const order = appendOrder({
    code: nextOrderCode(),
    customerId: p.customerId,
    customerName: findUserById(p.customerId)?.nickname || '匿名顾客',
    shopperId: p.shopperId,
    shopperName: findUserById(p.shopperId)?.nickname || '买手',
    productId: p.productId,
    productTitle: p.productTitle,
    productCover: p.productCover,
    price: p.price,
    shippingFee: p.shippingFee,
    tax: p.tax,
    totalAmount,
    paidAmount: '0',
    aftersaleType: p.aftersaleType,
    overseasCustoms: false,
    shippingAddress: p.shippingAddress,
    receiverName: p.receiverName,
    receiverPhone: p.receiverPhone,
    status: 'PENDING_PAYMENT',
    priceHistory: [],
    createdAt: new Date().toISOString()
  });
  return delay(order, 400);
}

export async function payOrderMock(orderId: number): Promise<{ ok: boolean; message?: string }> {
  const order = findOrderById(orderId);
  if (!order) return delay({ ok: false, message: '订单不存在' }, 300);
  if (order.status !== 'PENDING_PAYMENT') return delay({ ok: false, message: '订单状态不可支付' }, 300);

  const acc = findAccount(order.customerId);
  if (!acc) return delay({ ok: false, message: '钱包不存在' }, 300);
  if (Number(acc.available) < Number(order.totalAmount)) return delay({ ok: false, message: '余额不足' }, 300);

  moveBucket({ account: acc, fromBucket: 'available', toBucket: 'frozenOrder', amount: order.totalAmount });
  const txn = appendTxn({
    userId: order.customerId,
    userName: order.customerName,
    type: 'ORDER_FREEZE',
    direction: 'out',
    amount: order.totalAmount,
    balanceAfter: acc.available,
    bucketFrom: 'available',
    bucketTo: 'frozenOrder',
    refType: 'order',
    refId: order.code,
    operator: 'system',
    remark: `订单付款冻结 ${order.code}`,
    createdAt: new Date().toISOString()
  });
  order.paidAmount = order.totalAmount;
  order.paymentTxnId = txn.id;
  order.paidAt = new Date().toISOString();
  transitionOrder(order.id, 'PROCURING', 'customer');
  return delay({ ok: true }, 600);
}

export async function confirmReceiptMock(orderId: number): Promise<{ ok: boolean }> {
  const order = findOrderById(orderId);
  if (!order) return delay({ ok: false }, 200);
  order.deliveredAt = new Date().toISOString();
  transitionOrder(orderId, 'COMPLETED', 'customer');
  return delay({ ok: true }, 400);
}

export async function cancelOrderMock(orderId: number, reason: string): Promise<{ ok: boolean }> {
  const order = findOrderById(orderId);
  if (!order) return delay({ ok: false }, 200);
  order.cancelledReason = reason;
  order.cancelledBy = 'customer';
  transitionOrder(orderId, 'CANCELLED', 'customer');
  return delay({ ok: true }, 400);
}
