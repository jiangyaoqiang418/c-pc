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
