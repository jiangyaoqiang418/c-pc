import { realUserRequest } from '@/service/request';
import { fetchMergeSourcePages, requireArray, resolvePageSize, toPageTotal } from './page';
import { toIsoDate } from './date';
import { parseDateValue } from '@/utils/date-range';
import { sumPaymentAmounts } from '@/utils/checkout';
import { compareDecimalAmount } from '@/components/wallet/decimal-amount';

/** 流水金额必须有权威值；校验十进制格式后保留原值，不转换金额或业务 ID。 */
export function readLedgerAmount(value: unknown, label: string) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') throw new Error(`${label}尚未确认，请重新读取`);
  const text = String(value).trim();
  try { sumPaymentAmounts([text]); } catch { throw new Error(`${label}格式异常，请重新读取`); }
  return text;
}

const bucketMap: Record<string, Api.RealWallet.BalanceKey> = {
  AVAILABLE: 'available',
  available: 'available',
  NON_WITHDRAWABLE: 'nonWithdrawable',
  nonWithdrawable: 'nonWithdrawable',
  LOCKED_FINANCE: 'lockedFinance',
  FINANCE_LOCKED: 'lockedFinance',
  lockedFinance: 'lockedFinance',
  FROZEN_ORDER: 'frozenOrder',
  ORDER_FROZEN: 'frozenOrder',
  frozenOrder: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  RISK_FROZEN: 'frozenRisk',
  frozenRisk: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  depositAvailable: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed',
  depositGuaranteed: 'depositGuaranteed'
};

function emptyAccount(userId: Api.RealSession.Id): Api.RealWallet.Account {
  return {
    userId,
    userName: '',
    payPwdSet: false,
    frozen: false,
    updatedAt: ''
  };
}

/** 缺失或无效金额不能当作零余额；有效数值保留原字符串精度。 */
function optionalAmount(value: unknown): string | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return;
  return Number.isFinite(Number(value)) ? String(value) : undefined;
}

function toAccount(userId: Api.RealSession.Id, wallet: Api.RealWallet.WalletVO): Api.RealWallet.Account {
  const account = emptyAccount(userId);
  if (!Array.isArray(wallet.distribution)) return account;
  wallet.distribution.forEach(bucket => {
    const key = bucketMap[bucket.type];
    if (key) account[key] = optionalAmount(bucket.amount);
  });
  return account;
}

const bucketMapReverse: Record<string, Api.Wallet.Bucket> = {
  AVAILABLE: 'available',
  NON_WITHDRAWABLE: 'nonWithdrawable',
  LOCKED_FINANCE: 'lockedFinance',
  FINANCE_LOCKED: 'lockedFinance',
  FROZEN_ORDER: 'frozenOrder',
  ORDER_FROZEN: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  RISK_FROZEN: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed'
};

const txnTypeMap: Record<string, Api.Wallet.TxnType> = {
  RECHARGE: 'DEPOSIT_IN',
  RECHARGE_IN: 'DEPOSIT_IN',
  CHAIN_DEPOSIT: 'DEPOSIT_IN',
  WITHDRAW: 'WITHDRAW_OUT',
  WITHDRAW_OUT: 'WITHDRAW_OUT',
  CHAIN_WITHDRAW: 'WITHDRAW_OUT',
  ORDER_CONSUME: 'INTERNAL_PAY',
  ORDER_INCOME: 'ORDER_SETTLE',
  ORDER_REFUND: 'INTERNAL_REFUND',
  ORDER_UNFREEZE: 'INTERNAL_REFUND',
  CHAIN_WITHDRAW_REFUND: 'INTERNAL_REFUND',
  ORDER_PAY: 'ORDER_FREEZE',
  ORDER_FREEZE: 'ORDER_FREEZE',
  ORDER_SETTLE: 'ORDER_SETTLE',
  REFUND: 'INTERNAL_REFUND',
  DEPOSIT_PAY: 'DEPOSIT_PLEDGE',
  DEPOSIT_PLEDGE: 'DEPOSIT_PLEDGE',
  DEPOSIT_REFUND: 'DEPOSIT_RELEASE',
  DEPOSIT_RELEASE: 'DEPOSIT_RELEASE',
  DEPOSIT_DEDUCT: 'DEPOSIT_FORFEIT',
  DEPOSIT_FORFEIT: 'DEPOSIT_FORFEIT',
  FINANCE_LOCK: 'FINANCE_LOCK',
  FINANCE_UNLOCK: 'FINANCE_UNLOCK',
  FINANCE_PROFIT: 'INTEREST_ACCRUE',
  INTEREST: 'INTEREST_ACCRUE',
  INTEREST_ACCRUE: 'INTEREST_ACCRUE',
  RISK_FREEZE: 'RISK_FREEZE',
  RISK_UNFREEZE: 'RISK_UNFREEZE',
  ADMIN_ADJUST_IN: 'ADJUST_PLUS',
  ADMIN_TRANSFER_IN: 'ADJUST_PLUS',
  ADMIN_ADJUST_OUT: 'ADJUST_MINUS',
  ADMIN_TRANSFER_OUT: 'ADJUST_MINUS',
  ADJUST_PLUS: 'ADJUST_PLUS',
  ADJUST_MINUS: 'ADJUST_MINUS',
  FEE: 'FEE_DEDUCT',
  FEE_DEDUCT: 'FEE_DEDUCT'
};

