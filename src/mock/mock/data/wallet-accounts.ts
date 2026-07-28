/**
 * 钱包账户内存池（R-MOD-9 单一真实源）。
 *
 * 给 USERS 中每个用户生成一个 InternalAccount；
 * - 顾客：仅前 5 个 bucket（available / nonWithdrawable / lockedFinance / frozenOrder / frozenRisk），押金桶为 0；
 * - 买手：额外含 depositAvailable / depositGuaranteed（来自旧 buyer-portfolio 对齐迁移）。
 *
 * 同会话状态一致（R-MOCK-6）：调账 / 冻结 / 解冻 / 重置支付密码均直接改本池对象。
 */
import { USERS } from './users';

type InternalAccount = Api.Wallet.InternalAccount;

function nowIso() {
  return new Date().toISOString();
}

/** 给定 userId 一致地伪随机金额（保证 mock 可重现） */
function pseudo(userId: number, factor: number, mod: number): string {
  return Math.floor(((userId * 137 + factor * 31) * 7) % mod).toString();
}

/** 买手押金 seed：取自 4.5 范本（部分 buyer 押金已担保进行中订单占用） */
const BUYER_DEPOSIT_SEED: Record<string, { da: string; dg: string }> = {
  'zhanglilin@example.com': { da: '5000.00', dg: '3200.00' },
  'yangjianjun@example.com': { da: '8000.00', dg: '4500.00' },
  'songruohan@example.com': { da: '3500.00', dg: '1800.00' },
  'feijiayi@example.com': { da: '6000.00', dg: '2200.00' },
  'liaoyichen@example.com': { da: '4200.00', dg: '3100.00' },
  'tangchuyu@example.com': { da: '5500.00', dg: '2800.00' },
  'cuiyuting@example.com': { da: '3800.00', dg: '1500.00' },
  'gaoziyuan@example.com': { da: '7200.00', dg: '5000.00' },
  'wuqiming@example.com': { da: '4500.00', dg: '2300.00' },
  'sujing@example.com': { da: '5200.00', dg: '3500.00' }
};

/**
 * 生成伪 TRC20 地址（R-MOCK-8 V2.0）：
 *   T + 33 位 base58 字符（去除 0/O/I/l）；尾部嵌入 userId 后 4 位以保 seed 稳定。
 *   通过 mock/api/wallet.ts 的 TRC20_RE 正则校验。
 */
function trc20Address(userId: number): string {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const seed = userId * 131 + 17;
  let body = '';
  for (let i = 0; i < 29; i += 1) {
    body += base58[(seed * 7 + i * 13) % base58.length];
  }
  return `T${body}${String(userId).padStart(4, '0')}`;
}

/** 主真实源内存池 */
export const ACCOUNTS: InternalAccount[] = [];

function buildAccount(userId: number): InternalAccount {
  const u = USERS.find(x => x.id === userId);
  if (!u) throw new Error(`User ${userId} not found`);
  const isBuyer = u.isBuyer;
  const base = userId * 13;
  // 买手平均资产高于顾客
  const scale = isBuyer ? 1.6 : 1;
  const available = (((base * 17) % 50000) * scale).toFixed(2);
  const nonWithdrawable = (((base * 7) % 3000) * scale).toFixed(2);
  const lockedFinance = (((base * 31) % 20000) * scale).toFixed(2);
  const frozenOrder = (((base * 11) % 1500) * scale).toFixed(2);
  // 风控冻结：状态为冻结的用户才有
  const frozenRisk = u.status === '2' ? ((base * 5) % 8000).toFixed(2) : '0.00';
  // 已发放利息：约为 nonWithdrawable 的 60%
  const interestAccrued = (Number(nonWithdrawable) * 0.6).toFixed(2);
  // 买手押金（seed 优先；否则按 buyer 通用默认）
  let depositAvailable = '0.00';
  let depositGuaranteed = '0.00';
  if (isBuyer) {
    const depSeed = BUYER_DEPOSIT_SEED[u.email];
    if (depSeed) {
      depositAvailable = depSeed.da;
      depositGuaranteed = depSeed.dg;
    } else {
      depositAvailable = `${pseudo(userId, 3, 6000)}.00`;
      depositGuaranteed = `${pseudo(userId, 5, 4000)}.00`;
    }
  }
  return {
    userId: u.id,
    userName: u.nickname,
    available,
    nonWithdrawable,
    lockedFinance,
    frozenOrder,
    frozenRisk,
    depositAvailable,
    depositGuaranteed,
    interestAccrued,
    // 75% 用户已设置支付密码；userId % 4 === 0 的未设置（演示用）
    payPwdSet: userId % 4 !== 0,
    // 状态为冻结的用户 → 整账户冻结
    frozen: u.status === '2',
    address: trc20Address(userId),
    updatedAt: nowIso()
  };
}

