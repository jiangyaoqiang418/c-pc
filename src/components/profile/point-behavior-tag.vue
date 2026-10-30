<script setup lang="ts">

import { computed } from 'vue';

interface Props {
  behavior: string;
  label?: string;
  size?: 'small' | 'medium';
}
const props = withDefaults(defineProps<Props>(), { size: 'small' });

const META: Record<Api.Point.BehaviorCode, { label: string; color: string }> = {
  CONSUME: { label: '消费', color: 'red' },
  DEPOSIT_IN: { label: '链上充值', color: 'green' },
  RECHARGE: { label: '充值', color: 'green' },
  WITHDRAW: { label: '转出', color: 'orange' },
  FINANCE_HOLD: { label: '小金库持仓', color: 'purple' },
  ORDER_DONE: { label: '订单完成', color: 'arcoblue' },
  KYC_PASS: { label: '实名认证通过', color: 'cyan' },
  REVIEW_GOOD: { label: '好评', color: 'green' },
  REVIEW_BAD: { label: '差评', color: 'red' },
  DEPOSIT_PLEDGE: { label: '保证金担保', color: 'cyan' },
  BUYER_NO_FULFILL: { label: '买手未履约', color: 'red' }
};

const meta = computed(() => {
  const known = Object.prototype.hasOwnProperty.call(META, props.behavior)
    ? META[props.behavior as Api.Point.BehaviorCode] : undefined;
  if (known) return { ...known, label: props.label || known.label };
  return { label: props.label || (props.behavior ? `未识别类型（${props.behavior}）` : '未识别类型'), color: 'gray' };
});


</script>

<template>
  <span class="behavior-tag" :class="[meta.color, size]">{{ meta.label }}</span>
</template>

<style scoped>
.behavior-tag { display:inline-flex; align-items:center; padding:4px 9px; font-size:12px; line-height:1.4; border-radius:4px; background:var(--soft); color:var(--muted); white-space:nowrap; }.medium { font-size:13px; }.red { color:var(--yb-danger); background:color-mix(in srgb,var(--yb-danger) 10%,var(--paper)); }.green { color:var(--yb-success); background:color-mix(in srgb,var(--yb-success) 10%,var(--paper)); }.orange { color:var(--yb-warning); background:color-mix(in srgb,var(--yb-warning) 10%,var(--paper)); }.purple { color:var(--yb-info); background:color-mix(in srgb,var(--yb-info) 10%,var(--paper)); }.arcoblue,.cyan { color:var(--yb-info); background:color-mix(in srgb,var(--yb-info) 10%,var(--paper)); }
</style>
