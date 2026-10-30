<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import V47VaultHeader from '@/components/finance/v47-vault-header.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { financeRedemptionIssue } from '@/service/api/finance';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { formatFinanceAmount as formatAmount, formatFinanceRate as formatRate, knownFinanceDecimal, simpleFinanceInterest } from '@/components/finance/v47-interest-math';
import * as financeApi from '@/service/api/finance';
import { requestPayPassword } from '@/utils/pay-password';
import InterestCurveChart from '@/components/finance/interest-curve-chart.vue';
import EarlyUnlockModal from '@/components/finance/early-unlock-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue, parseDateValue } from '@/utils/date-range';
import { sumPaymentAmounts } from '@/utils/checkout';
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
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
let writeVersion = 0;

const meta = computed(() => (order.value ? ({
  HOLDING: { label: '计息中', color: 'purple' }, SETTLED: { label: '已结算', color: 'green' },
  REDEEMED: { label: '已赎回', color: 'orange' }, CANCELED: { label: '已取消', color: 'red' }
}[order.value.status] || { label: order.value.statusText || order.value.status, color: 'gray' }) : undefined));

function knownAmount(value: unknown): value is string | number {
  return (typeof value === 'number' || typeof value === 'string') && knownFinanceDecimal(value) !== undefined;
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

const holdingProgress = computed(() => daysPassed.value === undefined || !order.value?.lockDays ? undefined : Math.min(100, Math.max(0, daysPassed.value / order.value.lockDays * 100)));

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
  : '+ ' + formatAmount(actualInterest.value, { decimals: 8 }));
const chartHint = computed(() => {
  if (order.value?.status === 'CANCELED') return '订单已取消，不展示实际计息点；曲线仅作理论收益参考。';
  if (daysPassed.value === undefined || actualInterest.value === undefined) {
    return '实际持有天数或利息待确认，不展示估算的实际收益点。曲线仅作理论参考，不是每日收益流水。';
  }
  return order.value?.status === 'HOLDING'
    ? '实际点采用后台返回的累计利息；曲线仅作理论参考，不是每日收益流水。'
    : '实际点采用后台返回的结算利息及持有天数，订单结束后不再随当前时间增长；曲线仅作理论参考。';
});

const expandLedger = ref(false);
const dailyTheoretical = computed(() => {
  if (!order.value || !knownAmount(order.value.principal) || !knownAmount(order.value.annualRate)) return undefined;
  return simpleFinanceInterest(order.value.principal, order.value.annualRate, 1);
});
const completedDays = computed(() => daysPassed.value === undefined || !order.value || order.value.status === 'CANCELED'
  ? undefined : Math.max(0, Math.min(order.value.lockDays, daysPassed.value)));