const incomeTxnTypes = new Set<Api.Wallet.TxnType>([
  'DEPOSIT_IN',
  'INTERNAL_RECEIVE',
  'INTERNAL_REFUND',
  'INTEREST_ACCRUE',
  'FINANCE_UNLOCK',
  'DEPOSIT_RELEASE',
  'ORDER_SETTLE',
  'RISK_UNFREEZE',
  'ADJUST_PLUS'
]);

interface WalletBizSelector {
  bizGroup?: string;
  bizType: string;
}

const typeToBiz: Partial<Record<Api.Wallet.TxnType, WalletBizSelector[]>> = {
  DEPOSIT_IN: [{ bizGroup: 'CHAIN', bizType: 'CHAIN_DEPOSIT' }],
  WITHDRAW_OUT: [{ bizGroup: 'CHAIN', bizType: 'CHAIN_WITHDRAW' }],
  INTERNAL_PAY: [{ bizGroup: 'ORDER', bizType: 'ORDER_CONSUME' }],
  INTERNAL_REFUND: [
    { bizGroup: 'ORDER', bizType: 'ORDER_REFUND' },
    { bizGroup: 'ORDER', bizType: 'ORDER_UNFREEZE' },
    { bizGroup: 'CHAIN', bizType: 'CHAIN_WITHDRAW_REFUND' }
  ],
  FINANCE_LOCK: [{ bizGroup: 'FINANCE', bizType: 'FINANCE_LOCK' }],
  FINANCE_UNLOCK: [{ bizGroup: 'FINANCE', bizType: 'FINANCE_UNLOCK' }],
  INTEREST_ACCRUE: [{ bizGroup: 'FINANCE', bizType: 'FINANCE_PROFIT' }],
  DEPOSIT_PLEDGE: [{ bizGroup: 'DEPOSIT', bizType: 'DEPOSIT_PAY' }],
  DEPOSIT_RELEASE: [{ bizGroup: 'DEPOSIT', bizType: 'DEPOSIT_REFUND' }],
  DEPOSIT_FORFEIT: [{ bizGroup: 'DEPOSIT', bizType: 'DEPOSIT_DEDUCT' }],
  ORDER_FREEZE: [{ bizGroup: 'ORDER_FREEZE', bizType: 'ORDER_FREEZE' }],
  ORDER_SETTLE: [{ bizGroup: 'ORDER', bizType: 'ORDER_INCOME' }],
  RISK_FREEZE: [{ bizGroup: 'RISK', bizType: 'RISK_FREEZE' }],
  RISK_UNFREEZE: [{ bizGroup: 'RISK', bizType: 'RISK_UNFREEZE' }],
  ADJUST_PLUS: [
    { bizType: 'ADMIN_ADJUST_IN' },
    { bizType: 'ADMIN_TRANSFER_IN' },
    { bizType: 'ADJUST_PLUS' }
  ],
  ADJUST_MINUS: [
    { bizType: 'ADMIN_ADJUST_OUT' },
    { bizType: 'ADMIN_TRANSFER_OUT' },
    { bizType: 'ADJUST_MINUS' }
  ],
  FEE_DEDUCT: [{ bizType: 'FEE_DEDUCT' }]
};

