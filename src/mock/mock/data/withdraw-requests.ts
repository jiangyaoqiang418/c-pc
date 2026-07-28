/**
 * 提现请求池（R-DATA-37 / R-MOD-28）。
 *
 * 20 条覆盖 5 态：pending 5 / auditing 4 / approved 3 / paid 5 / rejected 3。
 * paid 条目 seed 阶段写 WITHDRAW_OUT + FEE_DEDUCT 流水。
 */
import { USERS, findUserById } from './users';
import { findAccount, moveBucket } from './wallet-accounts';
import { appendTxn } from './wallet-txns';
import { CHAIN_WALLETS } from './wallet-chain-wallets';
import { findFeeConfig } from './withdraw-fee-config';

type RequestRecord = Api.Withdraw.RequestRecord;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function makeCode(seq: number): string {
  return `WD-2026-${String(70000 + seq).padStart(5, '0')}`;
}

function nowMinus(daysAgo: number, h = 10): string {
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
  status: Api.Withdraw.RequestStatus;
  userIndex: number;
  amount: string;
  chain: Api.Withdraw.Chain;
  daysAgo: number;
  requiresAudit?: boolean;
  rejectReason?: Api.Withdraw.RejectReason;
}

const SEEDS: Seed[] = [
  // pending × 5
  { status: 'pending', userIndex: 0, amount: '500.00', chain: 'TRON', daysAgo: 0 },
  { status: 'pending', userIndex: 1, amount: '2000.00', chain: 'TRON', daysAgo: 0 },
  { status: 'pending', userIndex: 2, amount: '6000.00', chain: 'ETH', daysAgo: 0, requiresAudit: true },
  { status: 'pending', userIndex: 3, amount: '100.00', chain: 'TRON', daysAgo: 1 },
  { status: 'pending', userIndex: 4, amount: '8000.00', chain: 'BSC', daysAgo: 1, requiresAudit: true },

  // auditing × 4（含 2 黑名单触发）
  { status: 'auditing', userIndex: 5, amount: '1500.00', chain: 'TRON', daysAgo: 2 },
  { status: 'auditing', userIndex: 6, amount: '12000.00', chain: 'ETH', daysAgo: 2, requiresAudit: true },
  { status: 'auditing', userIndex: 7, amount: '3000.00', chain: 'TRON', daysAgo: 3, requiresAudit: true },
  { status: 'auditing', userIndex: 8, amount: '800.00', chain: 'TRON', daysAgo: 3 },

  // approved × 3
  { status: 'approved', userIndex: 9, amount: '400.00', chain: 'TRON', daysAgo: 4 },
  { status: 'approved', userIndex: 10, amount: '2000.00', chain: 'BSC', daysAgo: 5 },
  { status: 'approved', userIndex: 11, amount: '6500.00', chain: 'ETH', daysAgo: 5, requiresAudit: true },

  // paid × 5（含 wallet 流水联动）
  { status: 'paid', userIndex: 12, amount: '500.00', chain: 'TRON', daysAgo: 8 },
  { status: 'paid', userIndex: 13, amount: '3500.00', chain: 'TRON', daysAgo: 10 },
  { status: 'paid', userIndex: 14, amount: '8000.00', chain: 'ETH', daysAgo: 12 },
  { status: 'paid', userIndex: 15, amount: '1200.00', chain: 'BSC', daysAgo: 14 },
  { status: 'paid', userIndex: 0, amount: '300.00', chain: 'TRON', daysAgo: 18 },

  // rejected × 3（各 reject reason 至少 1 条）
  { status: 'rejected', userIndex: 5, amount: '600.00', chain: 'TRON', daysAgo: 6, rejectReason: 'kyc_invalid' },
  { status: 'rejected', userIndex: 11, amount: '1500.00', chain: 'ETH', daysAgo: 7, rejectReason: 'aml_block' },
  {
    status: 'rejected',
    userIndex: 16,
    amount: '200.00',
    chain: 'TRON',
    daysAgo: 9,
    rejectReason: 'balance_insufficient'
  }
];

export const WITHDRAW_REQUESTS: RequestRecord[] = [];

function computeFees(
  amount: string,
  chain: Api.Withdraw.Chain
): {
  feeGas: string;
  feeService: string;
  feeTotal: string;
  feeFromBalance: string;
  feeFromAmount: string;
  netAmount: string;
} {
  const cfg = findFeeConfig(chain);
  const gas = Number(cfg?.gasFlat || 2);
  const serviceRate = Number(cfg?.serviceRate || 0.5);
  const service = Math.max(1, (Number(amount) * serviceRate) / 100);
  const total = gas + service;
  // mock 简化：从 amount 扣手续费
  const feeFromAmount = total;
  const feeFromBalance = 0;
  return {
    feeGas: gas.toFixed(2),
    feeService: service.toFixed(2),
    feeTotal: total.toFixed(2),
    feeFromBalance: feeFromBalance.toFixed(2),
    feeFromAmount: feeFromAmount.toFixed(2),
    netAmount: (Number(amount) - feeFromAmount).toFixed(2)
  };
}

