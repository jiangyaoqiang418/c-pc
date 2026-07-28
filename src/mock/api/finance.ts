/**
 * 理财产品 + 锁仓订单 mock API。
 */
import {
  FINANCE_PRODUCTS,
  findProductById as findFinanceProductById
} from '../mock/data/finance-products';
import {
  FINANCE_LOCKUP_ORDERS,
  accrueOrderInterestNow,
  appendLockupOrder,
  applyUnlockNow,
  calcInterest,
  calcPoints,
  findOrderById as findLockupOrderById,
  transitionOrder
} from '../mock/data/finance-lockup-orders';
import { VIP_CONFIGS, findConfig } from '../mock/data/vip-config';
import { findAccount } from '../mock/data/wallet-accounts';
import { appendTxn } from '../mock/data/wallet-txns';
import { findUserById } from '../mock/data/users';
import { delay, delayPaginated } from '../utils/mock-delay';

export interface ProductListQuery {
  audience?: Api.FinanceProduct.Audience;
  vipLevel?: Api.User.VipLevel;
  status?: Api.FinanceProduct.ProductStatus;
}

export async function fetchFinanceProducts(q: ProductListQuery = {}) {
  let list = FINANCE_PRODUCTS.filter(p => p.status === (q.status || 'active'));
  if (q.audience && q.audience !== 'all') list = list.filter(p => p.audience === 'all' || p.audience === q.audience);
  return delay(list, 200);
}

export async function fetchFinanceProductDetail(productId: number) {
  return delay(findFinanceProductById(productId));
}

export async function fetchVipConfigs() {
  return delay(VIP_CONFIGS, 100);
}

export interface SubscribeParams {
  userId: number;
  productId: number;
  principalAmount: string;
}

function nextLockupCode(): string {
  return `FIN-2026-${String(FINANCE_LOCKUP_ORDERS.length + 1).padStart(5, '0')}`;
}

export async function subscribeFinanceMock(
  p: SubscribeParams
): Promise<{ ok: boolean; order?: Api.FinanceProduct.LockupOrder; message?: string }> {
  const user = findUserById(p.userId);
  const product = findFinanceProductById(p.productId);
  const acc = findAccount(p.userId);
  if (!user || !product || !acc) return delay({ ok: false, message: '数据不存在' }, 300);
  if (product.status !== 'active') return delay({ ok: false, message: '产品已暂停或归档' }, 300);
  if (Number(acc.available) < Number(p.principalAmount)) return delay({ ok: false, message: '余额不足' }, 300);

  const audience: Api.Vip.Audience = user.isBuyer ? 'buyer' : 'customer';
  const cfg = findConfig(audience, user.vipLevel);
  const vipBonus = cfg && audience === 'customer' ? cfg.customerBenefits?.interestRateBonus || 0 : 0;
  const effectiveRate = (Number(product.baseRate) + Number(vipBonus)).toFixed(4);
  const startAt = new Date().toISOString();
  const maturityAt = new Date(Date.now() + product.lockupDays * 86400_000).toISOString();
  const expectedInterest = calcInterest(p.principalAmount, effectiveRate, product.lockupDays);
  const pointsAccrued = calcPoints(p.principalAmount, product.lockupDays);

  acc.available = (Number(acc.available) - Number(p.principalAmount)).toFixed(2);
  acc.lockedFinance = (Number(acc.lockedFinance) + Number(p.principalAmount)).toFixed(2);
  const txn = appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'FINANCE_LOCK',
    direction: 'out',
    amount: p.principalAmount,
    balanceAfter: acc.available,
    bucketFrom: 'available',
    bucketTo: 'lockedFinance',
    refType: 'finance',
    refId: product.code,
    operator: 'system',
    remark: `订阅 ${product.name}`,
    createdAt: startAt
  });

  const order = appendLockupOrder({
    code: nextLockupCode(),
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    userId: user.id,
    userName: user.nickname,
    isBuyer: user.isBuyer,
    principalAmount: p.principalAmount,
    rate: {
      baseRate: product.baseRate,
      vipBonusRate: String(vipBonus),
      effectiveRate,
      vipLevelAtLock: user.vipLevel
    },
    lockupDays: product.lockupDays,
    startAt,
    maturityAt,
    expectedInterest,
    accruedInterest: '0',
    pointsAccrued,
    status: 'active',
    lockTxnId: txn.id
  });
  return delay({ ok: true, order }, 600);
}

export async function earlyUnlockMock(orderId: number): Promise<{ ok: boolean; message?: string }> {
  const order = findLockupOrderById(orderId);
  if (!order) return delay({ ok: false, message: '订单不存在' }, 200);
  if (order.status !== 'active') return delay({ ok: false, message: '订单不是持仓状态' }, 200);

  accrueOrderInterestNow(order.id);
  applyUnlockNow(order.id, 'early_unlocked');

  const acc = findAccount(order.userId);
  if (acc) {
    acc.lockedFinance = (Number(acc.lockedFinance) - Number(order.principalAmount)).toFixed(2);
    acc.available = (Number(acc.available) + Number(order.principalAmount)).toFixed(2);
    appendTxn({
      userId: order.userId,
      userName: order.userName,
      type: 'FINANCE_UNLOCK',
      direction: 'in',
      amount: order.principalAmount,
      balanceAfter: acc.available,
      bucketFrom: 'lockedFinance',
      bucketTo: 'available',
      refType: 'finance',
      refId: order.code,
      operator: 'system',
      remark: '提前解锁本金（利息扣除）',
      createdAt: new Date().toISOString()
    });
  }
  transitionOrder(orderId, 'early_unlocked');
  return delay({ ok: true }, 600);
}

export async function fetchMyLockups(userId: number, status?: Api.FinanceProduct.LockupStatus) {
  let list = FINANCE_LOCKUP_ORDERS.filter(o => o.userId === userId);
  if (status) list = list.filter(o => o.status === status);
  list.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  return delayPaginated(list, 1, 50);
}

export async function fetchLockupDetail(orderId: number) {
  return delay(findLockupOrderById(orderId));
}
