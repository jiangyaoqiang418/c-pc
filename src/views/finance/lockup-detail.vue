<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Icon } from '@iconify/vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import DescriptionList from '@/components/common/description-list.vue';
import { financeRedemptionIssue } from '@/service/api/finance';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { formatAmount, formatRate } from '@shared';
import * as financeApi from '@/service/api/finance';
import { requestPayPassword } from '@/utils/pay-password';
import InterestCurveChart from '@/components/finance/interest-curve-chart.vue';
import EarlyUnlockModal from '@/components/finance/early-unlock-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue, parseDateValue } from '@/utils/date-range';
import { financialSubmissionIssue } from '@/utils/financial-submission';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const order = ref<Api.RealFinance.FinanceOrderVO>();
const loading = ref(false);
const loadError = ref('');
const unlockModalOpen = ref(false);
const unlocking = ref(false);
const redemptionPending = ref(false);
const redeemedOrderIds = new Set<string>();
const id = computed(() => String(route.params.id));
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

const meta = computed(() => (order.value ? ({
  HOLDING: { label: '计息中', color: 'purple' }, SETTLED: { label: '已结算', color: 'green' },
  REDEEMED: { label: '已赎回', color: 'orange' }, CANCELED: { label: '已取消', color: 'red' }
}[order.value.status] || { label: order.value.statusText || order.value.status, color: 'gray' }) : undefined));

function knownAmount(value: unknown): value is string | number {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

const daysPassed = computed<number | undefined>(() => {
  const current = order.value;
  if (!current) return undefined;
  if (typeof current.heldDays === 'number' && Number.isSafeInteger(current.heldDays) && current.heldDays >= 0) {
    return current.heldDays;
  }
  const start = parseDateValue(current.startAt);
  if (start === undefined) return undefined;
  const maturity = parseDateValue(current.maturityAt);
  let end: number | undefined;
  if (current.status === 'HOLDING') end = Math.min(Date.now(), maturity ?? Date.now());
  else if (current.status === 'REDEEMED') end = parseDateValue(current.redeemedAt);
  else if (current.status === 'SETTLED') end = maturity ?? parseDateValue(current.settledAt);
  // 已结束但缺少结束时间时不使用当前时间，避免继续累积。
  if (end === undefined || end < start) return undefined;
  return Math.floor((end - start) / 86400_000);
});

const actualInterest = computed(() => {
  const current = order.value;
  if (!current || current.status === 'CANCELED') return undefined;
  const value = current.status === 'HOLDING'
    ? current.accruedInterest
    : current.settledInterest ?? current.accruedInterest;
  return knownAmount(value) ? value : undefined;
});
const interestLabel = computed(() => order.value?.status === 'HOLDING' ? '已累积利息' : '实际结算利息');
const actualInterestText = computed(() => actualInterest.value === undefined
  ? (order.value?.status === 'CANCELED' ? '已取消，不再计息' : '待确认')
  : 'U ' + formatAmount(actualInterest.value));
const chartHint = computed(() => {
  if (order.value?.status === 'CANCELED') return '订单已取消，不展示实际计息点；曲线仅作理论收益参考。';
  if (daysPassed.value === undefined || actualInterest.value === undefined) {
    return '实际持有天数或利息待确认，不展示估算的实际收益点。曲线仅作理论参考，不是每日收益流水。';
  }
  return order.value?.status === 'HOLDING'
    ? '实际点采用后台返回的累计利息；曲线仅作理论参考，不是每日收益流水。'
    : '实际点采用后台返回的结算利息及持有天数，订单结束后不再随当前时间增长；曲线仅作理论参考。';
});

async function load() {
  const isCurrent = requestGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    loading.value = false;
    order.value = undefined;
    loadError.value = '';
    return;
  }
  const requestedId = id.value;
  loading.value = true;
  loadError.value = '';
  try {
    const next = await financeApi.fetchFinanceOrderDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    order.value = redeemedOrderIds.has(String(next.id))
      ? { ...next, canRedeem: false }
      : next;
  } catch {
    if (!isCurrent()) return;
    order.value = undefined;
    loadError.value = '锁仓信息加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  writeVersion += 1;
  order.value = undefined;
  redeemedOrderIds.clear();
  unlocking.value = false;
  unlockModalOpen.value = false;
  void load();
});

