import { realOrderRequest } from '@/service/request';

export interface WalletPayChain {
  chain: string;
  label: string;
  network: string;
  tokenContract: string;
  decimals: number;
  minAmount: string | number | null;
  minConfirmations: number;
  enabled: boolean;
}

export type WalletPayStatus = 'PENDING' | 'SUBMITTED' | 'SUCCESS' | 'FAILED' | 'CLOSED';

export interface WalletPayOrder {
  payNo: string;
  orderGroupNo: string;
  chain: string;
  chainLabel: string;
  network: string;
  tokenContract: string;
  decimals: number;
  toAddress: string;
  orderAmount: string | number;
  payAmount: string | number;
  rawAmount: string;
  status: WalletPayStatus;
  statusText: string;
  expireAt: string | number;
  txHash?: string;
  arrivedAmount?: string | number;
  failReason?: string;
  submittedAt?: string | number;
  paidAt?: string | number;
  payResult?: Api.RealOrder.OrderGroupPayResult;
}

export interface CreateWalletPayParams {
  orderGroupNo: string;
  chain: string;
  confirmedAmount: string;
  idempotencyKey: string;
}

function validDecimal(value: unknown) {
  return (typeof value === 'string' || typeof value === 'number')
    && /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(value));
}

export async function fetchWalletPayChains(options: { signal?: AbortSignal } = {}) {
  const chains = await realOrderRequest.get<WalletPayChain[]>('/orders/wallet-pay/chains', { ...options, showError: false, preserveDecimals: true });
  if (!Array.isArray(chains) || chains.some(chain => !chain || typeof chain.chain !== 'string'
    || typeof chain.label !== 'string' || typeof chain.network !== 'string'
    || typeof chain.tokenContract !== 'string' || !Number.isSafeInteger(chain.decimals)
    || (chain.minAmount != null && !validDecimal(chain.minAmount))
    || typeof chain.enabled !== 'boolean' || !Number.isSafeInteger(chain.minConfirmations))) {
    throw new Error('钱包支付可用链响应不完整，请稍后重试');
  }
  return chains;
}

export function createWalletPay(params: CreateWalletPayParams) {
  return realOrderRequest.post<WalletPayOrder, CreateWalletPayParams>('/orders/wallet-pay/create', params, { showError: false, preserveDecimals: true });
}

export function fetchLatestWalletPay(orderGroupNo: string, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<WalletPayOrder | null>('/orders/wallet-pay/latest', {
    params: { orderGroupNo }, ...options, showError: false, preserveDecimals: true
  });
}

export function validateWalletPay(pay: WalletPayOrder | null, orderGroupNo: string, chain?: string): WalletPayOrder {
  if (!pay || typeof pay.payNo !== 'string' || !pay.payNo.trim()
    || pay.orderGroupNo !== orderGroupNo || (chain && pay.chain !== chain)
    || typeof pay.chain !== 'string' || !pay.chain.trim()
    || typeof pay.network !== 'string' || !pay.network.trim()
    || typeof pay.tokenContract !== 'string' || !pay.tokenContract.trim()
    || typeof pay.toAddress !== 'string' || !pay.toAddress.trim()
    || typeof pay.rawAmount !== 'string' || !/^\d+$/.test(pay.rawAmount)
    || !validDecimal(pay.orderAmount) || !validDecimal(pay.payAmount)
    || !Number.isSafeInteger(Number(pay.expireAt))
    || !['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'CLOSED'].includes(pay.status)) {
    throw new Error('钱包支付单参数不完整，请返回订单核对');
  }
  return pay;
}
