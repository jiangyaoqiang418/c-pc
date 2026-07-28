/**
 * 锁仓订单池（R-DATA-33 / R-MOD-22 / R-MOD-23）— finance-product 模块两个真实源之一。
 *
 * 30 条覆盖 4 态：active 18 / matured 8 / early_unlocked 3 / cancelled 1。
 *
 * Seed 阶段联动写入（R-MOD-22）：
 *   - 每条订单 FINANCE_LOCK 流水 + moveBucket(available → lockedFinance)
 *   - active：按已过天数预派部分 INTEREST_ACCRUE 流水 + 累加 nonWithdrawable + FINANCE_HOLD 积分
 *   - matured：完整锁定期 INTEREST_ACCRUE + FINANCE_UNLOCK(到期)
 *   - early_unlocked：部分 INTEREST_ACCRUE + FINANCE_UNLOCK(提前)
 *   - cancelled：仅 FINANCE_LOCK + FINANCE_UNLOCK(取消)
 */
import { FINANCE_PRODUCTS } from './finance-products';
import { USERS, findUserById } from './users';
import { findAccount, moveBucket } from './wallet-accounts';
import { appendTxn } from './wallet-txns';
import { appendLog } from './point-logs';
import { computeLevel, findConfig } from './vip-config';

type LockupOrder = Api.FinanceProduct.LockupOrder;
type LockupStatus = Api.FinanceProduct.LockupStatus;

let idCursor = 0;
function nextOrderId(): number {
  idCursor += 1;
  return idCursor;
}

function makeCode(seq: number): string {
  return `FIN-2026-${String(80000 + seq).padStart(5, '0')}`;
}

