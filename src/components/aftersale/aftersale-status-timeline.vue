<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  caseRecord: Api.Order.AftersaleCase;
}
const props = defineProps<Props>();

interface Step {
  key: string;
  label: string;
  status: 'wait' | 'process' | 'finish' | 'error';
}

const STAGES: { key: string; label: string; matches: (s: Api.Order.AftersaleStatus) => boolean }[] = [
  { key: 'pending', label: '已提交·待买手响应', matches: () => true },
  {
    key: 'response',
    label: '买手响应',
    matches: s => ['shopper_agreed', 'shopper_rejected', 'arbitrating', 'executing', 'completed'].includes(s)
  },
  {
    key: 'arbitrating',
    label: '平台仲裁',
    matches: s => ['arbitrating', 'executing', 'completed'].includes(s)
  },
  { key: 'executing', label: '执行中', matches: s => ['executing', 'completed'].includes(s) },
  { key: 'completed', label: '已完成', matches: s => s === 'completed' }
];

const steps = computed<Step[]>(() => {
  const s = props.caseRecord.status;
  if (s === 'cancelled') {
    return [
      { key: 'pending', label: '已提交', status: 'finish' },
      { key: 'cancelled', label: '已撤销', status: 'error' }
    ];
  }
  let foundCurrent = false;
  return STAGES.map(stage => {
    const matched = stage.matches(s);
    let status: Step['status'] = 'wait';
    if (matched) {
      status = 'finish';
    } else if (!foundCurrent) {
      status = 'process';
      foundCurrent = true;
    }
    return { key: stage.key, label: stage.label, status };
  });
});
</script>

<template>
  <div class="timeline">
    <div v-for="(step, i) in steps" :key="step.key" class="step" :class="step.status">
      <div class="dot">{{ i + 1 }}</div>
      <div class="label">{{ step.label }}</div>
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
