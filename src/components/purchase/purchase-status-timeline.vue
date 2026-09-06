<script setup lang="ts">
import { computed } from 'vue';
import { formatDateValue } from '@/utils/date-range';

interface Props {
  request: Api.RealPurchase.DisplayRecord;
  progress?: Api.RealPurchase.Progress;
}
const props = defineProps<Props>();

interface Step {
  label: string;
  status: 'wait' | 'process' | 'finish' | 'error';
  description?: string;
}

const steps = computed<Step[]>(() => {
  if (props.progress) return props.progress.timeline.map(node => ({ label: node.name, status: 'finish', description: `${formatDateValue(node.occurredAt)} ${node.description || ''}` }));
  const s = props.request.status;
  if (s === 'rejected') {
    return [
      { label: '已发起', status: 'finish' },
      { label: '审核驳回', status: 'error' }
    ];
  }
  if (s === 'cancelled') {
    return [
      { label: '已发起', status: 'finish' },
      { label: '已取消', status: 'error' }
    ];
  }
  const STAGES = ['已发起', '审核通过', '推送中', '已接单'];
  let foundCurrent = false;
  return STAGES.map((label, i) => {
    const stage = i;
    let matched = false;
    if (stage === 0) matched = true;
    else if (stage === 1) matched = s !== 'pending_audit';
    else if (stage === 2) matched = s === 'pushing' || s === 'claimed';
    else if (stage === 3) matched = s === 'claimed';
    let status: Step['status'] = 'wait';
    if (matched) status = 'finish';
    else if (!foundCurrent) {
      status = 'process';
      foundCurrent = true;
    }
    return { label, status };
  });
});
</script>

<template>
  <div class="timeline">
    <div v-for="(step, i) in steps" :key="i" class="step" :class="step.status">
      <div class="dot">{{ i + 1 }}</div>
      <div class="label">{{ step.label }}</div>
      <small v-if="step.description">{{ step.description }}</small>
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
