<script setup lang="ts">

import { computed } from 'vue';
import { formatAmount } from '@shared';

interface Props {
  balance?: string;
  frozen?: string;
  available?: string;
  usageRate?: string | null;
  size?: 'sm' | 'lg';
}
const props = withDefaults(defineProps<Props>(), { size: 'lg' });

const usageText = computed(() => {
  const text = typeof props.usageRate === 'string' ? props.usageRate.trim() : '';
  return /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? text : undefined;
});
const used = computed(() => usageText.value === undefined ? undefined : Math.min(100, Number(usageText.value)));
</script>

<template>
  <div class="buyer-deposit-summary">
    <div class="buyer-donut" :style="used === undefined ? { background:'var(--line)' } : { '--used':used + '%' }"><div><small>押金总额</small><strong>{{ balance === undefined ? '—' : formatAmount(balance) }}</strong><small>USDT</small></div></div>
    <div><span class="eyebrow">ROOM TO GROW</span><slot name="heading" /><dl class="buyer-dl"><dt>可退保证金</dt><dd>{{ available === undefined ? '—' : formatAmount(available) }} USDT</dd><dt>订单占用</dt><dd>{{ frozen === undefined ? '—' : formatAmount(frozen) }} USDT</dd><dt>占用率</dt><dd>{{ usageText === undefined ? '—' : usageText + '%' }}</dd></dl><slot name="actions" /></div>
  </div>
</template>
