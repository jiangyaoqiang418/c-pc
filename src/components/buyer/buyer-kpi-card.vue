<script setup lang="ts">

import { computed, onMounted, shallowRef } from 'vue';
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
const props = withDefaults(defineProps<Props>(), { color: 'var(--yb-brand-primary)' });

// ECharts 渐变需要实际色值，不能给 CSS 变量直接拼接透明度后缀。
const themeStyle = shallowRef<CSSStyleDeclaration>();
onMounted(() => { themeStyle.value = getComputedStyle(document.documentElement); });
const chartColor = computed(() => {
  const token = /^var\((--[\w-]+)\)$/.exec(props.color);
  return token ? themeStyle.value?.getPropertyValue(token[1]).trim() || '#295D49' : props.color;
});

const sparklineOption = computed(() => {
  const data = props.sparkline || [];
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
        lineStyle: { color: chartColor.value, width: 1.6 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${chartColor.value}30` },
              { offset: 1, color: `${chartColor.value}00` }
            ]
          }
        }
      }
    ]
  };
});


const validDelta = computed(() => (
  props.delta != null && Number.isFinite(props.delta) ? props.delta : undefined
));
const deltaColor = computed(() => {
  if (validDelta.value === undefined) return null;
  return validDelta.value >= 0 ? 'var(--yb-success)' : 'var(--yb-danger)';
});
const deltaIcon = computed(() => (
  validDelta.value !== undefined && validDelta.value >= 0
    ? 'lucide:trending-up'
    : 'lucide:trending-down'
));

const chartKey = shallowRef(0);
const hasSparkline = computed(() => !!props.sparkline && props.sparkline.length > 1 && props.sparkline.every(Number.isFinite));


</script>

<template>
  <article class="kpi-card" :style="{ '--accent': color }"><header><span class="icon-wrap"><Icon :icon="icon" width="20" /></span><span v-if="validDelta != null" class="delta" :style="{ color: deltaColor! }"><Icon :icon="deltaIcon" width="14" />{{ Math.abs(validDelta).toFixed(1) }}%</span></header><div class="value-row"><strong>{{ value }}</strong><span v-if="unit">{{ unit }}</span></div><div class="label">{{ label }}</div><div v-if="hasSparkline" class="spark"><VChart :key="chartKey" :option="sparklineOption" autoresize /></div><div v-if="trend" class="trend">{{ trend }}</div></article>
</template>

<style scoped>
.kpi-card {
  display:grid;
  grid-template-columns:38px minmax(0,1fr);
  column-gap:14px;
  row-gap:4px;
  align-content:center;
  padding:18px 20px;
  border:1px solid var(--yb-hairline);
  border-radius:10px;
  background:var(--yb-surface);
  min-width:0;
  transition:transform .2s,box-shadow .2s;
}
.kpi-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgb(20 40 30 / 5%); }
.kpi-card header {
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:6px;
  grid-column:1;
  grid-row:1 / span 2;
}
.icon-wrap { display:grid; place-items:center; width:38px; height:38px; background:color-mix(in srgb,var(--accent) 10%,var(--yb-surface)); color:var(--accent); border-radius:8px; }
.delta { display:flex; align-items:center; gap:5px; font-size:12px; white-space:nowrap; }
.value-row { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; grid-column:2; min-width:0; }
.value-row strong { font-size:28px; line-height:1.2; font-weight:600; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.value-row>span { font-size:12px; color:var(--yb-muted); }
.label { grid-column:2; color:var(--yb-muted); font-size:13px; line-height:1.5; }
.spark { grid-column:1 / -1; height:44px; margin-top:12px; }
.trend { grid-column:1 / -1; color:var(--yb-muted); font-size:12px; margin-top:8px; }
@media(prefers-reduced-motion:reduce) { .kpi-card { transition:none; }.kpi-card:hover { transform:none; } }
</style>