function nowMinus(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

function plusDays(iso: string, days: number): string {
  const t = new Date(iso);
  t.setDate(t.getDate() + days);
  return t.toISOString();
}

function addStr(a: string, b: string): string {
  return (Number(a) + Number(b)).toFixed(2);
}

/** 简单利息：principal × annualRate% / 365 × days */
function calcInterest(principal: string, annualRatePct: string, days: number): string {
  const i = (Number(principal) * Number(annualRatePct) * days) / 100 / 365;
  return i.toFixed(2);
}

/** 计算锁仓期积分（每 10U/天 1 分，capDaily 100） */
function calcPoints(principal: string, days: number): number {
  const dailyPoints = Math.min(100, Math.floor(Number(principal) / 10));
  return dailyPoints * days;
}

interface OrderSeed {
  status: LockupStatus;
  productCode: string;
  userIndex: number; // USERS 数组索引
  principalAmount: string;
  /** 距今多少天前订阅（用于计算 startAt） */
  startedDaysAgo: number;
  /** 仅 early_unlocked / cancelled：距今多少天前解锁 */
  unlockedDaysAgo?: number;
  cancelledReason?: string;
}

const SEEDS: OrderSeed[] = [
  // ===== active 18 条 =====
  // 7D 系列：3 条（含 1 条即将到期）
  { status: 'active', productCode: 'FIN-7D-001', userIndex: 0, principalAmount: '500.00', startedDaysAgo: 2 },
  { status: 'active', productCode: 'FIN-7D-001', userIndex: 1, principalAmount: '300.00', startedDaysAgo: 6 }, // 即将到期
  { status: 'active', productCode: 'FIN-7D-001', userIndex: 2, principalAmount: '800.00', startedDaysAgo: 5 }, // 即将到期

  // 30D 系列：6 条（VIP 各层 + 即将到期）
  { status: 'active', productCode: 'FIN-30D-001', userIndex: 3, principalAmount: '2000.00', startedDaysAgo: 10 },
  { status: 'active', productCode: 'FIN-30D-001', userIndex: 4, principalAmount: '5000.00', startedDaysAgo: 15 },
  { status: 'active', productCode: 'FIN-30D-001', userIndex: 5, principalAmount: '1000.00', startedDaysAgo: 25 }, // 即将到期
  { status: 'active', productCode: 'FIN-30D-001', userIndex: 6, principalAmount: '8000.00', startedDaysAgo: 8 },
  { status: 'active', productCode: 'FIN-30D-001', userIndex: 7, principalAmount: '3500.00', startedDaysAgo: 18 },
  { status: 'active', productCode: 'FIN-30D-001', userIndex: 8, principalAmount: '1500.00', startedDaysAgo: 12 },

  // 90D 系列：5 条
  { status: 'active', productCode: 'FIN-90D-001', userIndex: 9, principalAmount: '5000.00', startedDaysAgo: 30 },
  { status: 'active', productCode: 'FIN-90D-001', userIndex: 10, principalAmount: '10000.00', startedDaysAgo: 45 },
  { status: 'active', productCode: 'FIN-90D-001', userIndex: 11, principalAmount: '3000.00', startedDaysAgo: 20 },
  { status: 'active', productCode: 'FIN-90D-001', userIndex: 0, principalAmount: '8000.00', startedDaysAgo: 60 },
  { status: 'active', productCode: 'FIN-90D-001', userIndex: 4, principalAmount: '2000.00', startedDaysAgo: 38 },

  // 180D 系列：3 条
  { status: 'active', productCode: 'FIN-180D-001', userIndex: 12, principalAmount: '15000.00', startedDaysAgo: 90 },
  { status: 'active', productCode: 'FIN-180D-001', userIndex: 13, principalAmount: '20000.00', startedDaysAgo: 60 },
  { status: 'active', productCode: 'FIN-180D-001', userIndex: 14, principalAmount: '5000.00', startedDaysAgo: 120 },

  // 365D 系列：1 条
  { status: 'active', productCode: 'FIN-365D-001', userIndex: 6, principalAmount: '30000.00', startedDaysAgo: 200 },

  // ===== matured 8 条 =====
  {
    status: 'matured',
    productCode: 'FIN-7D-001',
    userIndex: 1,
    principalAmount: '1000.00',
    startedDaysAgo: 30,
    unlockedDaysAgo: 23
  },
  {
    status: 'matured',
    productCode: 'FIN-7D-001',
    userIndex: 5,
    principalAmount: '500.00',
    startedDaysAgo: 20,
    unlockedDaysAgo: 13
  },
  {
    status: 'matured',
    productCode: 'FIN-30D-001',
    userIndex: 2,
    principalAmount: '3000.00',
    startedDaysAgo: 60,
    unlockedDaysAgo: 30
  },
  {
    status: 'matured',
    productCode: 'FIN-30D-001',
    userIndex: 7,
    principalAmount: '5000.00',
    startedDaysAgo: 50,
    unlockedDaysAgo: 20
  },
  {
    status: 'matured',
    productCode: 'FIN-30D-001',
    userIndex: 9,
    principalAmount: '2000.00',
    startedDaysAgo: 80,
    unlockedDaysAgo: 50
  },
  {
    status: 'matured',
    productCode: 'FIN-90D-001',
    userIndex: 11,
    principalAmount: '8000.00',
    startedDaysAgo: 150,
    unlockedDaysAgo: 60
  },
  {
    status: 'matured',
    productCode: 'FIN-90D-001',
    userIndex: 13,
    principalAmount: '12000.00',
    startedDaysAgo: 180,
    unlockedDaysAgo: 90
  },
  {
    status: 'matured',
    productCode: 'FIN-180D-001',
    userIndex: 0,
    principalAmount: '20000.00',
    startedDaysAgo: 250,
    unlockedDaysAgo: 70
  },

  // ===== early_unlocked 3 条 =====
  {
    status: 'early_unlocked',
    productCode: 'FIN-30D-001',
    userIndex: 8,
    principalAmount: '5000.00',
    startedDaysAgo: 25,
    unlockedDaysAgo: 8
  },
  {
    status: 'early_unlocked',
    productCode: 'FIN-90D-001',
    userIndex: 10,
    principalAmount: '15000.00',
    startedDaysAgo: 40,
    unlockedDaysAgo: 5
  }, // 大额示警
  {
    status: 'early_unlocked',
    productCode: 'FIN-180D-001',
    userIndex: 14,
    principalAmount: '3000.00',
    startedDaysAgo: 60,
    unlockedDaysAgo: 15
  },

  // ===== cancelled 1 条 =====
  {
    status: 'cancelled',
    productCode: 'FIN-365D-001',
    userIndex: 12,
    principalAmount: '10000.00',
    startedDaysAgo: 100,
    unlockedDaysAgo: 80,
    cancelledReason: '用户主动申请取消（提交工单且经合规审核确认）'
  }
];

export const FINANCE_LOCKUP_ORDERS: LockupOrder[] = [];

function buildRateSnapshot(product: Api.FinanceProduct.ProductRecord, userId: number): Api.FinanceProduct.RateSnapshot {
  const user = findUserById(userId);
  const audience = user?.isBuyer ? 'buyer' : 'customer';
  const level = computeLevel(user?.points || 0, audience);
  // VIP 加成仅顾客有 interestRateBonus；买手沿用 0
  const cfg = findConfig('customer', level);
  const bonus = audience === 'customer' ? (cfg?.customerBenefits?.interestRateBonus ?? 0) : 0;
  return {
    baseRate: product.baseRate,
    vipBonusRate: Number(bonus).toFixed(2),
    effectiveRate: (Number(product.baseRate) + Number(bonus)).toFixed(2),
    vipLevelAtLock: level
  };
}

function userOf(index: number): Api.User.UserRecord {
  // 使用 index 取用户，越界时回绕
  return USERS[index % USERS.length];
}

interface BuildContext {
  seq: number;
  product: Api.FinanceProduct.ProductRecord;
  user: Api.User.UserRecord;
  seed: OrderSeed;
}

function buildBaseOrder(ctx: BuildContext): LockupOrder {
  const { seq, product, user, seed } = ctx;
  const startAt = nowMinus(seed.startedDaysAgo, 10, 0);
  const maturityAt = plusDays(startAt, product.lockupDays);
  const rate = buildRateSnapshot(product, user.id);
  const expectedInterest = calcInterest(seed.principalAmount, rate.effectiveRate, product.lockupDays);
  return {
    id: nextOrderId(),
    code: makeCode(seq),
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    lockupDays: product.lockupDays,
    userId: user.id,
    userName: user.nickname,
    isBuyer: user.isBuyer,
    principalAmount: seed.principalAmount,
    rate,
    status: seed.status,
    startAt,
    maturityAt,
    accruedInterest: '0.00',
    expectedInterest,
    pointsAccrued: 0
  };
}

/**
 * 锁定本金到 lockedFinance + 写 FINANCE_LOCK 流水。
 * 若账户 available 不足，则先补足 available（保持 seed 稳定可重现）。
 */
function applyLockFreeze(order: LockupOrder): number | undefined {
  const account = findAccount(order.userId);
  if (!account) return undefined;
  if (Number(account.available) < Number(order.principalAmount)) {
    account.available = addStr(account.available, order.principalAmount);
  }
  moveBucket({ account, fromBucket: 'available', toBucket: 'lockedFinance', amount: order.principalAmount });
  const txn = appendTxn({
    userId: order.userId,
    userName: order.userName,
    type: 'FINANCE_LOCK',
    direction: 'out',
    amount: order.principalAmount,
    balanceAfter: account.available,
    bucketFrom: 'available',
    bucketTo: 'lockedFinance',
    refType: 'finance',
    refId: order.code,
    operator: 'system',
    remark: `${order.productName} 锁仓订阅 ${order.lockupDays} 天`,
    createdAt: order.startAt
  });
  return txn.id;
}

/**
 * 按 daysAccrued 派发利息（写 INTEREST_ACCRUE 流水 + 加 nonWithdrawable + 写 FINANCE_HOLD 积分）。
 * 从锁仓后第 2 天才开始计息（doc 明文）。
 */
function applyInterestAccrual(order: LockupOrder, daysAccrued: number): void {
  if (daysAccrued <= 0) return;
  const account = findAccount(order.userId);
  if (!account) return;
  const interest = calcInterest(order.principalAmount, order.rate.effectiveRate, daysAccrued);
  if (Number(interest) <= 0) return;
  account.nonWithdrawable = addStr(account.nonWithdrawable, interest);
  account.interestAccrued = addStr(account.interestAccrued, interest);
  account.updatedAt = new Date().toISOString();
  order.accruedInterest = addStr(order.accruedInterest, interest);
  // 每日利息流水（聚合到一条以简化 seed）
  appendTxn({
    userId: order.userId,
    userName: order.userName,
    type: 'INTEREST_ACCRUE',
    direction: 'in',
    amount: interest,
    balanceAfter: account.available,
    bucketTo: 'nonWithdrawable',
    refType: 'finance',
    refId: order.code,
    operator: 'system',
    remark: `${order.productName} ${daysAccrued} 天利息发放`,
    createdAt: plusDays(order.startAt, daysAccrued)
  });
  // 积分（cap 100/天）
  const points = calcPoints(order.principalAmount, daysAccrued);
  if (points > 0) {
    order.pointsAccrued += points;
    appendLog({
      userId: order.userId,
      userName: order.userName,
      behavior: 'FINANCE_HOLD',
      change: points,
      balanceAfter: (findUserById(order.userId)?.points || 0) + points,
      refType: 'finance',
      refId: order.code,
      isAppealable: false,
      createdAt: plusDays(order.startAt, daysAccrued)
    });
  }
}

/** 解锁本金到 available + 写 FINANCE_UNLOCK 流水 */
function applyUnlock(order: LockupOrder, unlockAt: string, remark: string): number | undefined {
  const account = findAccount(order.userId);
  if (!account) return undefined;
  moveBucket({ account, fromBucket: 'lockedFinance', toBucket: 'available', amount: order.principalAmount });
  const txn = appendTxn({
    userId: order.userId,
    userName: order.userName,
    type: 'FINANCE_UNLOCK',
    direction: 'in',
    amount: order.principalAmount,
    balanceAfter: account.available,
    bucketFrom: 'lockedFinance',
    bucketTo: 'available',
    refType: 'finance',
    refId: order.code,
    operator: 'system',
    remark,
    createdAt: unlockAt
  });
  return txn.id;
}

function seedAll(): void {
  FINANCE_LOCKUP_ORDERS.length = 0;
  SEEDS.forEach((seed, idx) => {
    const product = FINANCE_PRODUCTS.find(p => p.code === seed.productCode);
    if (!product) return;
    const user = userOf(seed.userIndex);
    const order = buildBaseOrder({ seq: idx + 1, product, user, seed });

    // 1. 锁定本金（所有状态都先经历过这步）
    order.lockTxnId = applyLockFreeze(order);

    // 2. 按 status 应用后续步骤
    if (seed.status === 'active') {
      // 派发已过天数 - 1 的利息（第 2 天才开始计息）
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(order.startAt)) / 86400000));
      applyInterestAccrual(order, Math.max(0, elapsed - 1));
    } else if (seed.status === 'matured') {
      // 整个锁定期利息（满期）
      applyInterestAccrual(order, product.lockupDays - 1);
      const unlockedAt = seed.unlockedDaysAgo !== undefined ? nowMinus(seed.unlockedDaysAgo) : order.maturityAt;
      order.unlockedAt = unlockedAt;
      order.unlockTxnId = applyUnlock(order, unlockedAt, `${order.productName} 到期解锁`);
    } else if (seed.status === 'early_unlocked') {
      const unlockedAt = nowMinus(seed.unlockedDaysAgo || 5);
      const lockedDays = Math.max(0, Math.floor((Date.parse(unlockedAt) - Date.parse(order.startAt)) / 86400000));
      applyInterestAccrual(order, Math.max(0, lockedDays - 1));
      order.unlockedAt = unlockedAt;
      order.unlockTxnId = applyUnlock(order, unlockedAt, `${order.productName} 提前解锁（利息清零）`);
      // 标记被清零的预计利息（已发放的不退）
      const remainingDays = product.lockupDays - lockedDays;
      order.forfeitedInterest = calcInterest(
        seed.principalAmount,
        order.rate.effectiveRate,
        Math.max(0, remainingDays)
      );
    } else if (seed.status === 'cancelled') {
      const unlockedAt = nowMinus(seed.unlockedDaysAgo || 80);
      order.unlockedAt = unlockedAt;
      order.unlockTxnId = applyUnlock(order, unlockedAt, `${order.productName} 管理员强制取消`);
      order.cancelledReason = seed.cancelledReason;
      order.cancelledBy = 'admin';
      order.forfeitedInterest = order.expectedInterest;
    }

    FINANCE_LOCKUP_ORDERS.push(order);
  });
}
seedAll();

