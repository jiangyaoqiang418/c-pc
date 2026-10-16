<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import V47VaultDialog from './v47-vault-dialog.vue';
import { sumPaymentAmounts } from '@/utils/checkout';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { formatFinanceAmount as formatAmount } from './v47-interest-math';
import { fetchFinanceOrderDetail, financeRedemptionIssue } from '@/service/api/finance';
import { useUserStore } from '@/stores';
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

const userStore = useUserStore();
const latestOrder = ref<Api.RealFinance.FinanceOrderVO>();
const reading = ref(false);
const acknowledged = ref(false);
const expectedTotal = computed(() => {
  if (displayedOrder.value?.principal === undefined || displayedOrder.value?.redeemableInterest === undefined) return undefined;
  try { return sumPaymentAmounts([displayedOrder.value.principal, displayedOrder.value.redeemableInterest]); } catch { return undefined; }
});
const readError = ref('');
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const displayedOrder = computed(() => props.pending ? props.order : latestOrder.value);
const issue = computed(() => props.pending ? '' : readError.value || (!latestOrder.value
  ? '正在核对原锁仓费用' : financeRedemptionIssue(latestOrder.value)));

async function readQuote() {
  const isCurrent = requestGuard.begin();
  acknowledged.value = false;
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
    ? '待确认' : formatAmount(value, { decimals: 8 });
}

function submit() {
  if (!props.visible || !displayedOrder.value || props.submitting || reading.value || issue.value || (!props.pending && (!acknowledged.value || expectedTotal.value === undefined))) return false;
  emit('confirm', displayedOrder.value);
  return false;
}


</script>

<template>
  <V47VaultDialog :visible="visible" :title="pending ? '核实赎回结果' : '提前赎回报价'" :description="(displayedOrder?.productName || order?.productName || '锁仓') + ' · USDT'" eyebrow="REVIEW YOUR REDEMPTION" icon="return" :busy="submitting" @update:visible="emit('update:visible', $event)">
    <div v-if="issue" class="status-banner quote-notice" role="alert"><UmIcon name="shield" /><span>{{ issue }}</span><button class="outline" :disabled="reading || submitting" @click="readQuote">{{ reading ? '正在核对…' : '重新读取' }}</button></div>
    <Skeleton v-if="reading" class="quote-skeleton" aria-label="正在核对赎回费用" />
    <template v-else-if="displayedOrder">
      <p v-if="pending" class="vault-confirm-note" role="alert">上次赎回结果待确认，本次只读取原锁仓状态，不会重复发送赎回。</p>
      <div class="vault-confirm-amount"><small>预计退回余额</small><strong>{{ expectedTotal === undefined ? '待确认' : formatAmount(expectedTotal, { decimals: 4 }) }} <span>USDT</span></strong></div>
      <dl class="vault-breakdown"><div><dt>退回本金</dt><dd>{{ money(displayedOrder.principal) }}</dd></div><div><dt>已累计利息</dt><dd>+ {{ money(displayedOrder.accruedInterest) }}</dd></div><div><dt>利息违约费</dt><dd class="vault-fee">− {{ money(displayedOrder.redeemFee) }}</dd></div><div><dt>可到账净利息</dt><dd class="positive">+ {{ money(displayedOrder.redeemableInterest) }}</dd></div></dl>
      <p class="vault-confirm-note">提前赎回将停止后续计息。确认后需输入支付密码，费用以最新订单报价为准，最终到账以结算结果为准。</p>
      <label v-if="!pending" class="vault-ack"><input v-model="acknowledged" type="checkbox" :disabled="submitting" /><span>我已核对违约费与预计到账金额</span></label>
    </template>
    <button class="primary full" :disabled="submitting || reading || !!issue || !displayedOrder || (!pending && (!acknowledged || expectedTotal === undefined))" @click="submit">{{ submitting ? '正在处理…' : pending ? '核实赎回结果' : '确认赎回' }}</button>
  </V47VaultDialog>
</template>

<style scoped>
.quote-notice { margin-bottom:20px; flex-wrap:wrap; gap:12px; }
.quote-notice>span { flex:1; min-width:130px; }
.quote-skeleton { height:330px; border-radius:16px; }
</style>
