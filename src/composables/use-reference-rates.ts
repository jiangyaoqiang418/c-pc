import { reactive, ref } from 'vue';
import { fetchReferenceRate, REFERENCE_RATE_ASSETS, type ReferenceRateAsset } from '@/service/api/reference-rates';

// Public reference quotes are shared by the ticker and all CNY estimates; never used for settlement.
export const referenceRates = reactive<Record<ReferenceRateAsset, { value?: number; fetchedAt?: number; failed: boolean }>>({
  USDT: { failed: false }, USDC: { failed: false }
});
export const referenceRateLoading = ref(false);
export const referenceRateCanRefresh = ref(true);
export const referenceRateNow = ref(Date.now());
let consumers = 0;
let controller: AbortController | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let cooldown: ReturnType<typeof setTimeout> | undefined;

export function referenceRateStale(asset: ReferenceRateAsset) {
  const quote = referenceRates[asset];
  return quote.value !== undefined && (quote.failed || referenceRateNow.value - (quote.fetchedAt ?? 0) > 120_000);
}
export function referenceRateStamp(asset: ReferenceRateAsset) {
  const at = referenceRates[asset].fetchedAt;
  return at ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(at) : '尚未获取';
}
export async function refreshReferenceRates() {
  if (referenceRateLoading.value || !referenceRateCanRefresh.value) return;
  referenceRateLoading.value = true;
  referenceRateCanRefresh.value = false;
  clearTimeout(cooldown);
  cooldown = setTimeout(() => { referenceRateCanRefresh.value = true; }, 10_000);
  const current = new AbortController();
  controller = current;
  const timeout = setTimeout(() => current.abort(), 8_000);
  try {
    await Promise.allSettled(REFERENCE_RATE_ASSETS.map(async asset => {
      try {
        const value = await fetchReferenceRate(asset, current.signal);
        if (controller === current && !current.signal.aborted) referenceRates[asset] = { value, fetchedAt: Date.now(), failed: false };
      } catch { if (controller === current) referenceRates[asset].failed = true; }
    }));
  } finally {
    clearTimeout(timeout);
    if (controller === current) {
      referenceRateNow.value = Date.now();
      referenceRateLoading.value = false;
      controller = undefined;
    }
  }
}
function wake() {
  referenceRateNow.value = Date.now();
  if (!document.hidden) void refreshReferenceRates();
}
export function retainReferenceRates() {
  consumers += 1;
  if (consumers === 1) {
    wake();
    interval = setInterval(wake, 60_000);
    document.addEventListener('visibilitychange', wake);
  }
  return () => {
    consumers -= 1;
    if (consumers !== 0) return;
    clearInterval(interval);
    document.removeEventListener('visibilitychange', wake);
    const previous = controller;
    controller = undefined;
    previous?.abort();
    clearTimeout(cooldown);
    referenceRateLoading.value = false;
    referenceRateCanRefresh.value = true;
  };
}