export function findOrderById(id: number): LockupOrder | undefined {
  return FINANCE_LOCKUP_ORDERS.find(o => o.id === id);
}

export function findOrderByCode(code: string): LockupOrder | undefined {
  return FINANCE_LOCKUP_ORDERS.find(o => o.code === code);
}

export function appendLockupOrder(o: Omit<LockupOrder, 'id'>): LockupOrder {
  const seq = FINANCE_LOCKUP_ORDERS.length + 1;
  const created: LockupOrder = { id: nextOrderId(), ...o };
  if (!created.code) created.code = makeCode(seq);
  FINANCE_LOCKUP_ORDERS.unshift(created);
  return created;
}

export function transitionOrder(orderId: number, newStatus: LockupStatus): LockupOrder | undefined {
  const o = findOrderById(orderId);
  if (!o) return undefined;
  o.status = newStatus;
  return o;
}

/**
 * 结算一条 active 订单自上次结算到当前的利息（参 settle handler）。
 * 内部使用 — 写 INTEREST_ACCRUE 流水 + 加 nonWithdrawable + 加积分。
 */
export function accrueOrderInterestNow(
  orderId: number,
  untilIso?: string
): { delta: string; points: number } | undefined {
  const o = findOrderById(orderId);
  if (!o || o.status !== 'active') return undefined;
  const account = findAccount(o.userId);
  if (!account) return undefined;
  const now = untilIso ? Date.parse(untilIso) : Date.now();
  const startMs = Date.parse(o.startAt);
  const maturityMs = Date.parse(o.maturityAt);
  const horizon = Math.min(now, maturityMs);
  const totalDaysCapped = Math.max(0, Math.floor((horizon - startMs) / 86400000) - 1); // 第 2 天才计息
  const settledAccrued = Number(o.accruedInterest);
  const expectedSoFar = Number(calcInterest(o.principalAmount, o.rate.effectiveRate, totalDaysCapped));
  const deltaNum = Math.max(0, expectedSoFar - settledAccrued);
  if (deltaNum <= 0) return { delta: '0.00', points: 0 };
  const delta = deltaNum.toFixed(2);
  account.nonWithdrawable = addStr(account.nonWithdrawable, delta);
  account.interestAccrued = addStr(account.interestAccrued, delta);
  account.updatedAt = new Date().toISOString();
  o.accruedInterest = addStr(o.accruedInterest, delta);
  appendTxn({
    userId: o.userId,
    userName: o.userName,
    type: 'INTEREST_ACCRUE',
    direction: 'in',
    amount: delta,
    balanceAfter: account.available,
    bucketTo: 'nonWithdrawable',
    refType: 'finance',
    refId: o.code,
    operator: 'system',
    remark: `${o.productName} 利息结算`,
    createdAt: new Date(horizon).toISOString()
  });
  // 积分：自上次到现在的天数粗略估算（用 totalDaysCapped - 已记账天数；mock 简化为按 delta 比例反推）
  const alreadyAccruedPoints = o.pointsAccrued;
  const targetPoints = calcPoints(o.principalAmount, totalDaysCapped);
  const newPoints = Math.max(0, targetPoints - alreadyAccruedPoints);
  if (newPoints > 0) {
    o.pointsAccrued += newPoints;
    appendLog({
      userId: o.userId,
      userName: o.userName,
      behavior: 'FINANCE_HOLD',
      change: newPoints,
      balanceAfter: (findUserById(o.userId)?.points || 0) + newPoints,
      refType: 'finance',
      refId: o.code,
      isAppealable: false,
      createdAt: new Date(horizon).toISOString()
    });
  }
  return { delta, points: newPoints };
}

