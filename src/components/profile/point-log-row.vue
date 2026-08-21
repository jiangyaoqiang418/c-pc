<script setup lang="ts">
import { computed } from 'vue';
import { formatPoints } from '@shared';
import PointBehaviorTag from './point-behavior-tag.vue';

interface Props {
  log: Api.RealPoint.Ledger;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'appeal', log: Api.RealPoint.Ledger): void }>();

const sign = computed(() => (props.log.change > 0 ? '+' : ''));
const amountColor = computed(() => (props.log.change > 0 ? '#00b42a' : '#f53f3f'));

const refDesc = computed(() => {
  if (props.log.refType && props.log.refId) return `${props.log.refType} · ${props.log.refId}`;
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
  <div class="point-log-row">
    <div class="left">
      <PointBehaviorTag :behavior="log.behavior" />
    </div>
    <div class="middle">
      <div class="desc">{{ refDesc || log.behavior }}</div>
      <div class="time">{{ new Date(log.createdAt).toLocaleString() }}</div>
    </div>
    <div class="right">
      <div class="change" :style="{ color: amountColor }">
        {{ sign }}{{ formatPoints(log.change) }}
      </div>
      <div class="balance">余额 {{ formatPoints(log.balanceAfter) }}</div>
    </div>
    <div class="action">
      <a-tag v-if="appealMeta" :color="appealMeta.color" size="small">{{ appealMeta.label }}</a-tag>
      <a-button
        v-else-if="log.isAppealable"
        size="small"
        type="outline"
        @click="$emit('appeal', log)"
      >
        申诉
      </a-button>
      <span v-else class="no-action">—</span>
    </div>
  </div>
</template>

<style scoped>
.point-log-row {
  display: grid;
  grid-template-columns: 110px 1fr 130px 100px;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #f7f8fa;
  transition: background 0.15s;
}
.point-log-row:hover {
  background: #f7faff;
}
.desc {
  font-size: 13px;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
}
.right {
  text-align: right;
}
.change {
  font-size: 16px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.balance {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
}
.action {
  text-align: right;
}
.no-action {
  color: #c9cdd4;
  font-size: 12px;
}
</style>