function buildRequest(s: Seed, seq: number): RequestRecord {
  const user = USERS[s.userIndex % USERS.length];
  const fees = computeFees(s.amount, s.chain);
  const code = makeCode(seq);
  const createdAt = nowMinus(s.daysAgo, 10);

  const req: RequestRecord = {
    id: nextId(),
    code,
    userId: user.id,
    userName: user.nickname,
    isBuyer: user.isBuyer,
    requestAmount: s.amount,
    toAddress: trc20Address(seq * 31),
    chain: s.chain,
    feeGas: fees.feeGas,
    feeService: fees.feeService,
    feeTotal: fees.feeTotal,
    feeFromBalance: fees.feeFromBalance,
    feeFromAmount: fees.feeFromAmount,
    netAmount: fees.netAmount,
    status: s.status,
    requiresAudit: s.requiresAudit || false,
    auditReason: s.requiresAudit ? '大额或黑名单标记，需人工审核' : undefined,
    createdAt
  };

  if (s.status === 'auditing' || s.status === 'approved' || s.status === 'paid') {
    req.auditedBy = s.requiresAudit ? 'risk' : 'finance';
    req.auditedAt = nowMinus(Math.max(0, s.daysAgo - 1), 8);
    req.auditNote = '审核通过，符合出金条件';
  }
  if (s.status === 'rejected') {
    req.auditedBy = 'risk';
    req.auditedAt = nowMinus(Math.max(0, s.daysAgo - 1), 8);
    req.auditNote = '不符合出金条件';
    req.rejectReason = s.rejectReason;
  }
  if (s.status === 'paid') {
    req.paidBy = 'finance';
    req.paidAt = nowMinus(Math.max(0, s.daysAgo - 2), 14);
    const chainWallet = CHAIN_WALLETS.find(w => w.chain === s.chain && w.purpose === 'outcome') || CHAIN_WALLETS[0];
    req.chainWalletId = chainWallet?.id;
    req.chainTxHash = fakeHash(seq * 17);

    // 联动钱包：写 WITHDRAW_OUT + FEE_DEDUCT
    const account = findAccount(user.id);
    if (account) {
      // 若可用余额不足，先补足（保证 seed 稳定）
      if (Number(account.available) < Number(s.amount)) {
        account.available = (Number(account.available) + Number(s.amount) + 100).toFixed(2);
      }
      // 主流水：WITHDRAW_OUT
      const txn = appendTxn({
        userId: user.id,
        userName: user.nickname,
        type: 'WITHDRAW_OUT',
        direction: 'out',
        amount: s.amount,
        balanceAfter: account.available,
        bucketFrom: 'available',
        fee: fees.feeTotal,
        feeFromBalance: fees.feeFromBalance,
        feeFromAmount: fees.feeFromAmount,
        chainWalletId: chainWallet?.id,
        chainTxHash: req.chainTxHash,
        toAddress: req.toAddress,
        refType: 'manual',
        refId: req.code,
        operator: 'finance',
        remark: `出金 ${s.chain} 链 ${user.nickname}`,
        createdAt: req.paidAt
      });
      req.txnId = txn.id;
      // 余额扣减（模拟）
      account.available = (Number(account.available) - Number(s.amount)).toFixed(2);

      // 子流水：FEE_DEDUCT
      appendTxn({
        userId: user.id,
        userName: user.nickname,
        type: 'FEE_DEDUCT',
        direction: 'out',
        amount: fees.feeTotal,
        balanceAfter: account.available,
        refType: 'manual',
        refId: req.code,
        operator: 'finance',
        remark: `出金手续费 ${s.chain} (gas ${fees.feeGas} + 服务费 ${fees.feeService})`,
        createdAt: req.paidAt
      });
    }
  }
  return req;
}

function runSeed(): void {
  WITHDRAW_REQUESTS.length = 0;
  idCursor = 0;
  SEEDS.forEach((s, i) => WITHDRAW_REQUESTS.push(buildRequest(s, i + 1)));
}
runSeed();

export function findRequestById(id: number): RequestRecord | undefined {
  return WITHDRAW_REQUESTS.find(r => r.id === id);
}

export function appendRequest(r: Omit<RequestRecord, 'id'>): RequestRecord {
  const next: RequestRecord = { id: nextId(), ...r };
  WITHDRAW_REQUESTS.unshift(next);
  return next;
}

export function computeFeesPublic(amount: string, chain: Api.Withdraw.Chain) {
  return computeFees(amount, chain);
}

export function payWithdraw(
  r: RequestRecord,
  chainWalletId: number,
  operator: string
): { txnId: number; chainTxHash: string } | undefined {
  const user = findUserById(r.userId);
  if (!user) return undefined;
  const account = findAccount(r.userId);
  if (!account) return undefined;
  const chainWallet = CHAIN_WALLETS.find(w => w.id === chainWalletId);
  if (!chainWallet) return undefined;

  // 校验余额
  if (Number(account.available) < Number(r.requestAmount)) return undefined;

  const chainTxHash = fakeHash(r.id * 19 + (Date.now() % 1000));
  // 扣 available
  moveBucket({ account, fromBucket: 'available', toBucket: 'available', amount: '0' }); // 触发 updatedAt
  account.available = (Number(account.available) - Number(r.requestAmount)).toFixed(2);

  const paidAt = new Date().toISOString();

  const txn = appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'WITHDRAW_OUT',
    direction: 'out',
    amount: r.requestAmount,
    balanceAfter: account.available,
    bucketFrom: 'available',
    fee: r.feeTotal,
    feeFromBalance: r.feeFromBalance,
    feeFromAmount: r.feeFromAmount,
    chainWalletId: chainWallet.id,
    chainTxHash,
    toAddress: r.toAddress,
    refType: 'manual',
    refId: r.code,
    operator,
    remark: `出金 ${r.chain} 链 ${user.nickname}`,
    createdAt: paidAt
  });

  appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'FEE_DEDUCT',
    direction: 'out',
    amount: r.feeTotal,
    balanceAfter: account.available,
    refType: 'manual',
    refId: r.code,
    operator,
    remark: `出金手续费 ${r.chain}`,
    createdAt: paidAt
  });

  r.status = 'paid';
  r.paidBy = operator;
  r.paidAt = paidAt;
  r.chainWalletId = chainWallet.id;
  r.chainTxHash = chainTxHash;
  r.txnId = txn.id;
  return { txnId: txn.id, chainTxHash };
}