/** 解锁辅助（mature / early_unlock / cancel 共用） */
export function applyUnlockNow(
  orderId: number,
  kind: 'matured' | 'early_unlocked' | 'cancelled',
  reason?: string
): LockupOrder | undefined {
  const o = findOrderById(orderId);
  if (!o || o.status !== 'active') return undefined;
  const account = findAccount(o.userId);
  if (!account) return undefined;
  const unlockAt = new Date().toISOString();
  const remarkMap: Record<typeof kind, string> = {
    matured: `${o.productName} 到期解锁`,
    early_unlocked: `${o.productName} 提前解锁（利息清零）`,
    cancelled: `${o.productName} 管理员强制取消`
  };
  const remark = remarkMap[kind];
  o.unlockTxnId = applyUnlock(o, unlockAt, remark);
  o.unlockedAt = unlockAt;
  o.status = kind;
  if (kind === 'matured') {
    // 兜底再结算一次到当前
    accrueOrderInterestNow(orderId, unlockAt);
  } else {
    // early_unlocked / cancelled：标记被清零的剩余利息
    const elapsed = Math.max(0, Math.floor((Date.parse(unlockAt) - Date.parse(o.startAt)) / 86400000));
    const remainingDays = Math.max(0, o.lockupDays - elapsed);
    o.forfeitedInterest = calcInterest(o.principalAmount, o.rate.effectiveRate, remainingDays);
    if (kind === 'cancelled') {
      o.cancelledReason = reason;
      o.cancelledBy = 'admin';
    }
  }
  return o;
}

/** 单产品聚合（active 订单数 / 在锁本金 / 已派利息） */
export function aggregateProductKpi(productId: number): {
  activeOrders: number;
  totalPrincipal: string;
  totalInterestPaid: string;
} {
  let active = 0;
  let principal = 0;
  let interestPaid = 0;
  FINANCE_LOCKUP_ORDERS.forEach(o => {
    if (o.productId !== productId) return;
    if (o.status === 'active') {
      active += 1;
      principal += Number(o.principalAmount);
    }
    interestPaid += Number(o.accruedInterest);
  });
  return {
    activeOrders: active,
    totalPrincipal: principal.toFixed(2),
    totalInterestPaid: interestPaid.toFixed(2)
  };
}

/** 用户聚合（用于钱包详情角标） */
export function aggregateUserActiveOrders(userId: number): number {
  return FINANCE_LOCKUP_ORDERS.filter(o => o.userId === userId && o.status === 'active').length;
}

export { calcInterest, calcPoints };
