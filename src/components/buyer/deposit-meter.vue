<script setup lang="ts">

import { computed } from 'vue';
import { formatAmount } from '@shared';

interface Props {
  balance?: string;
  frozen?: string;
  available?: string;
  usageRate?: string;
  size?: 'sm' | 'lg';
}
const props = withDefaults(defineProps<Props>(), { size: 'lg' });

function finiteAmount(value: string | number | undefined) {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const availableAmount = computed(() => finiteAmount(props.available));
const guaranteedAmount = computed(() => finiteAmount(props.frozen));
const total = computed(() => finiteAmount(props.balance));
const guaranteedPct = computed(() => total.value === undefined || guaranteedAmount.value === undefined
  ? undefined : total.value > 0 ? guaranteedAmount.value / total.value : 0);
const ringSize = computed(() => (props.size === 'lg' ? 200 : 120));
const ringHole = computed(() => ringSize.value - 50);

const conicGradient = computed(() => {
  if (!total.value || guaranteedPct.value === undefined) return 'var(--yb-hairline)';
  return `conic-gradient(var(--yb-muted) 0% ${guaranteedPct.value * 100}%, var(--yb-primary) ${guaranteedPct.value * 100}% 100%)`;
});

const ringStyle = computed(() => ({
  width: ringSize.value + 'px',
  height: ringSize.value + 'px',
  background: conicGradient.value
}));
const holeStyle = computed(() => ({
  width: ringHole.value + 'px',
  height: ringHole.value + 'px'
}));


</script>

<template>
  <div class="deposit-meter" :class="size">
    <div class="ring" :style="ringStyle" aria-hidden="true"><div class="hole" :style="holeStyle"><span class="lbl">押金总额</span><strong class="total">U {{ total === undefined ? '—' : formatAmount(total) }}</strong></div></div>
    <dl class="legend">
      <div class="legend-row available"><dt><span class="dot" />可退保证金</dt><dd>U {{ availableAmount === undefined ? '—' : formatAmount(availableAmount) }}</dd></div>
      <div class="legend-row guaranteed"><dt><span class="dot" />订单占用</dt><dd>U {{ guaranteedAmount === undefined ? '—' : formatAmount(guaranteedAmount) }}</dd></div>
      <div class="legend-row sum"><dt>占用率</dt><dd>{{ usageRate === undefined || usageRate === null ? '—' : usageRate + '%' }}</dd></div>
    </dl>
  </div>
</template>

<style scoped>
.deposit-meter { display:flex; align-items:center; gap:38px; }.ring { border-radius:50%; display:flex; justify-content:center; align-items:center; flex-shrink:0; }.hole { background:var(--yb-surface); border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }.lbl { font-size:12px; color:var(--yb-muted); }.total { font-size:21px; font-family:var(--yb-font-mono); font-weight:600; }.legend { flex:1; display:grid; gap:20px; margin:0; min-width:0; }.legend-row { display:flex; justify-content:space-between; align-items:center; gap:20px; }.legend-row dt { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--yb-muted); }.legend-row dd { margin:0; font-family:var(--yb-font-mono); font-size:17px; font-weight:550; overflow-wrap:anywhere; }.dot { width:9px; height:9px; border-radius:2px; background:var(--yb-primary); flex-shrink:0; }.guaranteed .dot { background:var(--yb-muted); }.sum { border-top:1px solid var(--yb-hairline); padding-top:20px; }.sm .total { font-size:13px; }.sm { gap:22px; }.sm .legend { gap:14px; }.sm .legend-row { gap:12px; }.sm .legend-row dd { font-size:14px; }@media(max-width:700px) { .deposit-meter { flex-direction:column; align-items:stretch; }.ring { align-self:center; } }
</style>
