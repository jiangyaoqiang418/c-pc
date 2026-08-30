import { realUserRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';
import { toIsoDate } from './date';

export function fetchBuyerApplication(options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealBuyer.BuyerApplicationVO | null>('/buyer/application', options);
}

export function submitBuyerApplication(params: Api.RealBuyer.BuyerApplyParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<void, Api.RealBuyer.BuyerApplyParams>('/buyer/apply', params, options);
}

function toDepositTxn(dto: Api.RealBuyer.DepositLedgerDTO): Api.RealBuyer.DepositLedger {
  const isRelease = dto.bizType === 'REFUND' || dto.bizType === 'UNFREEZE';
  const isDeduct = dto.bizType === 'DEDUCT';

  return {
    id: dto.id,
    userId: dto.userId,
    userName: '',
    type: isRelease ? 'DEPOSIT_RELEASE' : isDeduct ? 'DEPOSIT_FORFEIT' : 'DEPOSIT_PLEDGE',
    direction: isRelease ? 'in' : 'out',
    amount: String(dto.amount ?? 0),
    balanceAfter: String(dto.balanceAfter ?? 0),
    bucketFrom: isRelease ? 'depositAvailable' : 'available',
    bucketTo: isRelease ? 'available' : 'depositAvailable',
    remark: dto.remark || dto.bizNo || dto.bizType,
    createdAt: toIsoDate(dto.createdAt)
  };
}

export async function fetchBuyerDepositLedger(
  params: Api.RealBuyer.DepositLedgerPageQuery = {},
  options: { signal?: AbortSignal } = {}
) {
  const page = await realUserRequest.postQuery<Api.RealBuyer.DepositPageResult, Api.RealBuyer.DepositLedgerPageQuery>(
    '/buyer/deposit/page',
    params,
    options
  );

  return {
    current: page.current || page.pageNo || params.pageNo || 1,
    size: page.size || page.pageSize || params.pageSize || 20,
    total: toPageTotal(page.total),
    records: requireArray<Api.RealBuyer.DepositLedgerDTO>(page.records, '押金流水分页记录').map(toDepositTxn)
  };
}

export function payBuyerDeposit(params: Api.RealBuyer.DepositOperationParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<string | number, Api.RealBuyer.DepositOperationParams>('/buyer/deposit/pay', params, options);
}

export function refundBuyerDeposit(params: Api.RealBuyer.DepositOperationParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<string | number, Api.RealBuyer.DepositOperationParams>('/buyer/deposit/refund', params, options);
}