function toTxn(dto: Api.RealWallet.WalletLedgerDTO): Api.RealWallet.Ledger {
  const bucketFrom = dto.fromType ? bucketMapReverse[dto.fromType] : undefined;
  const bucketTo = dto.toType ? bucketMapReverse[dto.toType] : undefined;
  const inferredDirection: Api.Wallet.Txn['direction'] = bucketTo && !bucketFrom ? 'in' : 'out';
  const type = txnTypeMap[dto.bizType]
    || txnTypeMap[dto.bizGroup || '']
    || (inferredDirection === 'in' ? 'ADJUST_PLUS' : 'ADJUST_MINUS');
  const direction: Api.Wallet.Txn['direction'] = incomeTxnTypes.has(type) ? 'in' : 'out';
  const remark = dto.remark || dto.bizTypeText || dto.bizGroupText;
  const testData = /\[测试数据\]|\btestData\b|DEV-TEST-/i.test(remark || '');
  const chainTxHash = remark?.match(/(?:txHash=|交易哈希[：:])([^\s，,]+)/i)?.[1];

  return {
    id: dto.id,
    userId: dto.userId,
    userName: '',
    bizType: dto.bizType,
    bizTypeText: dto.bizTypeText,
    bizGroup: dto.bizGroup,
    bizGroupText: dto.bizGroupText,
    type,
    direction,
    amount: readLedgerAmount(dto.amount, '钱包流水金额'),
    balanceAfter: readLedgerAmount(dto.toBalanceAfter ?? dto.fromBalanceAfter, '钱包流水变动后余额'),
    bucketFrom,
    bucketTo,
    remark,
    chainTxHash,
    testData,
    createdAt: toIsoDate(dto.createdAt)
  };
}

export async function fetchWalletOverview(userId: Api.RealSession.Id, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const wallet = await realUserRequest.get<Api.RealWallet.WalletVO>('/wallet/overview', { ...options, preserveDecimals: true });
  const account = toAccount(userId, wallet);

  return {
    summary: {
      address: '',
      available: account.available,
      nonWithdrawable: account.nonWithdrawable,
      lockedFinance: account.lockedFinance,
      frozenOrder: account.frozenOrder,
      frozenRisk: account.frozenRisk
    } satisfies Partial<Api.User.WalletSummary>,
    total: optionalAmount(wallet.total),
    today: {
      depositIn: optionalAmount(wallet.todayIn),
      withdrawOut: optionalAmount(wallet.todayOut),
      internalVolume: undefined
    },
    account
  };
}

export async function fetchWalletLedger(q: {
  current?: number;
  size?: number;
  types?: Api.Wallet.TxnType[];
  bucket?: Api.Wallet.Bucket;
  keyword?: string;
  fromAt?: string;
  toAt?: string;
  signal?: AbortSignal;
}) {
  const current = Math.max(1, Math.floor(q.current || 1));
  const size = Math.max(1, Math.floor(q.size || 20));
  const selectedTypes = [...new Set(q.types || [])];
  const selectorMap = new Map<string, WalletBizSelector>();
  selectedTypes.forEach(type => {
    typeToBiz[type]?.forEach(selector => {
      selectorMap.set(`${selector.bizGroup || ''}:${selector.bizType}`, selector);
    });
  });
  const selectors = [...selectorMap.values()];
  if (selectedTypes.length && !selectors.length) {
    return { current, size, total: 0, records: [] as Api.RealWallet.Ledger[] };
  }
  const requestPage = (selector?: WalletBizSelector, pageNo = current, pageSize = size) => realUserRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealWallet.WalletLedgerDTO> & { pageNo?: number; pageSize?: number },
    Api.RealWallet.WalletLedgerPageQuery
  >('/wallet/ledger/page', {
    pageNo,
    pageSize,
    bizGroup: selector?.bizGroup,
    bizType: selector?.bizType,
    balanceType: q.bucket ? { available: 'AVAILABLE', nonWithdrawable: 'NON_WITHDRAWABLE', lockedFinance: 'FINANCE_LOCKED', frozenOrder: 'ORDER_FROZEN', frozenRisk: 'RISK_FROZEN', depositAvailable: 'DEPOSIT_AVAILABLE', depositGuaranteed: 'DEPOSIT_GUARANTEED', interestAccrued: 'INTEREST_ACCRUED' }[q.bucket] : undefined,
    keyword: q.keyword?.trim() || undefined,
    startAt: parseDateValue(q.fromAt),
    endAt: parseDateValue(q.toAt, true)
  }, { signal: q.signal, preserveDecimals: true });
  let pages: Array<Api.Common.PaginatingQueryRecord<Api.RealWallet.WalletLedgerDTO> & { pageNo?: number; pageSize?: number }>;
  let total = 0;
  if (selectors.length > 1) {
    const result = await fetchMergeSourcePages({ sources: selectors, current, size,
      request: requestPage, recordId: record => record.id, signal: q.signal });
    pages = result.pages;
    total = result.total;
  } else {
    pages = [await requestPage(selectors[0])];
    total = toPageTotal(pages[0].total);
  }
  const recordsById = new Map<string, Api.RealWallet.Ledger>();
  pages.forEach(page => {
    requireArray<Api.RealWallet.WalletLedgerDTO>(page.records, '钱包流水分页记录').map(toTxn).forEach(record => {
      recordsById.set(String(record.id), record);
    });
  });
  const offset = selectors.length > 1 ? (current - 1) * size : 0;
  const records = [...recordsById.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + size);
  return {
    current,
    size: selectors.length > 1 ? size : resolvePageSize(pages[0], size),
    total,
    records
  };
}

