<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
import { REFERENCE_RATE_ASSETS, REFERENCE_RATE_SOURCE } from '@/service/api/reference-rates';

import { referenceRates, referenceRateLoading, referenceRateCanRefresh, referenceRateStale, referenceRateStamp, refreshReferenceRates, retainReferenceRates } from '@/composables/use-reference-rates';

const assets = REFERENCE_RATE_ASSETS;
const expanded = ref(false);
const panelId = useId();
const rates = referenceRates;
const loading = referenceRateLoading;
const canRefresh = referenceRateCanRefresh;
const stale = referenceRateStale;
const stamp = referenceRateStamp;
const refresh = refreshReferenceRates;
const status = computed(() => loading.value ? '正在更新' : assets.some(asset => rates[asset].value === undefined)
  ? '行情暂不可用' : assets.some(stale) ? '历史参考 · 待更新' : '人民币参考价');
let release: (() => void) | undefined;
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') expanded.value = false; }
onMounted(() => { release = retainReferenceRates(); document.addEventListener('keydown', onKeydown); });
onBeforeUnmount(() => { release?.(); document.removeEventListener('keydown', onKeydown); });
</script>

<template>
  <section class="rate-band" aria-label="USDT 与 USDC 人民币参考汇率">
    <div class="wrap rate-inner">
      <span class="rate-caption">数字货币 <span>/</span> 人民币</span>
      <button type="button" class="rate-quotes" :aria-expanded="expanded" :aria-controls="panelId" aria-label="查看 USDT 和 USDC 人民币汇率详情" @click="expanded = !expanded">
        <span v-for="asset in assets" :key="asset" class="rate-quote" :class="{ stale: stale(asset) }">
          <svg v-if="asset === 'USDT'" class="rate-coin" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#26a17b" /><path d="M8 7h16v4h-6v14h-4V11H8z" fill="white" /><ellipse cx="16" cy="15" rx="10" ry="2.6" fill="none" stroke="white" stroke-width="1.4" /></svg>
          <svg v-else class="rate-coin" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#2775ca" /><path d="M10 7a11 11 0 0 0 0 18M22 7a11 11 0 0 1 0 18M19.5 11.5c-1-3-8-2-7 2 .8 2.5 7 1.5 7 5 0 4-7.5 4-7.5.5M16 6.7v3M16 22.3v3" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" /></svg>
          <span class="rate-symbol">1 {{ asset }}</span><span class="rate-equals">≈</span><strong>¥ {{ rates[asset].value?.toFixed(4) ?? '—' }}</strong><small v-if="stale(asset)" class="rate-stale-label">历史</small>
        </span><UmIcon name="chevron" class="rate-chevron" />
      </button>
      <span class="rate-status" :class="{ updating: loading }" role="status"><i />{{ status }}</span>
      <slot name="utilities" />
    </div>
    <div v-if="expanded" :id="panelId" class="rate-information"><div class="wrap rate-information-inner"><div><b>人民币参考汇率</b><span class="rate-detail-status">{{ status }}</span><p>1 枚币种对应人民币金额。仅供参考，实际结算以支付页面为准。</p><a :href="REFERENCE_RATE_SOURCE" target="_blank" rel="noopener noreferrer">来源：Coinbase Exchange Rates ↗</a></div><div class="rate-fetch-times"><span v-for="asset in assets" :key="asset"><b>{{ asset }}</b> {{ rates[asset].failed ? '获取失败 · ' : '' }}{{ stamp(asset) }} <small v-if="rates[asset].fetchedAt">获取（北京时间）</small></span><small>每 60 秒自动获取；获取时间不代表行情成交时间。</small></div><button type="button" class="rate-refresh" :disabled="loading || !canRefresh" :title="!canRefresh && !loading ? '请稍候再刷新，避免频繁请求' : undefined" @click="refresh">{{ loading ? '更新中…' : '刷新汇率' }}<UmIcon name="clock" /></button></div></div>
  </section>
</template>
