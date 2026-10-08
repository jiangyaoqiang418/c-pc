<script setup lang="ts">
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
  <div class="point-log-row">
    <div class="left">
      <PointBehaviorTag :behavior="log.behavior" :label="log.behaviorName" />
    </div>
    <div class="middle">
      <div v-if="refDesc" class="desc">{{ refDesc }}</div>
      <div class="time">{{ formatDateValue(log.createdAt) }}</div>
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
  border-bottom: 1px solid var(--yb-fill);
  transition: background 0.15s;
}
.point-log-row:hover {
  background: var(--yb-primary-soft);
}
.desc {
  font-size: 13px;
  color: var(--yb-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  font-size: 11px;
  color: var(--yb-muted);
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
  color: var(--yb-muted);
  margin-top: 2px;
}
.action {
  text-align: right;
}
.no-action {
  color: var(--yb-hairline-2);
  font-size: 12px;
}
</style>
