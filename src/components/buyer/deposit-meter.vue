<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@shared';

interface Props {
  available: string;
  guaranteed: string;
  size?: 'sm' | 'lg';
}
const props = withDefaults(defineProps<Props>(), { size: 'lg' });

const total = computed(() => Number(props.available) + Number(props.guaranteed));
const guaranteedPct = computed(() => (total.value > 0 ? Number(props.guaranteed) / total.value : 0));
const ringSize = computed(() => (props.size === 'lg' ? 200 : 120));
const ringHole = computed(() => ringSize.value - 50);

const conicGradient = computed(() => {
  if (total.value === 0) return '#f2f3f5';
  return `conic-gradient(#86909c 0% ${guaranteedPct.value * 100}%, #0fc6c2 ${guaranteedPct.value * 100}% 100%)`;
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
    <div class="ring" :style="ringStyle">
      <div class="hole" :style="holeStyle">
        <div class="lbl">押金总额</div>
        <div class="total">U {{ formatAmount(total.toFixed(2)) }}</div>
      </div>
    </div>
    <div class="legend">
      <div class="legend-row available">
        <span class="dot" />
        <span class="lbl">可担保押金</span>
        <span class="val">U {{ formatAmount(available) }}</span>
      </div>
      <div class="legend-row guaranteed">
        <span class="dot" />
        <span class="lbl">已担保押金</span>
        <span class="val">U {{ formatAmount(guaranteed) }}</span>
      </div>
      <div class="legend-row sum">
        <span class="lbl">担保占用率</span>
        <span class="val">{{ (guaranteedPct * 100).toFixed(1) }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.deposit-meter {
  display: flex;
  gap: 32px;
  align-items: center;
}
.deposit-meter.sm {
  gap: 16px;
}
.ring {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hole {
  background: #fff;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.lbl {
  font-size: 11px;
  color: #86909c;
}
.total {
  font-size: 18px;
  font-weight: 700;
  color: #1d2129;
  font-family: ui-monospace, monospace;
}
.legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.legend-row {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: block;
}
.legend-row.available .dot {
  background: #0fc6c2;
}
.legend-row.guaranteed .dot {
  background: #86909c;
}
.legend-row.sum {
  grid-template-columns: 1fr auto;
  padding-top: 8px;
  border-top: 1px dashed #f2f3f5;
  margin-top: 4px;
  color: #4e5969;
}
.val {
  font-family: ui-monospace, monospace;
  font-weight: 600;
  color: #1d2129;
}
.deposit-meter.sm .total {
  font-size: 14px;
}
</style>
