<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Icon } from '@iconify/vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  color?: string;
  trend?: string;
  delta?: number; // 百分比变化 +12 / -3
  sparkline?: number[];
}
const props = withDefaults(defineProps<Props>(), { color: '#5B5CE7' });

const sparklineOption = computed(() => {
  const data = props.sparkline || genFake(props.value);
  return {
    grid: { top: 4, left: 0, right: 0, bottom: 4 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false },
    series: [
      {
        type: 'line',
        data,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: props.color, width: 1.6 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${props.color}30` },
              { offset: 1, color: `${props.color}00` }
            ]
          }
        }
      }
    ]
  };
});

function genFake(v: string | number) {
  const base = Number(String(v).replace(/[^0-9.]/g, '')) || 10;
  return Array.from({ length: 12 }, (_, i) => Math.max(0, base * (0.75 + Math.sin(i * 0.9 + base) * 0.18 + i * 0.02)));
}

const deltaColor = computed(() => {
  if (props.delta == null) return null;
  return props.delta >= 0 ? 'var(--yb-success)' : 'var(--yb-danger)';
});
const deltaIcon = computed(() => (props.delta! >= 0 ? 'lucide:trending-up' : 'lucide:trending-down'));

const chartKey = shallowRef(0);
</script>

<template>
  <div class="kpi-card" :style="{ '--accent': color }">
    <div class="head">
      <div class="icon-wrap">
        <Icon :icon="icon" class="icon" />
      </div>
      <div v-if="delta != null" class="delta" :style="{ color: deltaColor! }">
        <Icon :icon="deltaIcon" width="12" />
        <span class="yb-mono">{{ Math.abs(delta).toFixed(1) }}%</span>
      </div>
    </div>
    <div class="value-row">
      <span class="value yb-mono">{{ value }}</span>
      <span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div class="label">{{ label }}</div>
    <div class="spark">
      <VChart :key="chartKey" :option="sparklineOption" autoresize />
    </div>
    <div v-if="trend" class="trend">{{ trend }}</div>
  </div>
</template>

<style scoped>
.kpi-card {
  position: relative;
  background: var(--yb-surface);
  border-radius: var(--yb-radius-card);
  padding: 20px 22px 16px;
  border: 1px solid var(--yb-hairline);
  box-shadow: var(--yb-shadow-1);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s;
  display: flex;
  flex-direction: column;
  min-height: 160px;
  overflow: hidden;
}
.kpi-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, var(--accent) 0%, transparent 60%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.28s;
  pointer-events: none;
}
.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 0 30px color-mix(in srgb, var(--accent) 12%, transparent), var(--yb-shadow-2);
}
.kpi-card:hover::before {
  opacity: 1;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 10%, var(--yb-surface));
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon {
  width: 18px;
  height: 18px;
}
.delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--yb-radius-pill);
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 4px 0 2px;
}
.value {
  font-size: 30px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
}
.unit {
  font-size: 12px;
  color: var(--yb-muted);
  font-weight: 500;
}
.label {
  font-size: 12px;
  color: var(--yb-muted);
  margin-bottom: 6px;
}
.spark {
  flex: 1;
  min-height: 36px;
  margin: 4px 0;
}
.trend {
  font-size: 11px;
  color: var(--yb-faint);
  font-family: var(--yb-font-mono);
}
</style>
