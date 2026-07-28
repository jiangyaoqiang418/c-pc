/**
 * 入金记录池（R-DATA-38 / R-MOD-29）。
 *
 * 20 条覆盖 5 态：
 *   - pending_aml × 5（5 条新进，AML 检查进行中）
 *   - aml_blocked × 3（黑钱包地址命中）
 *   - pending_credit × 2（AML 通过待入账）
 *   - credited × 8（已入账，含 wallet DEPOSIT_IN 流水联动）
 *   - reversed × 2（误转账退回）
 */
import { performAmlCheck } from '../aml-stub';
import { USERS, findUserById } from '../data/users';
import { findAccount } from '../data/wallet-accounts';
import { appendTxn } from '../data/wallet-txns';
import { CHAIN_WALLETS } from '../data/wallet-chain-wallets';

type DepositRecord = Api.Fund.DepositRecord;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function makeCode(seq: number): string {
  return `DEP-2026-${String(90000 + seq).padStart(5, '0')}`;
}

function nowMinus(daysAgo: number, h = 9): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

function trc20Address(seed: number): string {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const s = seed * 137 + 7;
  let body = '';
  for (let i = 0; i < 33; i += 1) body += base58[(s * 11 + i * 13) % base58.length];
  return `T${body}`;
}

function fakeHash(seed: number): string {
  const hex = '0123456789abcdef';
  const s = seed * 31 + 11;
  let h = '';
  for (let i = 0; i < 64; i += 1) h += hex[(s * 7 + i * 5) % hex.length];
  return h;
}

interface Seed {
  status: Api.Fund.DepositStatus;
  userIndex: number;
  channel: Api.Fund.ChannelKind;
  chain: Api.Fund.Chain;
  amount: string;
  daysAgo: number;
  blackAddr?: boolean;
  reversedReason?: string;
}

const SEEDS: Seed[] = [
  // pending_aml × 5
  { status: 'pending_aml', userIndex: 0, channel: 'okx', chain: 'TRON', amount: '500.00', daysAgo: 0 },
  { status: 'pending_aml', userIndex: 1, channel: 'okx', chain: 'TRON', amount: '1200.00', daysAgo: 0 },
  { status: 'pending_aml', userIndex: 2, channel: 'sub_wallet', chain: 'ETH', amount: '3000.00', daysAgo: 0 },
  { status: 'pending_aml', userIndex: 3, channel: 'direct_transfer', chain: 'BSC', amount: '800.00', daysAgo: 0 },
  { status: 'pending_aml', userIndex: 4, channel: 'okx', chain: 'TRON', amount: '2500.00', daysAgo: 0 },

  // aml_blocked × 3（黑钱包地址）
  {
    status: 'aml_blocked',
    userIndex: 5,
    channel: 'direct_transfer',
    chain: 'TRON',
    amount: '4000.00',
    daysAgo: 1,
    blackAddr: true
  },
  {
    status: 'aml_blocked',
    userIndex: 6,
    channel: 'direct_transfer',
    chain: 'ETH',
    amount: '8000.00',
    daysAgo: 2,
    blackAddr: true
  },
  {
    status: 'aml_blocked',
    userIndex: 7,
    channel: 'direct_transfer',
    chain: 'TRON',
    amount: '500.00',
    daysAgo: 1,
    blackAddr: true
  },

  // pending_credit × 2
  { status: 'pending_credit', userIndex: 8, channel: 'okx', chain: 'TRON', amount: '1500.00', daysAgo: 1 },
  { status: 'pending_credit', userIndex: 9, channel: 'okx', chain: 'ETH', amount: '5000.00', daysAgo: 2 },

  // credited × 8
  { status: 'credited', userIndex: 10, channel: 'okx', chain: 'TRON', amount: '300.00', daysAgo: 3 },
  { status: 'credited', userIndex: 11, channel: 'okx', chain: 'TRON', amount: '2000.00', daysAgo: 5 },
  { status: 'credited', userIndex: 12, channel: 'sub_wallet', chain: 'BSC', amount: '1200.00', daysAgo: 7 },
  { status: 'credited', userIndex: 13, channel: 'okx', chain: 'TRON', amount: '800.00', daysAgo: 10 },
  { status: 'credited', userIndex: 14, channel: 'okx', chain: 'ETH', amount: '6000.00', daysAgo: 12 },
  { status: 'credited', userIndex: 15, channel: 'okx', chain: 'TRON', amount: '450.00', daysAgo: 15 },
  { status: 'credited', userIndex: 0, channel: 'okx', chain: 'TRON', amount: '900.00', daysAgo: 20 },
  { status: 'credited', userIndex: 1, channel: 'okx', chain: 'BSC', amount: '350.00', daysAgo: 25 },

  // reversed × 2
  {
    status: 'reversed',
    userIndex: 16,
    channel: 'direct_transfer',
    chain: 'TRON',
    amount: '120.00',
    daysAgo: 8,
    reversedReason: '金额过小且备注异常，已退回原地址'
  },
  {
    status: 'reversed',
    userIndex: 17,
    channel: 'direct_transfer',
    chain: 'ETH',
    amount: '10000.00',
    daysAgo: 14,
    reversedReason: '用户误转，KYC 已核实，已退回'
  }
];

