/** Public informational feed; never attach session credentials or use for settlement. */
export const REFERENCE_RATE_ASSETS = ['USDT', 'USDC'] as const;
export type ReferenceRateAsset = typeof REFERENCE_RATE_ASSETS[number];
export const REFERENCE_RATE_SOURCE = 'https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates';

export async function fetchReferenceRate(asset: ReferenceRateAsset, signal: AbortSignal): Promise<number> {
  const response = await fetch(`https://api.coinbase.com/v2/exchange-rates?currency=${asset}`, {
    signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'
  });
  if (!response.ok) throw new Error('参考汇率暂不可用');
  const payload: unknown = await response.json();
  const data = (payload as { data?: { currency?: unknown; rates?: { CNY?: unknown } } } | null)?.data;
  const raw = data?.rates?.CNY;
  const value = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (data?.currency !== asset || !Number.isFinite(value) || value <= 0) throw new Error('参考汇率数据无效');
  return value;
}