function openUnlock() {
  if (!order.value || unlocking.value || redeemedOrderIds.has(String(order.value.id))) return;
  redemptionPending.value = !!financialSubmissionIssue(userStore.currentUser?.id, `finance-redeem:${order.value.id}`);
  unlockModalOpen.value = true;
}

async function confirmUnlock(o: Api.RealFinance.FinanceOrderVO) {
  const orderId = String(o.id);
  if (unlocking.value || redeemedOrderIds.has(orderId)) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && String(order.value?.id) === orderId;
  unlocking.value = true;
  try {
    try {
      const payPassword = await requestPayPassword();
      if (!payPassword || !isCurrentWrite()) return;
      await financeApi.redeemFinanceWithReadback(requestedUserId, o.id, payPassword);
    } catch (error) {
      if (isCurrentWrite()) {
        redemptionPending.value = !!financialSubmissionIssue(requestedUserId, `finance-redeem:${o.id}`);
        Message.error(error instanceof Error ? error.message : '赎回未取得确定结果，请核实后再操作');
      }
      return;
    }
    if (!isCurrentWrite()) return;
    redeemedOrderIds.add(orderId);
    if (order.value && String(order.value.id) === orderId) {
      order.value = { ...order.value, canRedeem: false };
    }
    Message.success('提前赎回成功');
    unlockModalOpen.value = false;
    try {
      await walletStore.refetch();
    } catch {
      if (isCurrentWrite()) Message.warning('赎回已成功，钱包余额刷新失败，请稍后刷新查看');
    }
    if (!isCurrentWrite()) return;
    await load();
  } finally {
    if (operation === writeVersion) unlocking.value = false;
  }
}

function handleEmptyAction() {
  if (loadError.value) {
    load();
    return;
  }
  router.push('/finance/my-lockups');
}



</script>

<template>

  <div class="lockup-detail-page">
    <nav class="bread" aria-label="面包屑"><RouterLink to="/finance">小金库</RouterLink><span>/</span><RouterLink to="/finance/my-lockups">我的锁仓</RouterLink><span>/</span><span>{{ order?.productCode || order?.id || '锁仓详情' }}</span></nav>
    <div v-if="loading" aria-busy="true" aria-label="正在读取锁仓订单"><Skeleton class="hero-skeleton" /><Skeleton class="detail-skeleton" /></div>
    <template v-else-if="order">
      <section class="paper hero-card"><div><span v-if="meta" class="status" :data-status="order.status">{{ meta.label }}</span><h1>{{ order.productName || '—' }}</h1><small class="code">{{ order.productCode || order.id }}</small></div><div class="principal"><small>锁仓本金</small><strong>{{ formatAmount(order.principal) }} <span>USDT</span></strong></div></section>
      <div class="layout">
        <section class="paper main-card"><div class="interest-head"><div><small>{{ interestLabel }}</small><strong>{{ actualInterestText }}</strong></div><div><small>年化快照</small><strong>{{ formatRate(Number(order.annualRate)) }}</strong></div></div>
          <h2>理论收益参考</h2><InterestCurveChart :lockup-days="order.lockDays" :effective-rate-pct="Number(order.annualRate) * 100" :principal="String(order.principal)" :accrued-days="daysPassed" :accrued-interest="actualInterest" :marker-label="interestLabel" :width="720" :height="220" /><p class="hint">{{ chartHint }}</p>
          <div class="divider" /><h2>持仓信息</h2><DescriptionList :columns="2" :items="[{ label: '锁仓周期', value: order.lockDays + ' 天' }, { label: '已持有天数', value: daysPassed === undefined ? '待确认' : daysPassed + ' 天' }, { label: '起息时间', value: formatDateValue(order.startAt) }, { label: '到期时间', value: formatDateValue(order.maturityAt) }, { label: '结算/赎回时间', value: formatDateValue(order.settledAt || order.redeemedAt) }, { label: '赎回原因', value: order.redeemReason || '—' }]" />
        </section>
        <aside class="paper"><h2>这笔锁仓的详情</h2><DescriptionList :columns="1" :items="[{ label: '本金', value: formatAmount(order.principal) + ' USDT' }, { label: '预期利息', value: formatAmount(order.expectedInterest) + ' USDT' }, { label: interestLabel, value: actualInterestText }, { label: '提前赎回违约费', value: order.redeemFee === undefined || order.redeemFee === null ? '待确认' : formatAmount(order.redeemFee) + ' USDT' }, { label: '结算币种', value: 'USDT' }]" />
          <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child><span class="action-wrap" :tabindex="!order.canRedeem ? 0 : undefined"><Button type="button" variant="outline" class="full danger" :disabled="!order.canRedeem || unlocking" @click="openUnlock">{{ unlocking ? '正在处理…' : order.canRedeem ? '查看提前赎回报价' : order.status === 'SETTLED' ? '已到期，已自动结算' : '当前不可赎回' }}</Button></span></TooltipTrigger><TooltipContent v-if="!order.canRedeem || unlocking" class="max-w-80">{{ unlocking ? '正在处理本次赎回，请勿重复提交' : financeRedemptionIssue(order) }}</TooltipContent></Tooltip></TooltipProvider>
          <p class="hint">提前赎回将停止后续计息，费用与到账金额须读取订单最新报价。需要支付密码二次确认。</p>
          <Button variant="link" class="wallet-link" @click="router.push('/wallet')">查看钱包<Icon icon="lucide:arrow-right" width="16" /></Button>
        </aside>
      </div>
    </template>
    <EmptyState v-else :title="loadError ? '锁仓信息加载失败' : '锁仓订单不存在'" :description="loadError || undefined" :action-text="loadError ? '重新加载' : '返回列表'" @action="handleEmptyAction" />
    <EarlyUnlockModal v-model:visible="unlockModalOpen" :order="order" :submitting="unlocking" :pending="redemptionPending" @confirm="confirmUnlock" />
  </div>

