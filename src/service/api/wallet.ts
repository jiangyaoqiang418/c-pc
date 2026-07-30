import { realUserRequest } from '@/service/request';

const bucketMap: Record<string, keyof Api.Wallet.InternalAccount> = {
  AVAILABLE: 'available',
  available: 'available',
  NON_WITHDRAWABLE: 'nonWithdrawable',
  nonWithdrawable: 'nonWithdrawable',
  LOCKED_FINANCE: 'lockedFinance',
  lockedFinance: 'lockedFinance',
  FROZEN_ORDER: 'frozenOrder',
  frozenOrder: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  frozenRisk: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  depositAvailable: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed',
  depositGuaranteed: 'depositGuaranteed'
};

function emptyAccount(userId: number | string): Api.Wallet.InternalAccount {
  return {
    userId: userId as unknown as number,
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

function toAccount(userId: number | string, wallet: Api.RealWallet.WalletVO) {
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
  FROZEN_ORDER: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed'
};

const txnTypeMap: Record<string, Api.Wallet.TxnType> = {
  RECHARGE: 'DEPOSIT_IN',
  RECHARGE_IN: 'DEPOSIT_IN',
  WITHDRAW: 'WITHDRAW_OUT',
  WITHDRAW_OUT: 'WITHDRAW_OUT',
  ORDER_PAY: 'ORDER_FREEZE',
  ORDER_FREEZE: 'ORDER_FREEZE',
  ORDER_SETTLE: 'ORDER_SETTLE',
  REFUND: 'INTERNAL_REFUND',
  DEPOSIT_PAY: 'DEPOSIT_PLEDGE',
  DEPOSIT_PLEDGE: 'DEPOSIT_PLEDGE',
  DEPOSIT_RELEASE: 'DEPOSIT_RELEASE',
  DEPOSIT_FORFEIT: 'DEPOSIT_FORFEIT',
  FINANCE_LOCK: 'FINANCE_LOCK',
  FINANCE_UNLOCK: 'FINANCE_UNLOCK',
  INTEREST: 'INTEREST_ACCRUE',
  INTEREST_ACCRUE: 'INTEREST_ACCRUE',
  RISK_FREEZE: 'RISK_FREEZE',
  RISK_UNFREEZE: 'RISK_UNFREEZE',
  ADJUST_PLUS: 'ADJUST_PLUS',
  ADJUST_MINUS: 'ADJUST_MINUS',
  FEE: 'FEE_DEDUCT',
  FEE_DEDUCT: 'FEE_DEDUCT'
};

const typeToBiz: Partial<Record<Api.Wallet.TxnType, { bizGroup?: string; bizType?: string }>> = {
  DEPOSIT_IN: { bizGroup: 'RECHARGE' },
  WITHDRAW_OUT: { bizGroup: 'WITHDRAW' },
  FINANCE_LOCK: { bizGroup: 'FINANCE', bizType: 'FINANCE_LOCK' },
  FINANCE_UNLOCK: { bizGroup: 'FINANCE', bizType: 'FINANCE_UNLOCK' },
  INTEREST_ACCRUE: { bizGroup: 'FINANCE', bizType: 'INTEREST_ACCRUE' },
  DEPOSIT_PLEDGE: { bizGroup: 'DEPOSIT', bizType: 'DEPOSIT_PAY' },
  DEPOSIT_RELEASE: { bizGroup: 'DEPOSIT', bizType: 'DEPOSIT_RELEASE' },
  DEPOSIT_FORFEIT: { bizGroup: 'DEPOSIT', bizType: 'DEPOSIT_FORFEIT' },
  ORDER_FREEZE: { bizGroup: 'ORDER', bizType: 'ORDER_PAY' },
  ORDER_SETTLE: { bizGroup: 'ORDER', bizType: 'ORDER_SETTLE' },
  RISK_FREEZE: { bizGroup: 'RISK', bizType: 'RISK_FREEZE' },
  RISK_UNFREEZE: { bizGroup: 'RISK', bizType: 'RISK_UNFREEZE' },
  ADJUST_PLUS: { bizGroup: 'ADJUST', bizType: 'ADJUST_PLUS' },
  ADJUST_MINUS: { bizGroup: 'ADJUST', bizType: 'ADJUST_MINUS' },
  FEE_DEDUCT: { bizGroup: 'FEE', bizType: 'FEE_DEDUCT' }
};

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

function toTxn(dto: Api.RealWallet.WalletLedgerDTO): Api.Wallet.Txn {
  const bucketFrom = dto.fromType ? bucketMapReverse[dto.fromType] : undefined;
  const bucketTo = dto.toType ? bucketMapReverse[dto.toType] : undefined;
  const direction: Api.Wallet.Txn['direction'] = bucketTo && !bucketFrom ? 'in' : 'out';
  const type = txnTypeMap[dto.bizType] || txnTypeMap[dto.bizGroup || ''] || (direction === 'in' ? 'ADJUST_PLUS' : 'ADJUST_MINUS');

  return {
    id: dto.id as unknown as number,
    userId: dto.userId as unknown as number,
    userName: '',
    type,
    direction,
    amount: String(dto.amount ?? 0),
    balanceAfter: String(dto.toBalanceAfter ?? dto.fromBalanceAfter ?? 0),
    bucketFrom,
    bucketTo,
    remark: dto.remark || dto.bizTypeText || dto.bizGroupText,
    createdAt: toIso(dto.createdAt)
  };
}

export async function fetchWalletOverview(userId: number | string) {
  const wallet = await realUserRequest.get<Api.RealWallet.WalletVO>('/wallet/overview');
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
}) {
  const firstType = q.types?.[0];
  const biz = firstType ? typeToBiz[firstType] : undefined;
  const page = await realUserRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealWallet.WalletLedgerDTO> & { pageNo?: number; pageSize?: number },
    Api.RealWallet.WalletLedgerPageQuery
  >('/wallet/ledger/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20,
    bizGroup: biz?.bizGroup,
    bizType: biz?.bizType
  });
  let records = page.records.map(toTxn);
  if (q.types?.length && q.types.length > 1) records = records.filter(item => q.types!.includes(item.type));
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 20,
    total: page.total,
    records
  };
}

