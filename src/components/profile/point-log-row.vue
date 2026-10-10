<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { computed } from 'vue';
import { formatPoints } from '@shared';
import PointBehaviorTag from './point-behavior-tag.vue';
import { formatDateValue } from '@/utils/date-range';

interface Props {
  log: Api.RealPoint.Ledger;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'appeal', log: Api.RealPoint.Ledger): void }>();

const sign = computed(() => (props.log.change > 0 ? '+' : ''));
const amountColor = computed(() => (props.log.change > 0 ? '#00b42a' : '#f53f3f'));

const refDesc = computed(() => {
  if (props.log.refId) return `关联业务 · ${props.log.refId}`;
  return '';
});

const appealMeta = computed(() => {
  const s = props.log.appealStatus;
  if (!s || s === 'none') return undefined;
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: '申诉中', color: 'orange' },
    approved: { label: '申诉通过', color: 'green' },
    rejected: { label: '申诉驳回', color: 'red' }
  };
  return map[s];
});


</script>

<template>
  <article class="point-log-row">
    <div class="left"><PointBehaviorTag :behavior="log.behavior" :label="log.behaviorName" /></div>
    <div class="middle"><div v-if="refDesc" class="desc" :title="refDesc">{{ refDesc }}</div><time class="time">{{ formatDateValue(log.createdAt) }}</time></div>
    <div class="right"><strong class="change" :style="{ color: amountColor }">{{ sign }}{{ formatPoints(log.change) }}</strong><span class="balance">余额 {{ formatPoints(log.balanceAfter) }}</span></div>
    <div class="action"><span v-if="appealMeta" class="appeal-state" :class="appealMeta.color">{{ appealMeta.label }}</span><Button v-else-if="log.isAppealable" variant="outline" size="sm" @click="$emit('appeal', log)">申诉</Button><span v-else class="no-action">—</span></div>
  </article>
</template>

<style scoped>
.point-log-row { display:grid; grid-template-columns:140px minmax(0,1fr) 160px 100px; align-items:center; gap:20px; padding:22px 20px; border-bottom:1px solid var(--yb-hairline); transition:background .15s; }.point-log-row:last-child { border-bottom:0; }.point-log-row:hover { background:var(--yb-primary-soft); }.middle { min-width:0; }.desc { color:var(--yb-ink); font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.time { display:block; margin-top:6px; color:var(--yb-muted); font-size:12px; }.right,.action { text-align:right; }.change { display:block; font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }.balance { display:block; margin-top:6px; color:var(--yb-muted); font-size:12px; }.appeal-state { display:inline-flex; padding:4px 9px; font-size:12px; border-radius:4px; white-space:nowrap; }.orange { color:#9a5709; background:#fff3df; }.green { color:#326b43; background:#e9f3eb; }.red { color:#ad453e; background:#fcecea; }.no-action { color:var(--yb-muted); }@media(max-width:700px) { .point-log-row { grid-template-columns:1fr 110px; gap:10px; }.middle { grid-row:2; }.right { grid-column:2; grid-row:1; }.action { grid-column:2; grid-row:2; } }@media(prefers-reduced-motion:reduce) { .point-log-row { transition:none; } }
</style>
