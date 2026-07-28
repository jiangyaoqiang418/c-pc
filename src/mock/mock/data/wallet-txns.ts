/**
 * 钱包流水内存池（append-only）。
 *
 * R-MOCK-2：≥100 条；17 类 TxnType 每类至少 3 条。
 * R-DATA-13 风格：每条流水冗余 userName / balanceAfter 便于历史还原。
 * R-DATA-16：DEPOSIT_IN / WITHDRAW_OUT 必填 chainTxHash + chainWalletId；其他类型严禁填。
 *
 * seed 不直接修改 ACCOUNTS（账户余额已由 wallet-accounts seed 静态初始化好），
 * 仅作为"历史已发生"的可读流水；新发生的写操作（adjust/freeze/unfreeze 等）通过 appendTxn 落库。
 */
import { ACCOUNTS } from './wallet-accounts';

type Txn = Api.Wallet.Txn;
type TxnType = Api.Wallet.TxnType;

let txnId = 0;
function nextTxnId(): number {
  txnId += 1;
  return txnId;
}

function daysAgo(d: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

/**
 * 生成伪 txHash（R-MOCK-8 V2.0）：
 *   - TRON 风格：纯 64 位 hex（无 `0x` 前缀）
 *   - EVM 风格（ETH/BSC）：`0x` + 64 位 hex
 *   入参 chain 默认 'tron'（项目主链）。
 */
function fakeHash(n: number, chain: 'tron' | 'evm' = 'tron'): string {
  const hex = '0123456789abcdef';
  let h = chain === 'evm' ? '0x' : '';
  for (let i = 0; i < 64; i += 1) h += hex[(n * 7 + i * 13) % 16];
  return h;
}

/**
 * 入金来源地址池（R-DATA-22 V2.0）。
 * 前 3 个地址刻意命中 blacklist-addresses.ts 中已 active 的链上黑钱包（演示反向关联）：
 *   TSp4r9Yk2Hf7… 关联用户 5（刘亦菲）
 *   TUk2m7Wf5Hn4… 关联用户 6（陈乔乔）
 *   TVn7r3Yp4Hf8… 关联用户 11（吴心然）
 * 后续几个为正常入金的伪 TRC20 地址。
 */
const DEPOSIT_FROM_ADDRESSES = [
  'TSp4r9Yk2Hf7Vn5Cj3Mt8Bs1Lq6Wp4Zr3h', // ⚠ 黑名单（用户 5）
  'TUk2m7Wf5Hn4Cj9Vp3Lt8Bs6Yq1Mr2Zp7w', // ⚠ 黑名单（用户 6）
  'TVn7r3Yp4Hf8Vk2Cj5Mt9Bs6Lq1Wp4Zr2h', // ⚠ 黑名单（用户 11）
  'TG1Xy2Vn7Wp4Hf3Cj5Mt8Bs6Lq1Yr2Zk9m', // 干净
  'TH2Yz3Vp8Wn5Hf4Cj6Mt9Bs7Lq2Yr3Zk1n', // 干净
  'TJ3Yw4Vp9Wn6Hf5Cj7Mt2Bs8Lq3Yr4Zk2p', // 干净
  'TK4Yw5Vp1Wn7Hf6Cj8Mt3Bs9Lq4Yr5Zk3q', // 干净
  'TL5Yw6Vp2Wn8Hf7Cj9Mt4Bs1Lq5Yr6Zk4r', // 干净
  'TM6Yw7Vp3Wn9Hf8Cj1Mt5Bs2Lq6Yr7Zk5s', // 干净
  'TN7Yw8Vp4Wn1Hf9Cj2Mt6Bs3Lq7Yr8Zk6t' // 干净
];

/** 流水池 */
export const TXNS: Txn[] = [];

interface MakeOpts {
  type: TxnType;
  userIndex: number; // 用 ACCOUNTS 下标循环挑选
  daysAgo: number;
  hour?: number;
  amount: string;
  bucketFrom?: Api.Wallet.Bucket;
  bucketTo?: Api.Wallet.Bucket;
  fee?: string;
  feeFromBalance?: string;
  feeFromAmount?: string;
  chainWalletId?: number;
  chainTxHash?: string;
  refType?: Txn['refType'];
  refId?: string;
  operator?: string;
  remark?: string;
}

function make(opts: MakeOpts): Txn {
  const account = ACCOUNTS[opts.userIndex % ACCOUNTS.length];
  // direction 推断：amount 进入 user → in；流出 → out；纯桶搬运（如 ORDER_FREEZE）按业务约定
  const inTypes: TxnType[] = [
    'DEPOSIT_IN',
    'INTERNAL_RECEIVE',
    'INTEREST_ACCRUE',
    'ADJUST_PLUS',
    'DEPOSIT_RELEASE',
    'ORDER_SETTLE',
    'FINANCE_UNLOCK',
    'RISK_UNFREEZE',
    'INTERNAL_REFUND'
  ];
  const direction: 'in' | 'out' = inTypes.includes(opts.type) ? 'in' : 'out';
  return {
    id: nextTxnId(),
    userId: account.userId,
    userName: account.userName,
    type: opts.type,
    direction,
    amount: opts.amount,
    balanceAfter: account.available, // seed 阶段不真实演化，取当前 available 作示意
    bucketFrom: opts.bucketFrom,
    bucketTo: opts.bucketTo,
    fee: opts.fee,
    feeFromBalance: opts.feeFromBalance,
    feeFromAmount: opts.feeFromAmount,
    chainWalletId: opts.chainWalletId,
    chainTxHash: opts.chainTxHash,
    refType: opts.refType,
    refId: opts.refId,
    operator: opts.operator,
    remark: opts.remark,
    createdAt: daysAgo(opts.daysAgo, opts.hour || 0)
  };
}

/** DEPOSIT_IN seed：10 条；前 3 条 fromAddress 命中链上黑名单（演示反向关联） */
function seedDepositIn(nextUser: () => number) {
  for (let i = 0; i < 10; i += 1) {
    const fromAddr = DEPOSIT_FROM_ADDRESSES[i];
    const isBlackSource = i < 3;
    TXNS.push({
      ...make({
        type: 'DEPOSIT_IN',
        userIndex: nextUser(),
        daysAgo: 1 + i * 3,
        amount: (500 + i * 150).toFixed(2),
        bucketTo: 'available',
        chainWalletId: 1,
        chainTxHash: fakeHash(i + 1, 'tron'),
        refType: 'finance',
        remark: isBlackSource ? `okx 钱包入金（⚠ 来源地址后被加入黑名单）` : `okx 钱包入金`
      }),
      fromAddress: fromAddr
    });
  }
}

/** WITHDRAW_OUT seed：10 条；toAddress 填用户绑定的链上地址 */
function seedWithdrawOut(nextUser: () => number) {
  for (let i = 0; i < 10; i += 1) {
    const amount = (300 + i * 100).toFixed(2);
    const fee = (5 + i * 0.5).toFixed(2);
    const idx = nextUser();
    const account = ACCOUNTS[idx % ACCOUNTS.length];
    TXNS.push({
      ...make({
        type: 'WITHDRAW_OUT',
        userIndex: idx,
        daysAgo: 2 + i * 4,
        amount,
        bucketFrom: 'available',
        fee,
        feeFromBalance: fee,
        feeFromAmount: '0.00',
        chainWalletId: 2,
        chainTxHash: fakeHash(i + 100, 'tron'),
        refType: 'finance',
        remark: '出金至外部链上钱包'
      }),
      toAddress: account.address
    });
  }
}

function seedTxns() {
  TXNS.length = 0;
  let userIdx = 0;
  const nextUser = () => {
    userIdx = (userIdx + 1) % ACCOUNTS.length;
    return userIdx;
  };

  seedDepositIn(nextUser);
  seedWithdrawOut(nextUser);

  // ===== INTERNAL_PAY（站内支付，8 条） =====
  for (let i = 0; i < 8; i += 1) {
    TXNS.push(
      make({
        type: 'INTERNAL_PAY',
        userIndex: nextUser(),
        daysAgo: 1 + i * 2,
        amount: (180 + i * 50).toFixed(2),
        bucketFrom: 'available',
        bucketTo: 'frozenOrder',
        refType: 'order',
        refId: `O20260${1000 + i}`,
        remark: '下单付款 → 订单冻结'
      })
    );
  }

  // ===== INTERNAL_RECEIVE（站内收款，8 条） =====
  for (let i = 0; i < 8; i += 1) {
    TXNS.push(
      make({
        type: 'INTERNAL_RECEIVE',
        userIndex: nextUser(),
        daysAgo: 3 + i * 3,
        amount: (200 + i * 80).toFixed(2),
        bucketTo: 'available',
        refType: 'order',
        refId: `O20260${2000 + i}`,
        remark: '订单完成结算 → 卖方可用'
      })
    );
  }

  // ===== INTERNAL_REFUND（3 条） =====
  for (let i = 0; i < 3; i += 1) {
    TXNS.push(
      make({
        type: 'INTERNAL_REFUND',
        userIndex: nextUser(),
        daysAgo: 5 + i * 4,
        amount: (150 + i * 20).toFixed(2),
        bucketFrom: 'frozenOrder',
        bucketTo: 'available',
        refType: 'order',
        refId: `O20260${3000 + i}`,
        remark: '订单取消退款'
      })
    );
  }

  // ===== INTEREST_ACCRUE（利息发放，6 条） =====
  for (let i = 0; i < 6; i += 1) {
    TXNS.push(
      make({
        type: 'INTEREST_ACCRUE',
        userIndex: nextUser(),
        daysAgo: 1 + i,
        amount: (10 + i * 3).toFixed(2),
        bucketTo: 'nonWithdrawable',
        refType: 'finance',
        refId: `FIN-INT-${i + 1}`,
        remark: '每日利息发放'
      })
    );
  }

  // ===== FINANCE_LOCK（锁仓，5 条） =====
  for (let i = 0; i < 5; i += 1) {
    TXNS.push(
      make({
        type: 'FINANCE_LOCK',
        userIndex: nextUser(),
        daysAgo: 10 + i * 6,
        amount: (1000 + i * 500).toFixed(2),
        bucketFrom: 'available',
        bucketTo: 'lockedFinance',
        refType: 'finance',
        refId: `FIN-LOCK-${i + 1}`,
        remark: '30 天定期锁仓'
      })
    );
  }

  // ===== FINANCE_UNLOCK（解仓，3 条；含 1 条提前解锁） =====
  for (let i = 0; i < 3; i += 1) {
    TXNS.push(
      make({
        type: 'FINANCE_UNLOCK',
        userIndex: nextUser(),
        daysAgo: 20 + i * 5,
        amount: (800 + i * 200).toFixed(2),
        bucketFrom: 'lockedFinance',
        bucketTo: 'available',
        refType: 'finance',
        refId: `FIN-LOCK-${i + 10}`,
        remark: i === 2 ? '提前解锁（利息清零）' : '到期解锁'
      })
    );
  }

  // ===== DEPOSIT_PLEDGE（押金缴纳，4 条） =====
  for (let i = 0; i < 4; i += 1) {
    TXNS.push(
      make({
        type: 'DEPOSIT_PLEDGE',
        userIndex: nextUser(),
        daysAgo: 30 + i * 10,
        amount: (1000 + i * 500).toFixed(2),
        bucketFrom: 'available',
        bucketTo: 'depositAvailable',
        refType: 'manual',
        operator: 'finance',
        remark: '买手首次缴纳押金'
      })
    );
  }

  // ===== DEPOSIT_RELEASE（押金释放，3 条） =====
  for (let i = 0; i < 3; i += 1) {
    TXNS.push(
      make({
        type: 'DEPOSIT_RELEASE',
        userIndex: nextUser(),
        daysAgo: 15 + i * 4,
        amount: (300 + i * 100).toFixed(2),
        bucketFrom: 'depositGuaranteed',
        bucketTo: 'depositAvailable',
        refType: 'order',
        refId: `O20260${5000 + i}`,
        remark: '订单完成释放担保押金'
      })
    );
  }

  // ===== DEPOSIT_FORFEIT（押金扣罚，3 条） =====
  for (let i = 0; i < 3; i += 1) {
    TXNS.push(
      make({
        type: 'DEPOSIT_FORFEIT',
        userIndex: nextUser(),
        daysAgo: 45 + i * 6,
        amount: (200 + i * 100).toFixed(2),
        bucketFrom: 'depositGuaranteed',
        refType: 'risk',
        refId: `AFT-${1000 + i}`,
        operator: 'risk',
        remark: '售后赔付扣除押金'
      })
    );
  }

  // ===== ORDER_FREEZE（4 条） =====
  for (let i = 0; i < 4; i += 1) {
    TXNS.push(
      make({
        type: 'ORDER_FREEZE',
        userIndex: nextUser(),
        daysAgo: 2 + i,
        amount: (250 + i * 60).toFixed(2),
        bucketFrom: 'available',
        bucketTo: 'frozenOrder',
        refType: 'order',
        refId: `O20260${6000 + i}`,
        remark: '订单创建冻结货款'
      })
    );
  }

  // ===== ORDER_SETTLE（4 条） =====
  for (let i = 0; i < 4; i += 1) {
    TXNS.push(
      make({
        type: 'ORDER_SETTLE',
        userIndex: nextUser(),
        daysAgo: 5 + i * 2,
        amount: (240 + i * 60).toFixed(2),
        bucketFrom: 'frozenOrder',
        bucketTo: 'available',
        refType: 'order',
        refId: `O20260${7000 + i}`,
        remark: '订单结算到账（已扣手续费）'
      })
    );
  }

  // ===== RISK_FREEZE（3 条） =====
  for (let i = 0; i < 3; i += 1) {
    TXNS.push(
      make({
        type: 'RISK_FREEZE',
        userIndex: nextUser(),
        daysAgo: 25 + i * 8,
        amount: (500 + i * 200).toFixed(2),
        bucketFrom: 'available',
        bucketTo: 'frozenRisk',
        refType: 'risk',
        refId: `RISK-${1000 + i}`,
        operator: 'risk',
        remark: '黑名单触发风控冻结'
      })
    );
  }

  // ===== RISK_UNFREEZE（3 条） =====
  for (let i = 0; i < 3; i += 1) {
    TXNS.push(
      make({
        type: 'RISK_UNFREEZE',
        userIndex: nextUser(),
        daysAgo: 12 + i * 5,
        amount: (300 + i * 150).toFixed(2),
        bucketFrom: 'frozenRisk',
        bucketTo: 'available',
        refType: 'risk',
        refId: `RISK-${2000 + i}`,
        operator: 'risk',
        remark: '风控解除'
      })
    );
  }

  // ===== ADJUST_PLUS（4 条） =====
  for (let i = 0; i < 4; i += 1) {
    TXNS.push(
      make({
        type: 'ADJUST_PLUS',
        userIndex: nextUser(),
        daysAgo: 40 + i * 7,
        amount: (100 + i * 50).toFixed(2),
        bucketTo: 'available',
        refType: 'manual',
        operator: ['finance', 'super', 'risk'][i % 3],
        remark: '人工调账（活动补偿）'
      })
    );
  }

  // ===== ADJUST_MINUS（4 条） =====
  for (let i = 0; i < 4; i += 1) {
    TXNS.push(
      make({
        type: 'ADJUST_MINUS',
        userIndex: nextUser(),
        daysAgo: 35 + i * 6,
        amount: (50 + i * 30).toFixed(2),
        bucketFrom: 'available',
        refType: 'manual',
        operator: ['finance', 'super'][i % 2],
        remark: '人工调账（错账纠正）'
      })
    );
  }

  // ===== FEE_DEDUCT（4 条） =====
  for (let i = 0; i < 4; i += 1) {
    TXNS.push(
      make({
        type: 'FEE_DEDUCT',
        userIndex: nextUser(),
        daysAgo: 6 + i * 2,
        amount: (3 + i).toFixed(2),
        bucketFrom: 'available',
        refType: 'order',
        refId: `O20260${8000 + i}`,
        remark: '订单手续费扣除'
      })
    );
  }
}
seedTxns();

export function findTxnById(id: number): Txn | undefined {
  return TXNS.find(t => t.id === id);
}

export function appendTxn(t: Omit<Txn, 'id'>): Txn {
  const next: Txn = { id: nextTxnId(), ...t };
  TXNS.unshift(next); // 最新在前
  return next;
}

/** 当日入金 / 出金 / 站内交易聚合（按 UTC 当日） */
export function todayAggregates(): { depositIn: string; withdrawOut: string; internalVolume: string } {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  let dep = 0;
  let wit = 0;
  let inter = 0;
  TXNS.forEach(t => {
    if (!t.createdAt.startsWith(todayPrefix)) return;
    if (t.type === 'DEPOSIT_IN') dep += Number(t.amount);
    else if (t.type === 'WITHDRAW_OUT') wit += Number(t.amount);
    else if (t.type.startsWith('INTERNAL_')) inter += Number(t.amount);
  });
  return { depositIn: dep.toFixed(2), withdrawOut: wit.toFixed(2), internalVolume: inter.toFixed(2) };
}
