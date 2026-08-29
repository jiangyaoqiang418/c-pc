import { realUserRequest } from '@/service/request';
import { toPageTotal } from './page';

const bucketMap: Record<string, keyof Api.RealWallet.Account> = {
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
    available: '0',
    nonWithdrawable: '0',
    lockedFinance: '0',
    frozenOrder: '0',
    frozenRisk: '0',
    depositAvailable: '0',
    depositGuaranteed: '0',
    interestAccrued: '0',
    payPwdSet: false,
    frozen: false,
    updatedAt: ''
  };
}

function toAccount(userId: Api.RealSession.Id, wallet: Api.RealWallet.WalletVO): Api.RealWallet.Account {
  const account = emptyAccount(userId);
  wallet.distribution?.forEach(bucket => {
    const key = bucketMap[bucket.type];
    if (key && typeof account[key] === 'string') {
      (account as unknown as Record<string, string>)[key] = String(bucket.amount ?? 0);
    }
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

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

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
    createdAt: toIso(dto.createdAt)
  };
}

export async function fetchWalletOverview(userId: Api.RealSession.Id, options: { signal?: AbortSignal } = {}) {
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
    } satisfies Api.User.WalletSummary,
    total: String(wallet.total ?? 0),
    today: {
      depositIn: String(wallet.todayIn ?? 0),
      withdrawOut: String(wallet.todayOut ?? 0),
      internalVolume: '0'
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
  const requestPage = (selector?: WalletBizSelector, pageNo = current, pageSize = size) => realUserRequest.post<
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
    // 先取每个原始业务类型的第一页拿到 total，再按真实页大小分批读取。
    // 避免用 current * size 触发后端 pageSize 上限，导致深分页漏记录。
    const firstPages = await Promise.all(selectors.map(selector => requestPage(selector, 1, size)));
    total = firstPages.reduce((sum, page) => sum + toPageTotal(page.total), 0);
    const maxPage = Math.max(1, Math.ceil(total / size));
    if (current > maxPage) return { current, size, total, records: [] as Api.RealWallet.Ledger[] };
    const extraPages = await Promise.all(
      selectors.flatMap((selector, index) => {
        const selectorTotal = toPageTotal(firstPages[index].total);
        const selectorMaxPage = Math.max(1, Math.ceil(selectorTotal / size));
        const pageCount = Math.min(current, selectorMaxPage);
        return Array.from({ length: Math.max(0, pageCount - 1) }, (_, offset) =>
          requestPage(selector, offset + 2, size)
        );
      })
    );
    pages = [...firstPages, ...extraPages];
  } else {
    pages = [await requestPage(selectors[0])];
    total = toPageTotal(pages[0].total);
  }
  const recordsById = new Map<string, Api.RealWallet.Ledger>();
  pages.forEach(page => {
    page.records.map(toTxn).forEach(record => {
      if (!selectedTypes.length || selectedTypes.includes(record.type)) recordsById.set(String(record.id), record);
    });
  });
  const offset = selectors.length > 1 ? (current - 1) * size : 0;
  const records = [...recordsById.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + size);
  return {
    current,
    size,
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

export function createRecharge(params: Api.RealWallet.RechargeCreateParams) {
  return realUserRequest.post<Api.RealWallet.RechargeVO | string | number, Api.RealWallet.RechargeCreateParams>(
    '/recharge/create',
    params
  );
}

export function fetchRechargeChains(options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeChainVO[]>('/recharge/chains', options);
}

export function fetchRechargeAddress(chain: string, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeAddressVO>('/recharge/address', { ...options, params: { chain } });
}

export function fetchRechargeDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealWallet.RechargeVO>('/recharge/detail', { ...options, params: { id } });
}

export async function fetchRechargePage(
  params: Api.RealWallet.RechargePageQuery = {},
  options: { signal?: AbortSignal } = {}
) {
  const page = await realUserRequest.post<Api.RealWallet.PageResult<Api.RealWallet.RechargeVO>, Api.RealWallet.RechargePageQuery>(
    '/recharge/page',
    params,
    options
  );
  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 10,
    total: toPageTotal(page.total),
    records: page.records || []
  };
}

export function cancelRecharge(id: string | number) {
  return realUserRequest.put<string | number, { id: string | number }>('/recharge/cancel', { id });
}

export function createWithdraw(params: Api.RealWallet.WithdrawCreateParams) {
  return realUserRequest.post<Api.RealWallet.WithdrawVO | string | number, Api.RealWallet.WithdrawCreateParams>(
    '/withdraw/create',
    params
  );
}

export function fetchWithdrawDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealWallet.WithdrawVO>('/withdraw/detail', { ...options, params: { id } });
}

export async function fetchWithdrawPage(
  params: Api.RealWallet.WithdrawPageQuery = {},
  options: { signal?: AbortSignal } = {}
) {
  const page = await realUserRequest.post<Api.RealWallet.PageResult<Api.RealWallet.WithdrawVO>, Api.RealWallet.WithdrawPageQuery>(
    '/withdraw/page',
    params,
    options
  );
  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 10,
    total: toPageTotal(page.total),
    records: page.records || []
  };
}