const theoreticalLedger = computed(() => {
  const start = parseDateValue(order.value?.startAt);
  if (start === undefined || completedDays.value === undefined || dailyTheoretical.value === undefined || !Number.isSafeInteger(completedDays.value)) return [];
  const count = Math.min(completedDays.value, expandLedger.value ? 90 : 5);
  return Array.from({ length: count }, (_, index) => {
    const day = completedDays.value! - index;
    return { day, date: formatDateValue(start + day * 86400_000, true), interest: dailyTheoretical.value, total: simpleFinanceInterest(order.value!.principal, order.value!.annualRate, day) };
  });
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
watch([() => route.params.id, () => userStore.currentUser?.id, () => userStore.sessionVersion], ([nextId, nextUserId, nextSession], [prevId, prevUserId, prevSession]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId) && nextSession === prevSession) return;
  writeVersion += 1;
  order.value = undefined;
  expandLedger.value = false;
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
      if (!financialSubmissionIssue(requestedUserId, `finance-redeem:${o.id}`)) {
        const latest = await financeApi.fetchFinanceOrderDetail(o.id, { showError:false });
        if (!isCurrentWrite()) return;
        const fields = ['principal', 'redeemFee', 'redeemableInterest'] as const;
        if (String(latest.id) !== String(o.id) || financeApi.financeRedemptionIssue(latest)
          || fields.some(field => sumPaymentAmounts([latest[field] ?? '']) !== sumPaymentAmounts([o[field] ?? '']))) {
          unlockModalOpen.value = false;
          Message.warning('赎回报价或状态已变化，请重新核对后确认');
          await load();
          return;
        }
      }
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
  <div class="vault-workspace">
    <V47VaultHeader section="holdings" />
    <button class="vault-back" @click="router.push('/finance/my-lockups')"><UmIcon name="chevron" />我的锁仓</button>
    <div v-if="loading" aria-busy="true" aria-label="正在读取锁仓订单"><Skeleton class="vault-lockup-skeleton" /><Skeleton class="vault-detail-skeleton" /></div>
    <template v-else-if="order">
      <div class="vault-detail-banner"><div><span v-if="meta" class="vault-status" :class="order.status">{{ meta.label }}</span><h2>{{ order.productName || '—' }}</h2><small>{{ order.id }} · USDT</small></div><div><span>锁仓本金</span><strong>{{ formatAmount(order.principal) }} <small>USDT</small></strong></div></div>
      <div class="vault-lock-layout"><section class="vault-lock-main">
        <div class="vault-interest-head"><span>{{ interestLabel }}<strong>{{ actualInterestText }} <small>USDT</small></strong></span><span>年化快照<strong>{{ formatRate(order.annualRate) }}</strong></span></div>
        <div class="vault-progress-label"><span>已持有 {{ daysPassed ?? '—' }} / {{ order.lockDays }} 天</span><b>{{ order.status === 'HOLDING' ? (order.remainingDays ?? '—') + ' 天后到期' : '计息已结束' }}</b></div><div class="vault-progress" role="progressbar" aria-label="锁仓持有进度" :aria-valuenow="holdingProgress === undefined ? undefined : Math.round(holdingProgress)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: (holdingProgress ?? 0) + '%' }" /></div>
        <ol class="vault-timeline"><li><UmIcon name="check" /><b>开始计息</b><small>{{ formatDateValue(order.startAt, true) }}</small></li><li><UmIcon name="clock" /><b>{{ meta?.label }}</b><small>{{ order.status === 'HOLDING' ? '每日计息，到期到账' : formatDateValue(order.settledAt || order.redeemedAt, true) }}</small></li><li><UmIcon name="wallet" /><b>{{ order.status === 'REDEEMED' ? '赎回到账' : order.status === 'CANCELED' ? '已取消' : '自动结算' }}</b><small>{{ formatDateValue(order.status === 'REDEEMED' ? order.redeemedAt : order.status === 'SETTLED' ? order.settledAt : order.status === 'CANCELED' ? undefined : order.maturityAt, true) }}</small></li></ol>
        <InterestCurveChart :lockup-days="order.lockDays" :annual-rate="order.annualRate" :principal="String(order.principal)" :accrued-days="daysPassed" :accrued-interest="actualInterest" :marker-label="interestLabel" /><p class="vault-formula">{{ chartHint }}</p>
        <section class="vault-production-metadata"><h3>持仓信息</h3><dl class="vault-breakdown"><div><dt>起息时间</dt><dd>{{ formatDateValue(order.startAt) }}</dd></div><div><dt>到期时间</dt><dd>{{ formatDateValue(order.maturityAt) }}</dd></div><div><dt>结算 / 赎回时间</dt><dd>{{ formatDateValue(order.settledAt || order.redeemedAt) }}</dd></div><div v-if="order.redeemReason"><dt>赎回原因</dt><dd>{{ order.redeemReason }}</dd></div></dl></section>
      </section><aside class="vault-lock-aside"><h3>这笔锁仓的详情</h3><dl class="vault-breakdown"><div><dt>每日理论利息</dt><dd>{{ formatAmount(dailyTheoretical, { decimals: 8 }) }}</dd></div><div><dt>到期预期利息</dt><dd>+ {{ formatAmount(order.expectedInterest, { decimals: 4 }) }}</dd></div><div><dt>锁仓周期</dt><dd>{{ order.lockDays }} 天</dd></div><div><dt>结算币种</dt><dd>USDT</dd></div><div><dt>提前赎回违约费</dt><dd>{{ order.redeemFee === undefined || order.redeemFee === null ? '待确认' : formatAmount(order.redeemFee, { decimals: 8 }) }}</dd></div></dl>
        <button v-if="order.canRedeem" class="outline full" :disabled="unlocking" @click="openUnlock">{{ unlocking ? '正在处理…' : '查看提前赎回报价' }}</button>
        <div v-else class="vault-settled"><UmIcon name="check" />{{ order.status === 'SETTLED' ? '到期本金与利息已自动结算' : order.status === 'REDEEMED' ? '本金与净利息已退回余额' : order.status === 'CANCELED' ? '锁仓已取消' : '当前不可提前赎回' }}</div>
        <p v-if="!order.canRedeem && order.status === 'HOLDING'" class="vault-formula">{{ financeRedemptionIssue(order) }}</p><p class="vault-formula">提前赎回将停止后续计息。确认页分别展示本金、利息、违约费与预计到账金额。</p><button class="text-link" @click="router.push('/wallet')">查看钱包<UmIcon name="arrow" /></button>
      </aside></div>
      <section class="vault-ledger"><div class="vault-section-heading"><h3>按日计息明细</h3><small>理论参考 · 非到账流水</small></div><div class="vault-ledger-header"><span>计息日期</span><span>当日利息</span><span>累计计息</span></div><div v-for="row in theoreticalLedger" :key="row.day" class="vault-ledger-row"><span>{{ row.date }}<small>第 {{ row.day }} 天</small></span><b>+ {{ formatAmount(row.interest, { decimals: 4 }) }}</b><span>{{ formatAmount(row.total, { decimals: 4 }) }} USDT</span></div><p v-if="!theoreticalLedger.length" class="vault-formula">{{ completedDays === undefined || dailyTheoretical === undefined ? '持有天数或计息参数尚未确认，暂无法测算明细。' : '尚未完成首个计息日，请稍后查看。' }}</p><button v-if="completedDays !== undefined && completedDays > 5" class="vault-ledger-more" @click="expandLedger = !expandLedger">{{ expandLedger ? '收起明细' : completedDays > 90 ? '展开最近 90 天' : '展开全部 ' + completedDays + ' 天' }}<UmIcon name="chevron" /></button></section>
    </template>
    <EmptyState v-else :title="loadError ? '锁仓信息加载失败' : '未找到这笔资产'" :description="loadError || undefined" :action-text="loadError ? '重新加载' : '返回我的锁仓'" @action="handleEmptyAction" />
    <EarlyUnlockModal v-model:visible="unlockModalOpen" :order="order" :submitting="unlocking" :pending="redemptionPending" @confirm="confirmUnlock" />
  </div>
</template>

<style scoped src="./v47-vault.css"></style>