function seedAccounts() {
  ACCOUNTS.length = 0;
  USERS.forEach(u => {
    ACCOUNTS.push(buildAccount(u.id));
  });
}
seedAccounts();

export function findAccount(userId: number): InternalAccount | undefined {
  return ACCOUNTS.find(a => a.userId === userId);
}

/** 投影到 Api.User.WalletSummary（R-MOD-9 派生视图） */
export function asWalletSummary(userId: number): Api.User.WalletSummary | undefined {
  const a = findAccount(userId);
  if (!a) return undefined;
  return {
    address: a.address || '',
    available: a.available,
    nonWithdrawable: a.nonWithdrawable,
    lockedFinance: a.lockedFinance,
    frozenOrder: a.frozenOrder,
    frozenRisk: a.frozenRisk
  };
}

/** 投影到 Api.Buyer.Wallet（R-MOD-9 派生视图） */
export function asBuyerWallet(userId: number): Api.Buyer.Wallet | undefined {
  const a = findAccount(userId);
  if (!a) return undefined;
  return {
    available: a.available,
    depositAvailable: a.depositAvailable,
    depositGuaranteed: a.depositGuaranteed,
    frozenOrder: a.frozenOrder,
    interest: a.interestAccrued
  };
}

/** 安全的 string 数字运算 */
function addStr(a: string, b: string): string {
  return (Number(a) + Number(b)).toFixed(2);
}
function subStr(a: string, b: string): string {
  return Math.max(0, Number(a) - Number(b)).toFixed(2);
}

/** 调账：在指定 bucket 上加减 amount；返回更新后的账户 */
export function applyAdjust(p: {
  account: InternalAccount;
  direction: 'in' | 'out';
  bucket: Api.Wallet.Bucket;
  amount: string;
}): void {
  const cur = p.account[p.bucket] as string;
  p.account[p.bucket] = p.direction === 'in' ? addStr(cur, p.amount) : subStr(cur, p.amount);
  p.account.updatedAt = nowIso();
}

/** 在 bucket 间搬运（风控冻结 / 解冻用） */
export function moveBucket(p: {
  account: InternalAccount;
  fromBucket: Api.Wallet.Bucket;
  toBucket: Api.Wallet.Bucket;
  amount: string;
}): void {
  p.account[p.fromBucket] = subStr(p.account[p.fromBucket] as string, p.amount);
  p.account[p.toBucket] = addStr(p.account[p.toBucket] as string, p.amount);
  p.account.updatedAt = nowIso();
}

/** 全平台聚合：站内 U₊ 总余额（7 bucket 求和） */
export function internalTotal(): string {
  let sum = 0;
  ACCOUNTS.forEach(a => {
    sum +=
      Number(a.available) +
      Number(a.nonWithdrawable) +
      Number(a.lockedFinance) +
      Number(a.frozenOrder) +
      Number(a.frozenRisk) +
      Number(a.depositAvailable) +
      Number(a.depositGuaranteed);
  });
  return sum.toFixed(2);
}

/** 全平台聚合：7 bucket 各自合计 + 已发放利息合计 */
export function internalBreakdown(): Record<Api.Wallet.Bucket | 'interestAccrued', string> {
  const init = {
    available: 0,
    nonWithdrawable: 0,
    lockedFinance: 0,
    frozenOrder: 0,
    frozenRisk: 0,
    depositAvailable: 0,
    depositGuaranteed: 0,
    interestAccrued: 0
  };
  ACCOUNTS.forEach(a => {
    init.available += Number(a.available);
    init.nonWithdrawable += Number(a.nonWithdrawable);
    init.lockedFinance += Number(a.lockedFinance);
    init.frozenOrder += Number(a.frozenOrder);
    init.frozenRisk += Number(a.frozenRisk);
    init.depositAvailable += Number(a.depositAvailable);
    init.depositGuaranteed += Number(a.depositGuaranteed);
    init.interestAccrued += Number(a.interestAccrued);
  });
  return Object.fromEntries(Object.entries(init).map(([k, v]) => [k, v.toFixed(2)])) as Record<
    Api.Wallet.Bucket | 'interestAccrued',
    string
  >;
}

export function frozenAccountCount(): number {
  return ACCOUNTS.filter(a => a.frozen).length;
}

export function activeWalletCount(): number {
  return ACCOUNTS.filter(a => a.payPwdSet && !a.frozen).length;
}
