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

  <ol class="timeline" aria-label="求购处理进度">
    <li v-for="(step, i) in steps" :key="i" class="step" :class="step.status">
      <span class="dot" aria-hidden="true">{{ i + 1 }}</span>
      <div><strong>{{ step.label }}</strong><p v-if="step.description">{{ step.description }}</p></div>
    </li>
  </ol>

</template>

<style scoped>

.timeline { list-style:none; padding:0; margin:0; }.step { position:relative; display:grid; grid-template-columns:30px 1fr; gap:16px; padding:0 0 24px; min-height:52px; }.step:not(:last-child)::before { content:''; position:absolute; width:1px; background:var(--yb-hairline); top:30px; bottom:0; left:14px; }.dot { width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:12px; font-family:var(--yb-font-mono); color:var(--yb-muted); background:var(--yb-fill); }.step.finish .dot { background:var(--yb-primary-soft); color:var(--yb-brand-primary); }.step.process .dot { background:color-mix(in srgb,var(--yb-warning) 10%,var(--yb-surface)); color:var(--yb-warning); }.step.error .dot { background:var(--yb-danger-soft); color:var(--yb-danger); }.step strong { font-size:14px; font-weight:600; display:block; margin-top:3px; }.step p { font-size:13px; color:var(--yb-muted); line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; margin:6px 0 0; }.step.wait strong { color:var(--yb-muted); }.step:last-child { padding-bottom:16px; }

</style>
