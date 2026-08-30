<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { formatAmount } from '@shared';
import { fetchFinanceOrderDetail, financeRedemptionIssue } from '@/service/api/finance';
import { createLatestRequestGuard } from '@/utils/latest-request';

interface Props {
  visible: boolean;
  order?: Api.RealFinance.FinanceOrderVO;
  submitting?: boolean;
  pending?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', order: Api.RealFinance.FinanceOrderVO): void;
}>();

const latestOrder = ref<Api.RealFinance.FinanceOrderVO>();
const reading = ref(false);
const readError = ref('');
const requestGuard = createLatestRequestGuard();
const displayedOrder = computed(() => props.pending ? props.order : latestOrder.value);
const issue = computed(() => props.pending ? '' : readError.value || (!latestOrder.value
  ? '正在核对原锁仓费用' : financeRedemptionIssue(latestOrder.value)));

async function readQuote() {
  const isCurrent = requestGuard.begin();
  latestOrder.value = undefined;
  readError.value = '';
  reading.value = false;
  if (!props.visible || !props.order || props.pending) return;
  const id = props.order.id;
  reading.value = true;
  try {
    const detail = await fetchFinanceOrderDetail(id, { signal: isCurrent.signal, showError: false });
    if (!isCurrent()) return;
    if (String(detail.id) !== String(id)) throw new Error('锁仓对象不一致');
    latestOrder.value = detail;
  } catch {
    if (isCurrent()) readError.value = '原锁仓费用读取失败，请重新读取';
  } finally {
    if (isCurrent()) reading.value = false;
  }
}
watch([() => props.visible, () => props.order?.id, () => props.pending], () => void readQuote(), { immediate: true, flush: 'sync' });
onBeforeUnmount(requestGuard.invalidate);

function money(value: string | number | undefined) {
  return value === undefined || value === null || String(value).trim() === '' || !Number.isFinite(Number(value))
    ? '待确认' : 'U ' + formatAmount(value);
}

function submit() {
  if (!props.visible || !displayedOrder.value || props.submitting || reading.value || issue.value) return false;
  emit('confirm', displayedOrder.value);
  return false;
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="确认提前赎回"
    :ok-loading="props.submitting"
    :ok-text="pending ? '核实赎回结果' : '确认赎回'"
    :ok-button-props="{ status: 'danger', disabled: reading || !!issue || !displayedOrder }"
    :on-before-ok="submit"
    @update:visible="(v) => $emit('update:visible', v)"
  >
    <a-alert v-if="issue" type="warning">{{ issue }}
      <template #action><a-button :loading="reading" :disabled="submitting" @click="readQuote">重新读取</a-button></template>
    </a-alert>
    <template v-if="displayedOrder">
      <a-alert v-if="pending" type="warning">上次赎回结果待确认，本次只读取原锁仓状态，不会重复发送赎回。</a-alert>
      <div class="warn">
        ⚠️ 提前赎回本金将返回可用余额，已产生利息会扣除违约费。最终到账以接口返回为准。
      </div>
      <a-descriptions :column="1" :data="[
        { label: '小金库订单', value: (displayedOrder.productCode || displayedOrder.id) + ' · ' + (displayedOrder.productName || '—') },
        { label: '本金', value: money(displayedOrder.principal) },
        { label: '预期利息', value: money(displayedOrder.expectedInterest) },
        { label: '已累积利息', value: money(displayedOrder.accruedInterest) },
        { label: '违约费', value: money(displayedOrder.redeemFee) },
        { label: '可到账利息', value: money(displayedOrder.redeemableInterest) }
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