const BLACK_ADDRESSES_FOR_AML = [
  'TSp4r9Yk2Hf7HnL3kFcdEvQXz4WnT9pMxA',
  'TUk2m7Wf5Hn4Hp9XfRcMvBz7QyKjL3rWnD',
  'TVn7r3Yp4Hf8Hn3XfPcKvDz9YyMjL1rWoE'
];

export const FUND_DEPOSITS: DepositRecord[] = [];

function buildDeposit(s: Seed, seq: number): DepositRecord {
  const user = findUserById(USERS[s.userIndex % USERS.length].id);
  if (!user) throw new Error('user not found');
  const chainWallet = CHAIN_WALLETS.find(w => w.chain === s.chain && w.purpose === 'income') || CHAIN_WALLETS[0];
  const fromAddress = s.blackAddr
    ? BLACK_ADDRESSES_FOR_AML[seq % BLACK_ADDRESSES_FOR_AML.length]
    : trc20Address(seq * 31);
  const callbackAt = nowMinus(s.daysAgo, 8);

  const deposit: DepositRecord = {
    id: nextId(),
    code: makeCode(seq),
    userId: user.id,
    userName: user.nickname,
    channel: s.channel,
    fromAddress,
    toChainWalletId: chainWallet.id,
    toChainWalletName: chainWallet.name,
    chain: s.chain,
    amount: s.amount,
    chainTxHash: fakeHash(seq * 17),
    status: s.status,
    callbackAt,
    createdAt: callbackAt
  };

  // AML 快照
  if (s.status === 'aml_blocked' || s.status === 'credited' || s.status === 'pending_credit') {
    const chainMap: Record<Api.Fund.Chain, 'TRC20' | 'ERC20' | 'BSC'> = { TRON: 'TRC20', ETH: 'ERC20', BSC: 'BSC' };
    const result = performAmlCheck({
      address: fromAddress,
      chain: chainMap[s.chain],
      asset: 'USDT'
    });
    if ('decision' in result) {
      deposit.amlSnapshot = result;
    }
  }

  // credited：写 wallet DEPOSIT_IN 流水
  if (s.status === 'credited') {
    const account = findAccount(user.id);
    if (account) {
      const creditedAt = nowMinus(Math.max(0, s.daysAgo - 1), 12);
      account.available = (Number(account.available) + Number(s.amount)).toFixed(2);
      const txn = appendTxn({
        userId: user.id,
        userName: user.nickname,
        type: 'DEPOSIT_IN',
        direction: 'in',
        amount: s.amount,
        balanceAfter: account.available,
        bucketTo: 'available',
        chainWalletId: chainWallet.id,
        chainTxHash: deposit.chainTxHash,
        fromAddress,
        refType: 'finance',
        refId: deposit.code,
        operator: 'system',
        remark: `${s.channel} 入金 ${s.chain}`,
        createdAt: creditedAt
      });
      deposit.creditedAt = creditedAt;
      deposit.creditTxnId = txn.id;
    }
  }
  if (s.status === 'reversed') {
    deposit.reversedReason = s.reversedReason;
    deposit.reversedBy = 'finance';
  }
  return deposit;
}

function runSeed(): void {
  FUND_DEPOSITS.length = 0;
  idCursor = 0;
  SEEDS.forEach((s, idx) => {
    try {
      FUND_DEPOSITS.push(buildDeposit(s, idx + 1));
    } catch {
      // skip
    }
  });
}
runSeed();

