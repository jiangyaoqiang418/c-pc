<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  behavior: string;
  label?: string;
  size?: 'small' | 'medium';
}
const props = withDefaults(defineProps<Props>(), { size: 'small' });

const META: Record<Api.Point.BehaviorCode, { label: string; color: string; emoji: string }> = {
  CONSUME: { label: '消费', color: 'red', emoji: '🛒' },
  DEPOSIT_IN: { label: '链上充值', color: 'green', emoji: '💰' },
  RECHARGE: { label: '充值', color: 'green', emoji: '🪙' },
  WITHDRAW: { label: '转出', color: 'orange', emoji: '📤' },
  FINANCE_HOLD: { label: '小金库持仓', color: 'purple', emoji: '🔒' },
  ORDER_DONE: { label: '订单完成', color: 'arcoblue', emoji: '✅' },
  KYC_PASS: { label: 'KYC 通过', color: 'cyan', emoji: '🪪' },
  REVIEW_GOOD: { label: '好评', color: 'green', emoji: '⭐' },
  REVIEW_BAD: { label: '差评', color: 'red', emoji: '😞' },
  DEPOSIT_PLEDGE: { label: '押金担保', color: 'cyan', emoji: '🛡' },
  BUYER_NO_FULFILL: { label: '买手未履约', color: 'red', emoji: '⚠️' }
};

const meta = computed(() => {
  const known = Object.prototype.hasOwnProperty.call(META, props.behavior)
    ? META[props.behavior as Api.Point.BehaviorCode] : undefined;
  if (known) return { ...known, label: props.label || known.label };
  return { label: props.label || (props.behavior ? `未识别类型（${props.behavior}）` : '未识别类型'), color: 'gray', emoji: 'ℹ️' };
});
</script>

<template>
  <a-tag :color="meta.color" :size="size">
    <span class="emoji">{{ meta.emoji }}</span>
    {{ meta.label }}
  </a-tag>
</template>

<style scoped>
.emoji {
  margin-right: 4px;
}
</style>
