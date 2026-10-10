<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Icon } from '@iconify/vue';
import { Skeleton } from '@/components/ui/skeleton';
import DescriptionList from '@/components/common/description-list.vue';
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

  <AModal :visible="visible" title="确认提前赎回" :width="560" :ok-loading="props.submitting" :ok-text="pending ? '核实赎回结果' : '确认赎回'" :ok-button-props="{ status: 'danger', disabled: reading || !!issue || !displayedOrder }" :mask-closable="!submitting" :esc-to-close="!submitting" :closable="!submitting" :on-before-cancel="() => !submitting" :on-before-ok="submit" @update:visible="(v: boolean) => $emit('update:visible', v)">
    <div v-if="issue" class="notice" role="alert"><Icon icon="lucide:circle-alert" width="20" /><span>{{ issue }}</span><Button type="button" variant="outline" size="sm" :disabled="reading || submitting" @click="readQuote">{{ reading ? '正在核对…' : '重新读取' }}</Button></div>
    <Skeleton v-if="reading" class="quote-skeleton" aria-label="正在核对赎回费用" />
    <template v-else-if="displayedOrder">
      <p v-if="pending" class="pending-note" role="alert">上次赎回结果待确认，本次只读取原锁仓状态，不会重复发送赎回。</p>
      <div class="quote-heading"><span class="asset-icon"><Icon icon="lucide:undo-2" width="28" /></span><h2>提前赎回报价</h2><p>{{ displayedOrder.productName || '—' }}</p></div>
      <div class="principal"><small>退回本金</small><strong>{{ money(displayedOrder.principal) }}</strong></div>
      <DescriptionList :columns="1" :items="[{ label: '小金库订单', value: String(displayedOrder.productCode || displayedOrder.id) }, { label: '预期利息', value: money(displayedOrder.expectedInterest) }, { label: '已累积利息', value: money(displayedOrder.accruedInterest) }, { label: '违约费', value: money(displayedOrder.redeemFee) }, { label: '可到账净利息', value: money(displayedOrder.redeemableInterest) }]" />
      <p class="warn">提前赎回将停止后续计息，已产生利息会扣除违约费。确认后需输入支付密码，最终到账以结算结果为准。</p>
    </template>
  </AModal>

</template>

<style scoped>

.notice { display:flex; align-items:center; gap:12px; padding:16px; background:var(--yb-primary-soft); border-radius:12px; font-size:13px; margin-bottom:20px; }.notice>svg { flex:none; color:var(--yb-brand-primary); }.notice>span { flex:1; }.quote-heading { text-align:center; margin:12px 0 24px; }.asset-icon { display:inline-flex; padding:18px; border-radius:18px; color:var(--yb-brand-primary); background:var(--yb-primary-soft); }.quote-heading h2 { font-size:22px; font-weight:600; margin:12px 0 4px; }.quote-heading p { font-size:13px; color:var(--yb-muted); margin:0; }.principal { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; border-radius:16px; background:var(--yb-fill); margin-bottom:24px; }.principal small { font-size:12px; color:var(--yb-muted); }.principal strong { font-size:30px; font-family:var(--yb-font-mono); font-weight:500; }.warn,.pending-note { font-size:13px; color:var(--yb-muted); line-height:1.8; padding:16px; border-radius:12px; background:var(--yb-fill); margin:20px 0 0; }.pending-note { margin:0 0 20px; background:var(--yb-primary-soft); }.quote-skeleton { height:330px; border-radius:16px; }

</style>