export function findDepositById(id: number): DepositRecord | undefined {
  return FUND_DEPOSITS.find(d => d.id === id);
}

export function appendDeposit(d: Omit<DepositRecord, 'id'>): DepositRecord {
  const next: DepositRecord = { id: nextId(), ...d };
  FUND_DEPOSITS.unshift(next);
  return next;
}

/** OKX 回调入口（mock 模拟）：执行 AML 检查 + 入账 / 阻断 */
export function processCallback(p: Api.Fund.CallbackOkxParams): DepositRecord | { error: string } {
  const user = findUserById(p.userId);
  if (!user) return { error: '用户不存在' };
  const chainWallet = CHAIN_WALLETS.find(w => w.id === p.chainWalletId);
  if (!chainWallet) return { error: '链上钱包不存在' };
  const code = makeCode(FUND_DEPOSITS.length + 1);
  const callbackAt = new Date().toISOString();

  const chainKindMap: Record<Api.Fund.Chain, 'TRC20' | 'ERC20' | 'BSC'> = { TRON: 'TRC20', ETH: 'ERC20', BSC: 'BSC' };
  const amlResult = performAmlCheck({ address: p.fromAddress, chain: chainKindMap[p.chain], asset: 'USDT' });
  const decided = 'decision' in amlResult;

  const deposit = appendDeposit({
    code,
    userId: user.id,
    userName: user.nickname,
    channel: 'okx',
    fromAddress: p.fromAddress,
    toChainWalletId: chainWallet.id,
    toChainWalletName: chainWallet.name,
    chain: p.chain,
    amount: p.amount,
    chainTxHash: p.chainTxHash,
    status: 'pending_aml',
    amlSnapshot: decided ? amlResult : undefined,
    callbackAt,
    createdAt: callbackAt
  });

  if (decided) {
    if (amlResult.decision.action === 'BLOCK') {
      deposit.status = 'aml_blocked';
    } else if (amlResult.decision.action === 'MANUAL_REVIEW') {
      deposit.status = 'pending_credit';
    } else {
      // ALLOW → 直接入账
      const account = findAccount(user.id);
      if (account) {
        account.available = (Number(account.available) + Number(p.amount)).toFixed(2);
        const txn = appendTxn({
          userId: user.id,
          userName: user.nickname,
          type: 'DEPOSIT_IN',
          direction: 'in',
          amount: p.amount,
          balanceAfter: account.available,
          bucketTo: 'available',
          chainWalletId: chainWallet.id,
          chainTxHash: p.chainTxHash,
          fromAddress: p.fromAddress,
          refType: 'finance',
          refId: deposit.code,
          operator: 'system',
          remark: `OKX 入金 ${p.chain}`,
          createdAt: new Date().toISOString()
        });
        deposit.status = 'credited';
        deposit.creditedAt = new Date().toISOString();
        deposit.creditTxnId = txn.id;
      }
    }
  }
  return deposit;
}

/** 人工放行 aml_blocked 入金 */
export function manualCredit(deposit: DepositRecord, operator: string): DepositRecord | { error: string } {
  if (deposit.status !== 'aml_blocked' && deposit.status !== 'pending_credit') {
    return { error: `当前状态 ${deposit.status} 无法放行` };
  }
  const user = findUserById(deposit.userId);
  if (!user) return { error: '用户不存在' };
  const account = findAccount(user.id);
  if (!account) return { error: '钱包账户不存在' };
  account.available = (Number(account.available) + Number(deposit.amount)).toFixed(2);
  const txn = appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'DEPOSIT_IN',
    direction: 'in',
    amount: deposit.amount,
    balanceAfter: account.available,
    bucketTo: 'available',
    chainWalletId: deposit.toChainWalletId,
    chainTxHash: deposit.chainTxHash,
    fromAddress: deposit.fromAddress,
    refType: 'finance',
    refId: deposit.code,
    operator,
    remark: `人工放行入金 ${deposit.chain}`,
    createdAt: new Date().toISOString()
  });
  deposit.status = 'credited';
  deposit.creditedAt = new Date().toISOString();
  deposit.creditTxnId = txn.id;
  return deposit;
}

export function reverseDeposit(deposit: DepositRecord, reason: string, operator: string): DepositRecord {
  deposit.status = 'reversed';
  deposit.reversedReason = reason;
  deposit.reversedBy = operator;
  return deposit;
}
