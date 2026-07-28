<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';

interface Props {
  visible: boolean;
  order?: Api.FinanceProduct.LockupOrder;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', order: Api.FinanceProduct.LockupOrder): void;
}>();

const payPwd = ref('');
const submitting = ref(false);

const lossAmount = computed(() => {
  if (!props.order) return '0';
  const expected = Number(props.order.expectedInterest) || 0;
  const accrued = Number(props.order.accruedInterest) || 0;
  return Math.max(0, expected - accrued).toFixed(2);
});

watch(
  () => props.visible,
  v => {
    if (v) payPwd.value = '';
  }
);

async function submit() {
  if (!props.order) return;
  if (!payPwd.value) {
    Message.warning('请输入支付密码（原型阶段任意值）');
    return;
  }
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
    title="确认提前解锁"
    :ok-loading="submitting"
    ok-text="确认解锁"
    :ok-button-props="{ status: 'danger' }"
    @update:visible="(v) => $emit('update:visible', v)"
    @ok="submit"
  >
    <template v-if="order">
      <div class="warn">
        ⚠️ 提前解锁将立即终止本期小金库，<strong>损失全部预期利息 U {{ formatAmount(lossAmount) }}</strong>，已累积利息 U {{ formatAmount(order.accruedInterest) }} 保留。
      </div>
      <a-descriptions :column="1" :data="[
        { label: '小金库订单', value: order.code + ' · ' + order.productName },
        { label: '本金', value: 'U ' + formatAmount(order.principalAmount) },
        { label: '预期利息', value: 'U ' + formatAmount(order.expectedInterest) },
        { label: '已累积利息', value: 'U ' + formatAmount(order.accruedInterest) },
        { label: '损失利息', value: 'U ' + formatAmount(lossAmount) },
        { label: '解锁后到账', value: 'U ' + formatAmount(order.principalAmount) + '（仅本金）' }
      ]" />
      <a-form :model="{ payPwd }" layout="vertical" class="form">
        <a-form-item label="支付密码（原型环境任意输入）">
          <a-input-password v-model="payPwd" placeholder="任意 6 位以上" />
        </a-form-item>
      </a-form>
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
