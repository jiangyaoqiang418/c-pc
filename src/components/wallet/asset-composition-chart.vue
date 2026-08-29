<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@shared';

interface Segment {
  label: string;
  color: string;
  value: string;
  pct: number;
}

interface Props {
  breakdown: Segment[];
  totalAssets: string;
  size?: number;
}
const props = withDefaults(defineProps<Props>(), { size: 180 });

// 4 级灰度 + 电光紫 accent（BiyaPay/ether.fi 风）
const GRAY_SCALE = ['#0F111A', '#4E5969', '#8A93A6', '#C9CDD4', '#EDECE6'];

function normalizedPct(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

const conicGradient = computed(() => {
  if (!props.breakdown.length) return 'var(--yb-hairline)';
  let acc = 0;
  const parts = props.breakdown.map((s, i) => {
    const start = acc * 100;
    acc += normalizedPct(s.pct);
    const end = acc * 100;
    return `${GRAY_SCALE[i % GRAY_SCALE.length]} ${start}% ${end}%`;
  });
  return `conic-gradient(${parts.join(', ')})`;
});

const ringStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  background: conicGradient.value
}));
const holeStyle = computed(() => {
  const inner = props.size - 48;
  return { width: inner + 'px', height: inner + 'px' };
});
</script>

<template>
  <div class="chart-wrap">
    <div v-if="breakdown.length" class="ring" :style="ringStyle">
      <div class="hole" :style="holeStyle">
        <div class="total-label">TOTAL ASSETS</div>
        <div class="total-val"><span class="unit">U</span><span class="num">{{ formatAmount(totalAssets) }}</span></div>
      </div>
    </div>
    <div v-else class="ring empty" :style="ringStyle">
      <div class="hole" :style="holeStyle">
        <div class="total-label">暂无资产</div>
      </div>
    </div>
    <div class="legend">
      <div v-for="(s, i) in breakdown" :key="s.label" class="legend-row">
        <span class="dot" :style="{ background: GRAY_SCALE[i % GRAY_SCALE.length] }" />
        <span class="lbl">{{ s.label }}</span>
        <span class="pct">{{ (normalizedPct(s.pct) * 100).toFixed(1) }}%</span>
        <span class="val">U {{ formatAmount(s.value) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-wrap {
  display: flex;
  align-items: center;
  gap: 32px;
}
.ring {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ring.empty {
  background: var(--yb-hairline) !important;
}
.hole {
  background: var(--yb-surface);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.total-label {
  font-size: 10px;
  color: var(--yb-muted);
  letter-spacing: 0.14em;
  font-weight: 600;
  margin-bottom: 4px;
}
.total-val {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding: 0 8px;
}
.total-val .unit {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--yb-muted);
}
.total-val .num {
  font-family: var(--yb-font-mono);
  font-size: 20px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
}
.legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.legend-row {
  display: grid;
  grid-template-columns: 10px 1fr 56px 120px;
  gap: 10px;
  font-size: 12px;
  color: var(--yb-ink-2);
  align-items: center;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: block;
}
.lbl {
  color: var(--yb-ink);
  font-weight: 500;
}
.pct {
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.val {
  text-align: right;
  font-family: var(--yb-font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--yb-ink);
}
</style>