export async function fetchWalletLedgersByTypes(q: {
  size?: number;
  types: Api.Wallet.TxnType[];
}) {
  const types = [...new Set(q.types)];
  const pages = await Promise.all(
    types.map(type => fetchWalletLedger({ current: 1, size: q.size || 20, types: [type] }))
  );
  const recordsById = new Map<string, Api.Wallet.Txn>();
  pages.forEach(page => {
    page.records.forEach(record => {
      const key = String(record.id);
      if (!recordsById.has(key)) recordsById.set(key, record);
    });
  });
  const records = [...recordsById.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, q.size || 20);

  return {
    total: pages.reduce((sum, page) => sum + page.total, 0),
    records
  };
}

export function createRecharge(params: Api.RealWallet.RechargeCreateParams) {
  return realUserRequest.post<Api.RealWallet.RechargeVO | string | number, Api.RealWallet.RechargeCreateParams>(
    '/recharge/create',
    params
  );
}

export function fetchRechargeDetail(id: string | number) {
  return realUserRequest.get<Api.RealWallet.RechargeVO>('/recharge/detail', { params: { id } });
}

export async function fetchRechargePage(params: Api.RealWallet.RechargePageQuery = {}) {
  const page = await realUserRequest.post<Api.RealWallet.PageResult<Api.RealWallet.RechargeVO>, Api.RealWallet.RechargePageQuery>(
    '/recharge/page',
    params
  );
  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 10,
    total: page.total || 0,
    records: page.records || []
  };
}

export function createWithdraw(params: Api.RealWallet.WithdrawCreateParams) {
  return realUserRequest.post<Api.RealWallet.WithdrawVO | string | number, Api.RealWallet.WithdrawCreateParams>(
    '/withdraw/create',
    params
  );
}

export function fetchWithdrawDetail(id: string | number) {
  return realUserRequest.get<Api.RealWallet.WithdrawVO>('/withdraw/detail', { params: { id } });
}

export async function fetchWithdrawPage(params: Api.RealWallet.WithdrawPageQuery = {}) {
  const page = await realUserRequest.post<Api.RealWallet.PageResult<Api.RealWallet.WithdrawVO>, Api.RealWallet.WithdrawPageQuery>(
    '/withdraw/page',
    params
  );
  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 10,
    total: page.total || 0,
    records: page.records || []
  };
}
