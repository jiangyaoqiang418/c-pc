<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { formatFinanceAmount as formatAmount, knownFinanceDecimal, simpleFinanceInterest } from './v47-interest-math';

interface Props {
  lockupDays: number;
  annualRate: string | number;
  principal: string;
  accruedDays?: number;
  accruedInterest?: string | number;
  markerLabel?: string;
  width?: number;
  height?: number;
}
const props = withDefaults(defineProps<Props>(), { markerLabel: '实际利息' });
const safeDays = computed(() => Number.isSafeInteger(props.lockupDays) && props.lockupDays > 0 ? props.lockupDays : undefined);
const actualDay = computed(() => props.accruedDays !== undefined && Number.isSafeInteger(props.accruedDays) && props.accruedDays >= 0 ? props.accruedDays : undefined);
const projectionDay = ref(0);
watch([() => props.principal, () => props.lockupDays, () => props.accruedDays], () => {
  if (safeDays.value !== undefined) projectionDay.value = Math.max(0, Math.min(safeDays.value, actualDay.value ?? 0));
}, { immediate: true });
const projected = computed(() => simpleFinanceInterest(props.principal, props.annualRate, projectionDay.value));
const finalInterest = computed(() => safeDays.value === undefined ? undefined : simpleFinanceInterest(props.principal, props.annualRate, safeDays.value));
const actualInterest = computed(() => knownFinanceDecimal(props.accruedInterest));
const canProject = computed(() => safeDays.value !== undefined && projected.value !== undefined && finalInterest.value !== undefined
  && Number.isFinite(Number(finalInterest.value)) && Number.isFinite(Number(projected.value)));
const axisDays = computed(() => Math.max(safeDays.value ?? 0, actualDay.value ?? 0));
// SVG positions alone use floating-point ratios. Financial labels retain decimal strings.
const axisInterest = computed(() => {
  const actual = Number(actualInterest.value);
  const final = Number(finalInterest.value);
  return Math.max(Number.isFinite(final) ? final : 0, Number.isFinite(actual) ? actual : 0);
});
const xAt = (day: number) => 20 + 560 * (axisDays.value > 0 ? day / axisDays.value : 0);
const yAt = (interest: string | undefined) => 150 - 130 * (axisInterest.value ? Number(interest) / axisInterest.value : 0);
const previewPoint = computed(() => ({ x: xAt(projectionDay.value), y: yAt(projected.value) }));
const finalPoint = computed(() => ({ x: xAt(safeDays.value ?? 0), y: yAt(finalInterest.value) }));
const actualPoint = computed(() => actualDay.value === undefined || actualInterest.value === undefined || !Number.isFinite(Number(actualInterest.value))
  ? undefined : { x:xAt(actualDay.value), y:yAt(actualInterest.value) });
</script>

<template>
  <template v-if="canProject || actualPoint">
  <div class="vault-curve-head"><h3>{{ canProject ? '收益进度预览' : '订单实际收益' }}</h3><span v-if="canProject">第 {{ projectionDay }} 天 · + {{ formatAmount(projected, { decimals: 4 }) }} USDT</span><span v-else>第 {{ actualDay }} 天 · {{ markerLabel }}</span></div>
  <svg class="vault-curve" viewBox="0 0 600 190" role="img" :aria-label="canProject ? '按日单利理论收益曲线，实际利息点采用订单返回值，不代表每日到账流水' : '订单实际利息点，理论收益参数尚未确认'">
    <path d="M20 20H580M20 85H580M20 150H580" stroke="var(--line)" fill="none" />
    <path v-if="canProject" :d="`M20 150L${finalPoint.x} ${finalPoint.y}L${finalPoint.x} 150Z`" fill="var(--soft)" />
    <path v-if="canProject" :d="`M20 150L${finalPoint.x} ${finalPoint.y}`" stroke="var(--muted)" stroke-width="3" stroke-dasharray="7 6" fill="none" />
    <path v-if="canProject" :d="`M20 150L${previewPoint.x} ${previewPoint.y}`" stroke="var(--green)" stroke-width="3" fill="none" />
    <circle v-if="canProject" :cx="previewPoint.x" :cy="previewPoint.y" r="6" fill="var(--green)" stroke="var(--paper)" stroke-width="3"><title>第 {{ projectionDay }} 天理论利息 {{ formatAmount(projected, { decimals: 8 }) }} USDT</title></circle>
    <circle v-if="actualPoint" :cx="actualPoint.x" :cy="actualPoint.y" r="4" fill="var(--gold)" stroke="var(--paper)" stroke-width="2"><title>{{ markerLabel }} {{ formatAmount(accruedInterest, { decimals: 8 }) }} USDT</title></circle>
    <text x="20" y="181">第 0 天</text><text x="580" y="181" text-anchor="end">第 {{ axisDays }} 天</text>
  </svg>
  <input v-if="canProject" v-model.number="projectionDay" class="vault-day-slider" type="range" min="0" :max="safeDays" step="1" aria-label="预览计息天数" />
  </template>
  <p v-if="!canProject" class="vault-formula" role="status">本金、年化利率或锁仓期限尚未确认，暂无法测算收益曲线。</p>
  <p v-if="actualInterest !== undefined" class="vault-formula">订单{{ markerLabel }}：{{ formatAmount(accruedInterest, { decimals: 8 }) }} USDT</p>
</template>