export async function fetchWalletLedgersByTypes(q: {
  size?: number;
  types: Api.Wallet.TxnType[];
  signal?: AbortSignal;
}) {
  const page = await fetchWalletLedger({ current: 1, size: q.size || 20, types: q.types, signal: q.signal });
  return {
    total: page.total,
    records: page.records
  };
}

export function createRecharge(params: Api.RealWallet.RechargeCreateParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<string | number, Api.RealWallet.RechargeCreateParams>(
    '/recharge/create',
    { ...params, asset: 'USDT' },
    options
  );
}

export async function fetchRechargeByKey(idempotencyKey: string) {
  const result = await realUserRequest.get<Api.RealWallet.RechargeVO | null>('/recharge/by-key', { params: { idempotencyKey }, showError: false, preserveDecimals: true });
  if (result !== null && (!result || typeof result !== 'object')) throw new Error('充值原单回查响应不完整');
  if (result !== null && result.asset !== 'USDT') throw new Error('充值原单资产无法核对，请联系平台核实');
  if (result !== null && result.source !== 'DECLARATION') throw new Error('充值原单来源无法核对，请联系平台核实');
  return result;
}

/** 原申报详情必须与已提交快照一致，错误回包不能展示可转账地址。 */
export function validateRechargeDeclaration(record: Api.RealWallet.RechargeVO,
  expected: { id: string | number; chain?: string; amount: string | number }) {
  const validId = (id: unknown) => typeof id === 'string' && !!id.trim() || typeof id === 'number' && Number.isSafeInteger(id);
  let matchesAmount = false;
  try {
    const amount = sumPaymentAmounts([record?.amount]);
    matchesAmount = amount !== '0' && amount === sumPaymentAmounts([expected.amount]);
  } catch { /* 缺失与损坏金额均拒绝。 */ }
  if (!record || !validId(record.id) || !validId(expected.id) || String(record.id) !== String(expected.id)
    || record.asset !== 'USDT' || record.source !== 'DECLARATION' || !expected.chain || record.chain !== expected.chain || !matchesAmount) {
    throw new Error('充值申报回读与原网络、金额或来源不一致，请核实原申报，勿转账');
  }
  return record;
}

export async function fetchWithdrawByKey(idempotencyKey: string) {
  const result = await realUserRequest.get<Api.RealWallet.WithdrawVO | null>('/withdraw/by-key', { params: { idempotencyKey }, showError: false, preserveDecimals: true });
  if (result !== null && (!result || typeof result !== 'object')) throw new Error('提现原单回查响应不完整');
  return result;
}

export async function fetchRechargeChains(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const list = await realUserRequest.get<Api.RealWallet.RechargeChainVO[]>('/recharge/chains', { ...options, preserveDecimals: true });
  return requireArray<Api.RealWallet.RechargeChainVO>(list, '充值链列表');
}

export function sameRechargeContract(chain: string, left: string, right: string) {
  return chain === 'TRON' ? left === right : left.toLowerCase() === right.toLowerCase();
}

export function rechargeMethodEnabled(config: Api.RealWallet.RechargeAssetVO | undefined, method: Api.RealWallet.RechargeMethod) {
  return config?.asset === 'USDT' && config.enabled && config.methods.includes(method);
}

