<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId } from 'vue';
import { Icon } from '@iconify/vue';
import { fetchReferenceRate, REFERENCE_RATE_ASSETS, REFERENCE_RATE_SOURCE, type ReferenceRateAsset } from '@/service/api/reference-rates';
import { Button } from '@/components/ui/button';

const assets = REFERENCE_RATE_ASSETS;
const expanded = ref(false);
const loading = ref(false);
const canRefresh = ref(true);
const now = ref(Date.now());
const panelId = useId();
const rates = reactive<Record<ReferenceRateAsset, { value?: number; fetchedAt?: number; failed: boolean }>>({
  USDT: { failed: false }, USDC: { failed: false }
});
let disposed = false;
let controller: AbortController | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let cooldown: ReturnType<typeof setTimeout> | undefined;
const stale = (asset: ReferenceRateAsset) => rates[asset].value !== undefined && (rates[asset].failed || now.value - (rates[asset].fetchedAt ?? 0) > 120_000);
const status = computed(() => loading.value ? '正在更新' : assets.some(asset => rates[asset].value === undefined)
  ? '行情暂不可用' : assets.some(stale) ? '历史参考 · 待更新' : '人民币参考价');
const stamp = (asset: ReferenceRateAsset) => rates[asset].fetchedAt ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
}).format(rates[asset].fetchedAt) : '尚未获取';

async function refresh() {
  if (disposed || loading.value || !canRefresh.value) return;
  loading.value = true;
  canRefresh.value = false;
  cooldown = setTimeout(() => { canRefresh.value = true; }, 10_000);
  controller = new AbortController();
  const signal = controller.signal;
  timeout = setTimeout(() => controller?.abort(), 8_000);
  await Promise.allSettled(assets.map(async asset => {
    try {
      const value = await fetchReferenceRate(asset, signal);
      if (!disposed) rates[asset] = { value, fetchedAt: Date.now(), failed: false };
    } catch {
      if (!disposed) rates[asset].failed = true;
    }
  }));
  clearTimeout(timeout);
  if (disposed) return;
  now.value = Date.now();
  loading.value = false;
}
function wake() {
  now.value = Date.now();
  if (!document.hidden) void refresh();
}
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') expanded.value = false; }
onMounted(() => {
  wake();
  interval = setInterval(wake, 60_000);
  document.addEventListener('visibilitychange', wake);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  disposed = true;
  controller?.abort();
  clearInterval(interval);
  clearTimeout(timeout);
  clearTimeout(cooldown);
  document.removeEventListener('visibilitychange', wake);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section class="reference-rates" aria-label="USDT 与 USDC 人民币参考汇率">
    <span class="rate-caption">数字货币 <span>/</span> 人民币</span>
    <button type="button" class="rate-quotes" :aria-expanded="expanded" :aria-controls="panelId" aria-label="查看 USDT 和 USDC 人民币汇率详情" @click="expanded = !expanded">
      <span v-for="asset in assets" :key="asset" class="rate-quote"><span class="coin" :class="asset.toLowerCase()" aria-hidden="true">{{ asset === 'USDT' ? '₮' : '$' }}</span><span>1 {{ asset }} ≈</span><strong>¥ {{ rates[asset].value?.toFixed(4) ?? '—' }}</strong><small v-if="stale(asset)">历史</small></span>
      <Icon :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" width="12" />
    </button>
    <span class="rate-status" role="status"><span class="status-dot" />{{ status }}</span>
    <div v-if="expanded" :id="panelId" class="rate-information">
      <div class="rate-information-inner"><div><h2>人民币参考汇率</h2><p>每 1 枚币种对应人民币金额。仅供参考，实际结算以支付页面为准。</p><p>商品人民币标价沿用本地参考折算，与此公开行情独立；订单和钱包仍按 USDT 结算。</p><a :href="REFERENCE_RATE_SOURCE" target="_blank" rel="noopener noreferrer">来源：Coinbase Exchange Rates ↗</a></div><div class="rate-times"><span v-for="asset in assets" :key="asset"><strong>{{ asset }}</strong> {{ rates[asset].failed ? '获取失败 · ' : '' }}{{ stamp(asset) }}<small v-if="rates[asset].fetchedAt"> 获取（北京时间）</small></span><small>可见时每 60 秒自动获取；获取时间不代表成交时间。</small></div><Button type="button" size="sm" :disabled="loading || !canRefresh" :title="!canRefresh && !loading ? '请稍候再刷新，避免频繁请求' : undefined" @click="refresh"><Icon icon="lucide:refresh-cw" width="14" :class="{ 'animate-spin': loading }" />{{ loading ? '正在更新' : '刷新汇率' }}</Button><Button type="button" variant="ghost" size="icon" aria-label="关闭汇率详情" @click="expanded = false"><Icon icon="lucide:x" width="16" /></Button></div>
    </div>
  </section>
</template>

<style scoped>
.reference-rates { display: flex; align-items: center; gap: 16px; min-width: 0; }
.rate-caption { color: var(--yb-muted); white-space: nowrap; font-size: 10px; }.rate-caption>span { padding-inline: 5px; }
.rate-quotes { display: flex; align-items: center; gap: 14px; height: 32px; font-size: 10px; white-space: nowrap; }.rate-quote { display: flex; align-items: center; gap: 5px; }.rate-quote+.rate-quote { border-left: 1px solid var(--yb-hairline-2); padding-left: 14px; }.rate-quote strong { min-width: 62px; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }.rate-quote small { color: var(--yb-warning); font-size: 9px; }
.coin { display: grid; place-items: center; flex: none; width: 16px; height: 16px; border-radius: 50%; font-size: 11px; color: white; font-weight: 650; }.usdt { background: #26a17b; }.usdc { background: #2775ca; }
.rate-status { display: flex; align-items: center; gap: 5px; color: var(--yb-muted); font-size: 10px; white-space: nowrap; }.status-dot { width: 4px; height: 4px; background: var(--yb-primary); border-radius: 50%; }
.rate-information { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--yb-fill); border-bottom: 1px solid var(--yb-hairline); box-shadow: var(--yb-shadow-2); }
.rate-information-inner { display: flex; align-items: center; gap: 24px; max-width: 1320px; width: calc(100% - 96px); margin-inline: auto; padding-block: 18px; }.rate-information h2 { font-size: 12px; margin: 0 0 4px; font-weight: 600; }.rate-information p { font-size: 11px; margin: 3px 0; color: var(--yb-muted); }.rate-information a { font-size: 10px; text-decoration: underline; text-underline-offset: 3px; }.rate-times { display: flex; flex-direction: column; gap: 5px; margin-left: auto; white-space: nowrap; font-size: 11px; }.rate-times strong { display: inline-block; min-width: 34px; font-size: 10px; }.rate-times small { font-size: 10px; color: var(--yb-muted); }.rate-information button { flex-shrink: 0; font-size: 11px; }
@media (max-width: 1250px) { .rate-caption { display: none; }.reference-rates { gap: 10px; }.rate-information-inner { flex-wrap: wrap; }.rate-times { margin-left: 0; } }
@media (max-width: 1100px) { .rate-information-inner { width: calc(100% - 48px); }.rate-status { display: none; } }
</style>
