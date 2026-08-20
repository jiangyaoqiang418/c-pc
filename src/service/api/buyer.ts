import { realUserRequest } from '@/service/request';
import { toPageTotal } from './page';

export function fetchBuyerApplication() {
  return realUserRequest.get<Api.RealBuyer.BuyerApplicationVO | null>('/buyer/application');
}

export function submitBuyerApplication(params: Api.RealBuyer.BuyerApplyParams) {
  return realUserRequest.post<void, Api.RealBuyer.BuyerApplyParams>('/buyer/apply', params);
}

function toDepositTxn(dto: Api.RealBuyer.DepositLedgerDTO): Api.Wallet.Txn {
  const isRelease = dto.bizType === 'REFUND' || dto.bizType === 'UNFREEZE';
  const isDeduct = dto.bizType === 'DEDUCT';

  return {
    id: dto.id as unknown as number,
    userId: dto.userId as unknown as number,
    userName: '',
    type: isRelease ? 'DEPOSIT_RELEASE' : isDeduct ? 'DEPOSIT_FORFEIT' : 'DEPOSIT_PLEDGE',
    direction: isRelease ? 'in' : 'out',
    amount: String(dto.amount ?? 0),
    balanceAfter: String(dto.balanceAfter ?? 0),
    bucketFrom: isRelease ? 'depositAvailable' : 'available',
    bucketTo: isRelease ? 'available' : 'depositAvailable',
    remark: dto.remark || dto.bizNo || dto.bizType,
    createdAt: toIso(dto.createdAt)
  };
}

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number' || /^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

export async function fetchBuyerDepositLedger(params: Api.RealBuyer.DepositLedgerPageQuery = {}) {
  const page = await realUserRequest.post<Api.RealBuyer.DepositPageResult, Api.RealBuyer.DepositLedgerPageQuery>(
    '/buyer/deposit/page',
    params
  );

  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 20,
    total: toPageTotal(page.total),
    records: (page.records || []).map(toDepositTxn)
  };
}

export function payBuyerDeposit(params: Api.RealBuyer.DepositOperationParams) {
  return realUserRequest.post<string | number, Api.RealBuyer.DepositOperationParams>('/buyer/deposit/pay', params);
}

export function refundBuyerDeposit(params: Api.RealBuyer.DepositOperationParams) {
  return realUserRequest.post<string | number, Api.RealBuyer.DepositOperationParams>('/buyer/deposit/refund', params);
}
