/**
 * 钱包 mock API：7 桶概况 / 流水 / 入金 / 出金。
 */
import { ACCOUNTS, asBuyerWallet, asWalletSummary, findAccount, moveBucket } from '../mock/data/wallet-accounts';
import { TXNS, appendTxn } from '../mock/data/wallet-txns';
import { CHAIN_WALLETS } from '../mock/data/wallet-chain-wallets';
import { findUserById } from '../mock/data/users';
import { delay, delayPaginated } from '../utils/mock-delay';

export async function fetchMyWallet(userId: number): Promise<Api.User.WalletSummary | undefined> {
  return delay(asWalletSummary(userId));
}

export async function fetchMyBuyerWallet(userId: number): Promise<Api.Buyer.Wallet | undefined> {
  return delay(asBuyerWallet(userId));
}

export interface TxnListQuery {
  current?: number;
  size?: number;
  userId: number;
  types?: Api.Wallet.TxnType[];
  bucket?: Api.Wallet.Bucket;
  refType?: string;
  fromAt?: string;
  toAt?: string;
}

export async function fetchMyTxns(q: TxnListQuery) {
  let list = TXNS.filter(t => t.userId === q.userId);
  if (q.types?.length) list = list.filter(t => q.types!.includes(t.type));
  if (q.bucket) list = list.filter(t => t.bucketFrom === q.bucket || t.bucketTo === q.bucket);
  if (q.refType) list = list.filter(t => t.refType === q.refType);
  if (q.fromAt) list = list.filter(t => t.createdAt >= q.fromAt!);
  if (q.toAt) list = list.filter(t => t.createdAt <= q.toAt!);
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchPlatformChainWallets() {
  return delay(CHAIN_WALLETS.filter(w => w.purpose === 'income' && w.status === '1'));
}

export interface DepositMockParams {
  userId: number;
  amount: string;
  chain: 'TRC20' | 'ERC20' | 'BSC';
  fromAddress: string;
  chainWalletId: number;
}

export async function depositMock(p: DepositMockParams): Promise<{ ok: boolean; txnId?: number; message?: string }> {
  const user = findUserById(p.userId);
  const acc = findAccount(p.userId);
  if (!user || !acc) return delay({ ok: false, message: '钱包不存在' }, 300);
  const wallet = CHAIN_WALLETS.find(w => w.id === p.chainWalletId);
  if (!wallet) return delay({ ok: false, message: '入金链上钱包不存在' }, 300);

  acc.available = (Number(acc.available) + Number(p.amount)).toFixed(2);
  const txn = appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'DEPOSIT_IN',
    direction: 'in',
    amount: p.amount,
    balanceAfter: acc.available,
    bucketTo: 'available',
    chainWalletId: wallet.id,
    chainTxHash: `0x${Math.random().toString(16).slice(2, 18)}`,
    fromAddress: p.fromAddress,
    refType: 'finance',
    refId: `OKX-${Date.now()}`,
    operator: 'system',
    remark: `OKX 入金 ${p.chain}`,
    createdAt: new Date().toISOString()
  });
  return delay({ ok: true, txnId: txn.id }, 700);
}

export interface WithdrawMockParams {
  userId: number;
  amount: string;
  chain: 'TRON' | 'ETH' | 'BSC';
  toAddress: string;
}

export async function withdrawMock(p: WithdrawMockParams): Promise<{ ok: boolean; txnId?: number; message?: string }> {
  const user = findUserById(p.userId);
  const acc = findAccount(p.userId);
  if (!user || !acc) return delay({ ok: false, message: '钱包不存在' }, 300);
  if (Number(acc.available) < Number(p.amount)) return delay({ ok: false, message: '余额不足' }, 300);

  const fee = (Number(p.amount) * 0.005 + 2).toFixed(2);
  const total = (Number(p.amount) + Number(fee)).toFixed(2);
  if (Number(acc.available) < Number(total)) return delay({ ok: false, message: '余额不足以支付手续费' }, 300);

  acc.available = (Number(acc.available) - Number(total)).toFixed(2);
  appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'FEE_DEDUCT',
    direction: 'out',
    amount: fee,
    balanceAfter: acc.available,
    bucketFrom: 'available',
    refType: 'manual',
    refId: 'withdraw-fee',
    operator: 'system',
    remark: `出金手续费 ${p.chain}`,
    createdAt: new Date().toISOString()
  });
  const txn = appendTxn({
    userId: user.id,
    userName: user.nickname,
    type: 'WITHDRAW_OUT',
    direction: 'out',
    amount: p.amount,
    balanceAfter: acc.available,
    bucketFrom: 'available',
    chainTxHash: `0x${Math.random().toString(16).slice(2, 18)}`,
    toAddress: p.toAddress,
    refType: 'manual',
    refId: `WD-${Date.now()}`,
    operator: 'system',
    remark: `出金到 ${p.chain}`,
    createdAt: new Date().toISOString()
  });
  return delay({ ok: true, txnId: txn.id }, 700);
}

export async function fetchTotalAssetsOfUser(userId: number) {
  const acc = findAccount(userId);
  if (!acc) return delay({ total: '0' }, 100);
  const total = (
    Number(acc.available) +
    Number(acc.nonWithdrawable) +
    Number(acc.lockedFinance) +
    Number(acc.frozenOrder) +
    Number(acc.frozenRisk) +
    Number(acc.depositAvailable || 0) +
    Number(acc.depositGuaranteed || 0)
  ).toFixed(2);
  return delay({ total, account: acc });
}

export async function fetchAllAccountsSummary() {
  return delay({ accountsTotal: ACCOUNTS.length });
}

void moveBucket; // re-exported for completeness
export { moveBucket };
