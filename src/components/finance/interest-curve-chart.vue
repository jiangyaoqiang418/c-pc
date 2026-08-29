<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@shared';

interface Props {
  lockupDays: number;
  effectiveRatePct: number; // 年化 %
  principal: string;
  accruedDays?: number;
  width?: number;
  height?: number;
}
const props = withDefaults(defineProps<Props>(), { width: 720, height: 220, accruedDays: 0 });

const safeLockupDays = computed(() => Number.isFinite(props.lockupDays) && props.lockupDays > 0 ? props.lockupDays : 1);
const safeRatePct = computed(() => Number.isFinite(props.effectiveRatePct) ? props.effectiveRatePct : 0);
const safeAccruedDays = computed(() => Number.isFinite(props.accruedDays) ? Math.max(0, props.accruedDays) : 0);
const dailyRate = computed(() => safeRatePct.value / 100 / 365);
const principalNum = computed(() => {
  const parsed = Number(props.principal);
  return Number.isFinite(parsed) ? parsed : 0;
});

function interestAtDay(day: number): number {
  return principalNum.value * dailyRate.value * day;
}

const totalExpected = computed(() => interestAtDay(safeLockupDays.value));

const padL = 56;
const padR = 24;
const padT = 16;
const padB = 28;

const innerW = computed(() => props.width - padL - padR);
const innerH = computed(() => props.height - padT - padB);

const path = computed(() => {
  const steps = Math.max(1, Math.min(safeLockupDays.value, 60));
  const stepDay = safeLockupDays.value / steps;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const day = i * stepDay;
    const x = padL + (day / safeLockupDays.value) * innerW.value;
    const y = padT + innerH.value - (interestAtDay(day) / totalExpected.value || 0) * innerH.value;
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(' ');
});

const areaPath = computed(() => `${path.value} L ${padL + innerW.value} ${padT + innerH.value} L ${padL} ${padT + innerH.value} Z`);

const currentPoint = computed(() => {
  const day = Math.min(safeAccruedDays.value, safeLockupDays.value);
  const x = padL + (day / safeLockupDays.value) * innerW.value;
  const interest = interestAtDay(day);
  const y = padT + innerH.value - (interest / totalExpected.value || 0) * innerH.value;
  return { x, y, day, interest };
});

const yTicks = computed(() => [0, 0.25, 0.5, 0.75, 1].map(r => ({
  y: padT + innerH.value - r * innerH.value,
  label: `U ${formatAmount((totalExpected.value * r).toFixed(2))}`
})));

const xTicks = computed(() => {
  const count = 5;
  return Array.from({ length: count + 1 }, (_, i) => {
    const day = (safeLockupDays.value / count) * i;
    return {
      x: padL + (day / safeLockupDays.value) * innerW.value,
      label: `D${Math.round(day)}`
    };
  });
});
</script>

<template>
  <div class="curve-chart">
    <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height">
      <!-- Y axis ticks + grid -->
      <g class="grid">
        <line v-for="t in yTicks" :key="'y' + t.y" :x1="padL" :x2="padL + innerW" :y1="t.y" :y2="t.y" />
      </g>
      <g class="y-labels">
        <text v-for="t in yTicks" :key="'yl' + t.y" :x="padL - 8" :y="t.y + 4" text-anchor="end">
          {{ t.label }}
        </text>
      </g>
      <!-- X axis labels -->
      <g class="x-labels">
        <text v-for="t in xTicks" :key="'xl' + t.x" :x="t.x" :y="padT + innerH + 18" text-anchor="middle">
          {{ t.label }}
        </text>
      </g>
      <!-- Area + line -->
      <path :d="areaPath" fill="url(#curveGradient)" stroke="none" />
      <path :d="path" stroke="#722ed1" stroke-width="2" fill="none" />
      <!-- Current point -->
      <g v-if="safeAccruedDays > 0">
        <circle :cx="currentPoint.x" :cy="currentPoint.y" r="5" fill="#722ed1" />
        <line :x1="currentPoint.x" :y1="padT" :x2="currentPoint.x" :y2="padT + innerH" stroke="#722ed1" stroke-dasharray="3 3" stroke-width="1" opacity="0.6" />
        <text :x="currentPoint.x + 8" :y="currentPoint.y - 8" class="current-label" fill="#722ed1">
          已累 U {{ formatAmount(currentPoint.interest.toFixed(2)) }}
        </text>
      </g>
      <defs>
        <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#722ed1" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#722ed1" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
    <div class="legend">
      <span class="dot" />
      累积利息曲线 · 年化 {{ safeRatePct.toFixed(2) }}% · 锁定 {{ safeLockupDays }} 天 · 本金 U {{ formatAmount(principal) }}
    </div>
  </div>
</template>

<style scoped>
.curve-chart {
  width: 100%;
}
.grid line {
  stroke: #f2f3f5;
  stroke-width: 1;
}
.y-labels text,
.x-labels text {
  fill: #86909c;
  font-size: 11px;
  font-family: ui-monospace, monospace;
}
.current-label {
  font-size: 11px;
  font-weight: 600;
}
.legend {
  margin-top: 4px;
  font-size: 12px;
  color: #86909c;
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend .dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: #722ed1;
  display: inline-block;
}
</style>