/** 配置是充值入口的唯一能力来源；不从平台共享地址或订单付款配置推导可充值。 */
export async function fetchRechargeAssets(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const list = requireArray<Api.RealWallet.RechargeAssetVO>(await realUserRequest.get<Api.RealWallet.RechargeAssetVO[]>(
    '/recharge/assets', { ...options, preserveDecimals: true }), '充值资产与网络矩阵');
  const identities = new Set<string>();
  for (const item of list) {
    if (!item || !['USDT', 'USDC'].includes(item.asset) || !['ETH', 'TRON', 'BSC'].includes(item.chain)
      || typeof item.enabled !== 'boolean' || typeof item.label !== 'string' || !Array.isArray(item.methods)
      || item.methods.some(method => !['ADDRESS', 'DECLARATION', 'WALLET'].includes(method))) {
      throw new Error('充值配置不完整，请重新读取');
    }
    const key = `${item.asset}:${item.chain}`;
    if (identities.has(key)) throw new Error('充值资产与网络配置重复，请重新读取');
    identities.add(key);
    if (item.asset === 'USDC' && (item.enabled || item.methods.length)) throw new Error('USDC 暂未开放充值');
    if (item.enabled && (!item.tokenContract?.trim() || !item.methods.length
      || !Number.isSafeInteger(item.decimals) || item.decimals < 0 || item.decimals > 18
      || !Number.isSafeInteger(item.minConfirmations) || item.minConfirmations! < 0
      || (item.minAmount != null && optionalAmount(item.minAmount) === undefined)
      || (item.methods.includes('WALLET') && !item.walletNetwork?.trim()))) {
      throw new Error('充值网络配置尚未就绪，请稍后重试');
    }
  }
  return list;
}

export function fetchRechargeAddress(chain: string, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeAddressVO>('/recharge/address', { ...options, params: { asset: 'USDT', chain }, preserveDecimals: true });
}

export function fetchRechargeDetail(id: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeVO>('/recharge/detail', { ...options, params: { id }, preserveDecimals: true });
}

export async function fetchRechargePage(
  params: Api.RealWallet.RechargePageQuery = {},
  options: { signal?: AbortSignal; showError?: boolean } = {}
) {
  const page = await realUserRequest.postQuery<Api.RealWallet.PageResult<Api.RealWallet.RechargeVO>, Api.RealWallet.RechargePageQuery>(
    '/recharge/page',
    { ...params, asset: 'USDT' },
    { ...options, preserveDecimals: true }
  );
  const current = Number(page.current ?? page.pageNo ?? params.pageNo ?? 1);
  if (!Number.isSafeInteger(current) || current < 1) throw new Error('充值记录页码异常，请重新读取');
  return {
    current,
    size: resolvePageSize(page, params.pageSize ?? 10),
    total: toPageTotal(page.total),
    records: requireArray<Api.RealWallet.RechargeVO>(page.records, '充值记录分页记录').map(record => {
      if (record.asset !== 'USDT') throw new Error('充值记录资产无法核对，请重新读取');
      return record;
    })
  };
}

export function cancelRecharge(id: string | number) {
  return realUserRequest.put<string | number, { id: string | number }>('/recharge/cancel', { id });
}

/** 打开确认框与最终提交使用同一份规范化参数和校验，不改变现有最低金额规则。 */
export function prepareWithdrawal(params: Omit<Api.RealWallet.WithdrawCreateParams, 'payPassword'>, available?: string | number) {
  const normalized = { ...params, toAddress: params.toAddress.trim() };
  const balanceKnown = available !== undefined && compareDecimalAmount(available, 0) !== undefined;
  let error = '';
  if (!balanceKnown) error = '请先成功读取钱包余额';
  else if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) error = '请输入转出金额';
  else if (normalized.amount < 20) error = '单笔最小转出 20 U';
  else if (!normalized.toAddress) error = '请输入目标地址';
  else if (normalized.toAddress.length < 26 || /\s/.test(normalized.toAddress)) error = '地址格式不合法';
  else if (compareDecimalAmount(normalized.amount, available!) === 1) error = '可用余额不足';
  return { params: normalized, error };
}

export function createWithdraw(params: Api.RealWallet.WithdrawCreateParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<string | number, Api.RealWallet.WithdrawCreateParams>(
    '/withdraw/create',
    params,
    options
  );
}

export function fetchWithdrawDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealWallet.WithdrawVO>('/withdraw/detail', { ...options, params: { id }, preserveDecimals: true });
}

export async function fetchWithdrawPage(
  params: Api.RealWallet.WithdrawPageQuery = {},
  options: { signal?: AbortSignal } = {}
) {
  const page = await realUserRequest.postQuery<Api.RealWallet.PageResult<Api.RealWallet.WithdrawVO>, Api.RealWallet.WithdrawPageQuery>(
    '/withdraw/page',
    params,
    { ...options, preserveDecimals: true }
  );
  const current = Number(page.current ?? page.pageNo ?? params.pageNo ?? 1);
  if (!Number.isSafeInteger(current) || current < 1) throw new Error('提现记录页码异常，请重新读取');
  return {
    current,
    size: resolvePageSize(page, params.pageSize ?? 10),
    total: toPageTotal(page.total),
    records: requireArray<Api.RealWallet.WithdrawVO>(page.records, '提现记录分页记录')
  };
}
