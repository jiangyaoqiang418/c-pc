/**
 * 顾客黑名单内存池（≥ 8 条 seed = 6 active + 2 removed）。
 *
 * R-MOD-11：顾客黑名单加入 → 强制 /wallet/freeze 整账户冻结 + 切 user.status='2' + withdrawRequiresAudit=true；
 * 移出 → 对称解冻 + status='1' + withdrawRequiresAudit=false。
 * USERS 中相关 6 个 active 用户已在 mock/data/users.ts 预置 status='2' + withdrawRequiresAudit=true。
 *
 * 本 seed 在模块加载时：
 *   1. 为每条 active entry 生成 walletFreezeSnapshot（从 wallet-accounts 当前快照）；
 *   2. 调 appendTxn() 写一条 RISK_FREEZE 流水（refType='blacklist'，关联 entry.id）；
 *   3. 对 removed entry 同时写 RISK_FREEZE + RISK_UNFREEZE 历史流水对。
 *
 * 单一真实源 R-MOD-9：钱包余额从 findAccount() 读取，绝不重复 mock。
 */
import { findAccount } from './wallet-accounts';
import { appendTxn } from './wallet-txns';
import { findUserById } from './users';
import { nextEventId } from './blacklist-events';

type CustomerBlacklistEntry = Api.Blacklist.CustomerBlacklistEntry;
type WalletFreezeSnapshot = Api.Blacklist.WalletFreezeSnapshot;
type BlacklistEvent = Api.Blacklist.BlacklistEvent;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function daysAgo(d: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

interface CustomerSeed {
  userId: number;
  reason: string;
  addedBy: string;
  addedDaysAgo: number;
  removedBy?: string;
  removedReason?: string;
  removedDaysAgo?: number;
}

const SEEDS: CustomerSeed[] = [
  // ===== Active 6 =====（与 users.ts 中 status='2' + withdrawRequiresAudit=true 的用户对齐）
  {
    userId: 5, // 刘亦菲
    reason: '黑钱包入金记录：链上 AML 评分 92 命中 OFAC 制裁名单',
    addedBy: 'risk',
    addedDaysAgo: 18
  },
  {
    userId: 6, // 陈乔乔
    reason: '身份盗用嫌疑：人脸活体检测与证件不符，已上报合规',
    addedBy: 'risk',
    addedDaysAgo: 25
  },
  {
    userId: 11, // 吴心然
    reason: '恶意 chargeback 多次：3 笔订单完成后第三方支付 chargeback，金额合计 8000 U',
    addedBy: 'risk',
    addedDaysAgo: 10
  },
  {
    userId: 14, // 邓方雨
    reason: '关联涉黑账户：与已封禁高危地址有 5 笔双向链上转账',
    addedBy: 'risk',
    addedDaysAgo: 95
  },
  {
    userId: 16, // 郝心雯
    reason: '频繁退款滥用：30 天内 12 单退款，退款率 80%',
    addedBy: 'risk',
    addedDaysAgo: 8
  },
  {
    userId: 17, // 沈奇砚
    reason: 'KYC 信息造假尝试：3 次提交不同身份证号，二代证查询接口未通过',
    addedBy: 'risk',
    addedDaysAgo: 2
  },

  // ===== Removed 2 =====（status='1'，已对称解冻）
  {
    userId: 9, // 胡逸彬
    reason: '黑U入金误报：链上来源地址实际为正规交易所归集地址',
    addedBy: 'risk',
    addedDaysAgo: 60,
    removedBy: 'super',
    removedReason: '申诉成立：用户提供 OKX 提币记录截图，确认地址为正规交易所',
    removedDaysAgo: 52
  },
  {
    userId: 12, // 周维一
    reason: '关联涉黑账户嫌疑：与某高危地址有 1 笔小额转账',
    addedBy: 'risk',
    addedDaysAgo: 70,
    removedBy: 'risk',
    removedReason: '联合调查澄清：该笔转账实为误转，已要求用户重新做钱包绑定',
    removedDaysAgo: 65
  }
];

/** 主真实源 */
export const CUSTOMER_BLACKLIST: CustomerBlacklistEntry[] = [];

function snapshot(userId: number, freezeAt: string): WalletFreezeSnapshot | undefined {
  const a = findAccount(userId);
  if (!a) return undefined;
  const total = (
    Number(a.available) +
    Number(a.nonWithdrawable) +
    Number(a.lockedFinance) +
    Number(a.frozenOrder) +
    Number(a.frozenRisk) +
    Number(a.depositAvailable) +
    Number(a.depositGuaranteed)
  ).toFixed(2);
  return {
    available: a.available,
    nonWithdrawable: a.nonWithdrawable,
    frozenOrder: a.frozenOrder,
    frozenRisk: a.frozenRisk,
    totalAtFreeze: total,
    freezeAt
  };
}

function buildEntry(s: CustomerSeed): CustomerBlacklistEntry {
  const u = findUserById(s.userId);
  if (!u) throw new Error(`User ${s.userId} not found for customer blacklist`);
  const id = nextId();
  const addedAt = daysAgo(s.addedDaysAgo);
  const snap = snapshot(s.userId, addedAt);
  const history: BlacklistEvent[] = [];

  // RISK_FREEZE 流水（refType='blacklist' 表明来源）
  const freezeTxn = appendTxn({
    userId: u.id,
    userName: u.nickname,
    type: 'RISK_FREEZE',
    direction: 'out',
    amount: snap ? snap.totalAtFreeze : '0.00',
    balanceAfter: snap ? snap.available : '0.00',
    refType: 'blacklist',
    refId: `BL-CUS-${id}`,
    operator: s.addedBy,
    remark: `黑名单加入触发整账户冻结：${s.reason}`,
    createdAt: addedAt
  });

  history.push({
    id: nextEventId(),
    targetType: 'customer',
    targetId: id,
    targetLabel: u.nickname,
    action: 'add',
    actor: s.addedBy,
    time: addedAt,
    note: s.reason,
    relatedTxnId: freezeTxn.id
  });

  const entry: CustomerBlacklistEntry = {
    id,
    userId: u.id,
    userName: u.nickname,
    reason: s.reason,
    status: s.removedBy ? 'removed' : 'active',
    addedBy: s.addedBy,
    addedAt,
    walletFreezeSnapshot: snap,
    freezeTxnId: freezeTxn.id,
    history
  };

  if (s.removedBy && s.removedReason && s.removedDaysAgo !== undefined) {
    const removedAt = daysAgo(s.removedDaysAgo);
    const unfreezeTxn = appendTxn({
      userId: u.id,
      userName: u.nickname,
      type: 'RISK_UNFREEZE',
      direction: 'in',
      amount: snap ? snap.totalAtFreeze : '0.00',
      balanceAfter: snap ? snap.available : '0.00',
      refType: 'blacklist',
      refId: `BL-CUS-${id}`,
      operator: s.removedBy,
      remark: `移出黑名单触发整账户解冻：${s.removedReason}`,
      createdAt: removedAt
    });
    entry.removedBy = s.removedBy;
    entry.removedReason = s.removedReason;
    entry.removedAt = removedAt;
    entry.unfreezeTxnId = unfreezeTxn.id;
    history.push({
      id: nextEventId(),
      targetType: 'customer',
      targetId: id,
      targetLabel: u.nickname,
      action: 'remove',
      actor: s.removedBy,
      time: removedAt,
      note: s.removedReason,
      relatedTxnId: unfreezeTxn.id
    });
  }
  return entry;
}

function seed() {
  CUSTOMER_BLACKLIST.length = 0;
  SEEDS.forEach(s => CUSTOMER_BLACKLIST.push(buildEntry(s)));
}
seed();

// ACCOUNTS 引用已通过 findAccount 间接使用

export function findCustomerEntry(id: number): CustomerBlacklistEntry | undefined {
  return CUSTOMER_BLACKLIST.find(e => e.id === id);
}

export function findActiveCustomerEntryByUserId(userId: number): CustomerBlacklistEntry | undefined {
  return CUSTOMER_BLACKLIST.find(e => e.userId === userId && e.status === 'active');
}

export function appendCustomerEntry(entry: Omit<CustomerBlacklistEntry, 'id'>): CustomerBlacklistEntry {
  const next: CustomerBlacklistEntry = { id: nextId(), ...entry };
  CUSTOMER_BLACKLIST.unshift(next);
  return next;
}
