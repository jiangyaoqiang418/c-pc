<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  order: Api.RealOrder.DisplayRecord;
}
const props = defineProps<Props>();

interface Step {
  key: string;
  label: string;
  status: 'wait' | 'process' | 'finish' | 'error';
  time?: string;
}

const STAGES: { key: string; label: string; matchedBy: (s: Api.Order.OrderStatus, o: Api.RealOrder.DisplayRecord) => boolean; timeField: (o: Api.RealOrder.DisplayRecord) => string | undefined }[] = [
  { key: 'created', label: '创建', matchedBy: () => true, timeField: o => o.createdAt },
  { key: 'paid', label: '付款', matchedBy: s => s !== 'PENDING_PAYMENT' && s !== 'CANCELLED', timeField: o => o.paidAt },
  { key: 'procuring', label: '采购中', matchedBy: s => ['PROCURING', 'PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM', 'COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED'].includes(s), timeField: o => o.paidAt },
  { key: 'procured', label: '已采购', matchedBy: s => ['PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM', 'COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED'].includes(s), timeField: o => o.procuredAt },
  { key: 'shipped', label: '发货', matchedBy: s => ['IN_TRANSIT', 'AFTERSALE_CONFIRM', 'COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED'].includes(s), timeField: o => o.shippedAt },
  { key: 'delivered', label: '签收', matchedBy: s => ['AFTERSALE_CONFIRM', 'COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED'].includes(s), timeField: o => o.deliveredAt },
  { key: 'completed', label: '完成', matchedBy: s => ['COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED'].includes(s), timeField: o => o.deliveredAt },
  { key: 'archived', label: '归档', matchedBy: s => s === 'ARCHIVED', timeField: o => o.archivedAt }
];

const steps = computed<Step[]>(() => {
  const o = props.order;
  if (o.status === 'REFUNDED') {
    return [
      { key: 'created', label: '创建', status: 'finish', time: o.createdAt },
      { key: 'paid', label: '付款', status: 'finish', time: o.paidAt },
      { key: 'refund', label: '退款完成', status: 'finish', time: o.archivedAt }
    ];
  }
  if (o.status === 'CANCELLED') {
    return [
      { key: 'created', label: '创建', status: 'finish', time: o.createdAt },
      { key: 'cancelled', label: '已取消', status: 'error', time: o.archivedAt }
    ];
  }
  let foundCurrent = false;
  return STAGES.map(stage => {
    const matched = stage.matchedBy(o.status, o);
    let status: Step['status'] = 'wait';
    if (matched) {
      status = 'finish';
    } else if (!foundCurrent) {
      status = 'process';
      foundCurrent = true;
    }
    return { key: stage.key, label: stage.label, status, time: stage.timeField(o) };
  });
});
</script>

<template>
  <div class="timeline">
    <div v-for="(step, i) in steps" :key="step.key" class="step" :class="step.status">
      <div class="dot">{{ i + 1 }}</div>
      <div class="label">{{ step.label }}</div>
      <div v-if="step.time" class="time">{{ new Date(step.time).toLocaleString() }}</div>
      <div v-if="i < steps.length - 1" class="line" />
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  padding: 12px 0;
}
.step {
  position: relative;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e5e6eb;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  z-index: 2;
}
.step.finish .dot {
  background: var(--bw-brand-primary);
}
.step.process .dot {
  background: #ff7d00;
  animation: pulse 1.4s infinite;
}
.step.error .dot {
  background: #f53f3f;
}
.label {
  margin-top: 8px;
  font-size: 12px;
  color: #1d2129;
  font-weight: 500;
}
.step.wait .label {
  color: #c9cdd4;
}
.time {
  font-size: 10px;
  color: #86909c;
  margin-top: 2px;
}
.line {
  position: absolute;
  top: 14px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e5e6eb;
  z-index: 1;
}
.step.finish .line {
  background: var(--bw-brand-primary);
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
</style>
