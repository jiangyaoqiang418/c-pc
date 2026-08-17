<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatAmount } from '@shared';

interface Props {
  visible: boolean;
  order?: Api.RealFinance.FinanceOrderVO;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', order: Api.RealFinance.FinanceOrderVO): void;
}>();

const submitting = ref(false);

const lossAmount = computed(() => {
  if (!props.order) return '0';
  return String(props.order.redeemFee || 0);
});

watch(
  () => props.visible,
  () => undefined
);

async function submit() {
  if (!props.order) return;
  submitting.value = true;
  try {
    emit('confirm', props.order);
  } finally {
    setTimeout(() => (submitting.value = false), 800);
  }
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="确认提前赎回"
    :ok-loading="submitting"
    ok-text="确认赎回"
    :ok-button-props="{ status: 'danger' }"
    @update:visible="(v) => $emit('update:visible', v)"
    @ok="submit"
  >
    <template v-if="order">
      <div class="warn">
        ⚠️ 提前赎回本金将返回可用余额，已产生利息会扣除违约费。最终到账以接口返回为准。
      </div>
      <a-descriptions :column="1" :data="[
        { label: '小金库订单', value: (order.productCode || order.id) + ' · ' + order.productName },
        { label: '本金', value: 'U ' + formatAmount(order.principal) },
        { label: '预期利息', value: 'U ' + formatAmount(order.expectedInterest) },
        { label: '已累积利息', value: 'U ' + formatAmount(order.accruedInterest) },
        { label: '违约费', value: 'U ' + formatAmount(lossAmount) },
        { label: '可到账利息', value: 'U ' + formatAmount(order.redeemableInterest || 0) }
      ]" />
    </template>
  </a-modal>
</template>

<style scoped>
.warn {
  background: #fff7e6;
  color: #ff7d00;
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 4px;
  border-left: 3px solid #ff7d00;
  margin-bottom: 12px;
  line-height: 1.6;
}
.form {
  margin-top: 14px;
}
</style>
