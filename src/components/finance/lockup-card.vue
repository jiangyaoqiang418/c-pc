<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Icon } from '@iconify/vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { formatAmount, formatRate } from '@shared';
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
  if (startMs.value === undefined) return 0;
  const now = Math.min(Date.now(), maturityMs.value ?? Date.now());
  return Math.max(0, Math.floor((now - startMs.value) / 86400_000));
});
const remainingDays = computed(() => {
  const backendValue = Number(props.order.remainingDays);
  if (props.order.remainingDays !== undefined && Number.isFinite(backendValue) && backendValue >= 0) {
    return backendValue;
  }
  return safeLockDays.value === undefined
    ? undefined
    : Math.max(0, safeLockDays.value - daysPassed.value);
});
const progressPct = computed(() => {
  if (props.order.status === 'HOLDING') {
    if (safeLockDays.value === undefined) return 0;
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

  <div class="lockup-card" role="button" tabindex="0" :aria-label="`打开锁仓 ${order.productCode || order.id}`" @click="goDetail" @keydown.enter.self="goDetail" @keydown.space.prevent.self="goDetail">
    <div class="head"><div class="name-block"><span class="asset-icon"><Icon icon="lucide:lock-keyhole" width="22" /></span><div><h2>{{ order.productName || '—' }}</h2><small class="code">{{ order.productCode || order.id }} · USDT</small></div></div><span class="status" :data-status="order.status">{{ meta.label }}</span></div>
    <div class="metrics"><div><small>锁仓本金</small><strong>{{ formatAmount(order.principal) }} <span>USDT</span></strong></div><div><small>{{ order.status === 'HOLDING' ? '已累计利息' : '结算利息' }}</small><strong class="positive">{{ order.status === 'CANCELED' ? '—' : formatAmount(shownInterest) }} <span>USDT</span></strong></div><div><small>年化快照</small><strong>{{ formatRate(Number(order.annualRate)) }}</strong></div></div>
    <div v-if="order.status === 'HOLDING' || order.status === 'SETTLED'" class="progress"><div class="progress-label"><span>已持有 {{ daysPassed }} / {{ lockDaysLabel }} 天</span><b>{{ order.status === 'HOLDING' ? '剩余 ' + (remainingDays ?? '—') + ' 天' : meta.label }}</b></div><Progress :model-value="progressPct" :aria-label="`锁仓周期进度 ${progressPct}%`" /></div>
    <div class="footer" @click.stop><small>到期 {{ formatDateValue(order.maturityAt, true) }}</small><div class="actions"><Button v-if="order.canRedeem" type="button" variant="ghost" class="danger" @click="$emit('unlock', order)">提前赎回</Button><Button type="button" variant="outline" @click="goDetail">查看详情<Icon icon="lucide:arrow-right" width="15" /></Button></div></div>
  </div>

</template>

<style scoped>

.lockup-card { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:20px; padding:26px; min-width:0; cursor:pointer; transition:transform .2s,box-shadow .2s; }.lockup-card:hover { transform:translateY(-2px); box-shadow:var(--yb-shadow-1); }.lockup-card:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.head { display:flex; gap:16px; justify-content:space-between; align-items:center; }.name-block { display:flex; gap:12px; align-items:center; min-width:0; }.name-block>div { min-width:0; }.asset-icon { padding:12px; border-radius:14px; background:var(--yb-primary-soft); color:var(--yb-brand-primary); display:inline-flex; flex:none; }.name-block h2 { font-size:18px; font-weight:600; margin:0 0 4px; overflow-wrap:anywhere; }.code { color:var(--yb-muted); font-size:12px; font-family:var(--yb-font-mono); overflow-wrap:anywhere; }.status { font-size:12px; color:var(--yb-brand-primary); background:var(--yb-primary-soft); padding:4px 10px; border-radius:999px; flex:none; }.status[data-status='SETTLED'] { color:var(--yb-success); background:var(--yb-success-soft); }.status[data-status='REDEEMED'],.status[data-status='CANCELED'] { color:var(--yb-muted); background:var(--yb-fill); }.metrics { display:grid; grid-template-columns:1.1fr 1.1fr .8fr; gap:20px; margin:24px 0; }.metrics>div { display:flex; flex-direction:column; gap:6px; min-width:0; }.metrics small { font-size:12px; color:var(--yb-muted); }.metrics strong { font-size:21px; font-family:var(--yb-font-mono); font-weight:500; overflow-wrap:anywhere; }.metrics strong span { font-size:11px; color:var(--yb-muted); }.positive { color:var(--yb-brand-primary); }.progress-label { display:flex; gap:12px; justify-content:space-between; font-size:12px; color:var(--yb-muted); margin-bottom:10px; }.progress-label b { font-weight:500; color:var(--yb-brand-primary); }.footer { display:flex; justify-content:space-between; align-items:center; gap:16px; border-top:1px solid var(--yb-hairline); padding-top:20px; margin-top:24px; flex-wrap:wrap; }.footer>small { color:var(--yb-muted); font-size:12px; }.actions { display:flex; gap:10px; }.danger { color:var(--yb-danger); }@media(prefers-reduced-motion:reduce) { .lockup-card { transition:none; }.lockup-card:hover { transform:none; } }

</style>
