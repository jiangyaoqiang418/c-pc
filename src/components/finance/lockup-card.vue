<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { formatFinanceAmount as formatAmount, formatFinanceRate as formatRate } from './v47-interest-math';
import { formatDateValue, parseDateValue } from '@/utils/date-range';

interface Props {
  order: Api.RealFinance.FinanceOrderVO;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'unlock', order: Api.RealFinance.FinanceOrderVO): void }>();

const router = useRouter();

const meta = computed(() => ({
  HOLDING: { label: '计息中', color: 'purple' },
  SETTLED: { label: '已结算', color: 'green' },
  REDEEMED: { label: '已赎回', color: 'orange' },
  CANCELED: { label: '已取消', color: 'red' }
}[props.order.status] || { label: props.order.statusText || props.order.status, color: 'gray' }));

const startMs = computed(() => parseDateValue(props.order.startAt));
const maturityMs = computed(() => parseDateValue(props.order.maturityAt));
const safeLockDays = computed(() => {
  const days = Number(props.order.lockDays);
  return Number.isFinite(days) && days > 0 ? days : undefined;
});
const daysPassed = computed(() => {
  if (typeof props.order.heldDays === 'number' && Number.isSafeInteger(props.order.heldDays) && props.order.heldDays >= 0) return props.order.heldDays;
  if (startMs.value === undefined) return undefined;
  const end = props.order.status === 'HOLDING' ? Math.min(Date.now(), maturityMs.value ?? Date.now())
    : props.order.status === 'SETTLED' ? maturityMs.value ?? parseDateValue(props.order.settledAt)
      : props.order.status === 'REDEEMED' ? parseDateValue(props.order.redeemedAt) : undefined;
  if (end === undefined || end < startMs.value) return undefined;
  return Math.max(0, Math.floor((end - startMs.value) / 86400_000));
});
const remainingDays = computed(() => {
  const backendValue = Number(props.order.remainingDays);
  if (props.order.remainingDays !== undefined && Number.isFinite(backendValue) && backendValue >= 0) {
    return backendValue;
  }
  return safeLockDays.value === undefined || daysPassed.value === undefined
    ? undefined
    : Math.max(0, safeLockDays.value - daysPassed.value);
});
const progressPct = computed(() => {
  if (props.order.status === 'HOLDING') {
    if (safeLockDays.value === undefined || daysPassed.value === undefined) return 0;
    return Math.min(100, Math.max(0, Math.round((daysPassed.value / safeLockDays.value) * 100)));
  }
  if (props.order.status === 'SETTLED') return 100;
  return 0;
});
const lockDaysLabel = computed(() => safeLockDays.value === undefined ? '—' : String(safeLockDays.value));

function goDetail() {
  router.push({ name: 'finance-lockup-detail', params: { id: String(props.order.id) } });
}


const shownInterest = computed(() => props.order.status === 'HOLDING'
  ? props.order.accruedInterest : props.order.settledInterest ?? props.order.accruedInterest);

</script>

<template>
  <article class="vault-position">
    <div class="vault-position-head"><div><span class="vault-token">₮</span><div><h3>{{ order.productName || '—' }}</h3><small>{{ order.id }} · USDT</small></div></div><span class="vault-status" :class="order.status">{{ order.status === 'HOLDING' && remainingDays === 0 ? '等待自动结算' : meta.label }}</span></div>
    <div class="vault-position-metrics"><span>锁仓本金<strong>{{ formatAmount(order.principal) }} <small>USDT</small></strong></span><span>{{ order.status === 'HOLDING' ? '已累计利息' : '结算利息' }}<strong class="positive">{{ order.status === 'CANCELED' || shownInterest === undefined ? '—' : '+ ' + formatAmount(shownInterest, { decimals: 4 }) }}</strong></span><span>年化快照<strong>{{ formatRate(order.annualRate) }}</strong></span></div>
    <div class="vault-progress-label"><span>已持有 {{ daysPassed ?? '—' }} / {{ lockDaysLabel }} 天</span><b>{{ order.status === 'HOLDING' ? '剩余 ' + (remainingDays ?? '—') + ' 天' : meta.label }}</b></div><div class="vault-progress" role="progressbar" :aria-label="(order.productName || '锁仓') + '持有进度'" :aria-valuenow="daysPassed === undefined ? undefined : progressPct" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: progressPct + '%' }" /></div>
    <div class="vault-position-footer"><small>到期 {{ formatDateValue(order.maturityAt, true) }}</small><div><button v-if="order.canRedeem" class="text-link" @click="$emit('unlock', order)">提前赎回</button><button class="outline" @click="goDetail">查看详情<UmIcon name="arrow" /></button></div></div>
  </article>
</template>

<style scoped>
.vault-position-head>div>div { min-width:0; }
.vault-position h3,.vault-position small,.vault-position strong { overflow-wrap:anywhere; }
@media (max-width:700px) {
  .vault-position-metrics { grid-template-columns:minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,.8fr); }
  .vault-position-metrics > span { min-width:0; }
  .vault-position-metrics strong { white-space:normal; }
}
</style>
