import { realOrderRequest } from '@/service/request';

export const REFERENCE_RATE_ASSETS = ['USDT', 'USDC'] as const;
export type ReferenceRateAsset = typeof REFERENCE_RATE_ASSETS[number];
export const REFERENCE_RATE_SOURCE = 'https://www.okx.com/docs-v5/en/#rest-api-market-data-get-exchange-rate';

export async function fetchReferenceRates(signal: AbortSignal): Promise<Api.ReferenceRates.Quote[]> {
  const rows = await realOrderRequest.get<Api.ReferenceRates.Quote[]>('/reference-rates/list', {
    signal, showError: false, skipAuthRedirect: true, timeoutMs: 8000
  });
  if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => row.asset)).size !== 2) throw new Error('参考汇率数据无效');
  for (const row of rows) {
    if (!REFERENCE_RATE_ASSETS.includes(row.asset) || row.quoteCurrency !== 'CNY' || row.source !== 'OKX'
      || !['FRESH', 'STALE', 'UNAVAILABLE'].includes(row.status)) throw new Error('参考汇率口径无效');
    if (row.status !== 'UNAVAILABLE' && (!Number.isFinite(Number(row.rate)) || Number(row.rate) <= 0
      || !Number.isSafeInteger(Number(row.fetchedAt)) || Number(row.fetchedAt) <= 0
      || !Number.isSafeInteger(Number(row.expiresAt)) || Number(row.expiresAt) <= 0)) throw new Error('参考汇率快照无效');
  }
  return rows;
}