</template>

<style scoped>

.lockup-detail-page { padding-bottom:32px; }.bread { display:flex; gap:12px; flex-wrap:wrap; font-size:13px; color:var(--yb-muted); margin-bottom:24px; overflow-wrap:anywhere; }.bread a { color:var(--yb-muted); text-decoration:none; }.bread a:hover { color:var(--yb-brand-primary); }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:22px; padding:28px 32px; }.hero-card { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:24px; }.hero-card h1 { font-size:28px; font-weight:650; margin:10px 0 4px; }.status { display:inline-flex; padding:4px 12px; font-size:12px; border-radius:999px; background:var(--yb-primary-soft); color:var(--yb-brand-primary); }.status[data-status='SETTLED'] { background:var(--yb-success-soft); color:var(--yb-success); }.status[data-status='REDEEMED'],.status[data-status='CANCELED'] { background:var(--yb-fill); color:var(--yb-muted); }.code { font-size:12px; color:var(--yb-muted); font-family:var(--yb-font-mono); overflow-wrap:anywhere; }.principal { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }.principal small { font-size:12px; color:var(--yb-muted); }.principal strong { font-size:34px; font-weight:500; font-family:var(--yb-font-mono); }.principal strong span { font-size:13px; color:var(--yb-muted); }.layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:24px; align-items:start; }.paper h2 { font-size:20px; font-weight:600; margin:0 0 20px; }.interest-head { display:grid; grid-template-columns:1fr 1fr; gap:24px; border-bottom:1px solid var(--yb-hairline); padding-bottom:24px; margin-bottom:28px; }.interest-head>div { display:flex; flex-direction:column; gap:6px; }.interest-head small { font-size:12px; color:var(--yb-muted); }.interest-head strong { font-size:26px; font-weight:500; color:var(--yb-brand-primary); font-family:var(--yb-font-mono); overflow-wrap:anywhere; }.hint { font-size:12px; color:var(--yb-muted); line-height:1.8; margin:16px 0 0; }.divider { height:1px; background:var(--yb-hairline); margin:28px 0; }.layout aside { padding:26px; position:sticky; top:190px; }.layout aside h2 { font-size:18px; }.full,.action-wrap { width:100%; }.action-wrap { display:block; margin-top:24px; }.danger { color:var(--yb-danger); }.wallet-link { padding-left:0; margin-top:10px; }.hero-skeleton { height:160px; border-radius:22px; margin-bottom:24px; }.detail-skeleton { height:600px; border-radius:22px; }

</style>
