import { realUserRequest } from '@/service/request';
import { fetchMergeSourcePages, requireArray, resolvePageSize, toPageTotal } from './page';
import { toIsoDate } from './date';

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
    amount: String(dto.amount ?? 0),
    balanceAfter: String(dto.toBalanceAfter ?? dto.fromBalanceAfter ?? 0),
    bucketFrom,
    bucketTo,
    remark,
    chainTxHash,
    testData,
    createdAt: toIsoDate(dto.createdAt)
  };
}

export async function fetchWalletOverview(userId: Api.RealSession.Id, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const wallet = await realUserRequest.get<Api.RealWallet.WalletVO>('/wallet/overview', options);
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
    bizType: selector?.bizType
  }, { signal: q.signal });
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
      if (!selectedTypes.length || selectedTypes.includes(record.type)) recordsById.set(String(record.id), record);
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
  return realUserRequest.post<Api.RealWallet.RechargeVO | string | number, Api.RealWallet.RechargeCreateParams>(
    '/recharge/create',
    params,
    options
  );
}

export async function fetchRechargeChains(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const list = await realUserRequest.get<Api.RealWallet.RechargeChainVO[]>('/recharge/chains', options);
  return requireArray<Api.RealWallet.RechargeChainVO>(list, '充值链列表');
}

export function fetchRechargeAddress(chain: string, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeAddressVO>('/recharge/address', { ...options, params: { chain } });
}

export function fetchRechargeDetail(id: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeVO>('/recharge/detail', { ...options, params: { id } });
}

export async function fetchRechargePage(
  params: Api.RealWallet.RechargePageQuery = {},
  options: { signal?: AbortSignal; showError?: boolean } = {}
) {
  const page = await realUserRequest.postQuery<Api.RealWallet.PageResult<Api.RealWallet.RechargeVO>, Api.RealWallet.RechargePageQuery>(
    '/recharge/page',
    params,
    options
  );
  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 10,
    total: toPageTotal(page.total),
    records: requireArray<Api.RealWallet.RechargeVO>(page.records, '充值记录分页记录')
  };
}

export function cancelRecharge(id: string | number) {
  return realUserRequest.put<string | number, { id: string | number }>('/recharge/cancel', { id });
}

/** 打开确认框与最终提交使用同一份规范化参数和校验，不改变现有最低金额规则。 */
export function prepareWithdrawal(params: Api.RealWallet.WithdrawCreateParams, available?: string | number) {
  const normalized = { ...params, toAddress: params.toAddress.trim() };
  const balance = optionalAmount(available) === undefined ? NaN : Number(available);
  let error = '';
  if (!Number.isFinite(balance) || balance < 0) error = '请先成功读取钱包余额';
  else if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) error = '请输入转出金额';
  else if (normalized.amount < 20) error = '单笔最小转出 20 U';
  else if (!normalized.toAddress) error = '请输入目标地址';
  else if (normalized.toAddress.length < 26 || /\s/.test(normalized.toAddress)) error = '地址格式不合法';
  else if (normalized.amount > balance) error = '可用余额不足';
  return { params: normalized, error };
}

export function createWithdraw(params: Api.RealWallet.WithdrawCreateParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<Api.RealWallet.WithdrawVO | string | number, Api.RealWallet.WithdrawCreateParams>(
    '/withdraw/create',
    params,
    options
  );
}

export function fetchWithdrawDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealWallet.WithdrawVO>('/withdraw/detail', { ...options, params: { id } });
}

export async function fetchWithdrawPage(
  params: Api.RealWallet.WithdrawPageQuery = {},
  options: { signal?: AbortSignal } = {}
) {
  const page = await realUserRequest.postQuery<Api.RealWallet.PageResult<Api.RealWallet.WithdrawVO>, Api.RealWallet.WithdrawPageQuery>(
    '/withdraw/page',
    params,
    options
  );
  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 10,
    total: toPageTotal(page.total),
    records: requireArray<Api.RealWallet.WithdrawVO>(page.records, '提现记录分页记录')
  };
}
