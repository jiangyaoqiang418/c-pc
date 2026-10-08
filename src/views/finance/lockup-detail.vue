<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
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
  <div class="lockup-detail-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="order">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item role="link" tabindex="0" @click="router.push('/finance')" @keydown.enter="router.push('/finance')" @keydown.space.prevent="router.push('/finance')">小金库</a-breadcrumb-item>
          <a-breadcrumb-item role="link" tabindex="0" @click="router.push('/finance/my-lockups')" @keydown.enter="router.push('/finance/my-lockups')" @keydown.space.prevent="router.push('/finance/my-lockups')">我的锁仓</a-breadcrumb-item>
          <a-breadcrumb-item>{{ order.productCode || order.id }}</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="hero-card" :body-style="{ padding: '20px 28px' }" :bordered="false">
          <div class="hero-row">
            <div class="hero-left">
              <a-tag v-if="meta" :color="meta.color" size="large">{{ meta.label }}</a-tag>
              <span class="hero-code">{{ order.productCode || order.id }} · {{ order.productName }}</span>
            </div>
            <div class="hero-right">
              <a-button v-if="order.canRedeem" type="primary" status="danger" @click="openUnlock">
                提前赎回
              </a-button>
              <a-button v-else disabled>{{ order.status === 'SETTLED' ? '已到期，已自动结算' : '当前不可赎回' }}</a-button>
            </div>
          </div>
        </a-card>

        <div class="layout-2col">
          <a-card class="rate-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
            <div class="section-title">利率快照</div>
            <div class="rate-formula">
              <div class="rate-cell">
                <div class="lbl">年化收益率</div>
                <div class="val accent">{{ formatRate(Number(order.annualRate)) }}</div>
              </div>
            </div>
          </a-card>

          <a-card class="detail-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
            <div class="section-title">持仓详情</div>
            <a-descriptions :column="2" :data="[
              { label: '本金', value: 'U ' + formatAmount(order.principal) },
              { label: '预期利息', value: 'U ' + formatAmount(order.expectedInterest) },
              { label: interestLabel, value: actualInterestText },
              { label: '提前赎回违约费', value: order.redeemFee === undefined || order.redeemFee === null ? '待确认' : 'U ' + formatAmount(order.redeemFee) },
              { label: '锁定天数 / 已持有', value: order.lockDays + ' / ' + (daysPassed === undefined ? '待确认' : daysPassed + ' 天') },
              { label: '起息时间', value: formatDateValue(order.startAt) },
              { label: '到期时间', value: formatDateValue(order.maturityAt) },
              { label: '结算/赎回时间', value: formatDateValue(order.settledAt || order.redeemedAt) },
              { label: '赎回原因', value: order.redeemReason || '—' }
            ]" />
          </a-card>
        </div>

        <a-card class="chart-card" :body-style="{ padding: '20px 24px 24px' }" :bordered="false">
          <div class="section-title">理论收益参考</div>
          <InterestCurveChart
            :lockup-days="order.lockDays"
            :effective-rate-pct="Number(order.annualRate) * 100"
            :principal="String(order.principal)"
            :accrued-days="daysPassed"
            :accrued-interest="actualInterest"
            :marker-label="interestLabel"
            :width="720"
            :height="220"
          />
          <div class="chart-hint">{{ chartHint }}</div>
        </a-card>

      </template>

      <EmptyState
        v-else-if="!loading"
        :title="loadError ? '锁仓信息加载失败' : '锁仓订单不存在'"
        :description="loadError || undefined"
        :action-text="loadError ? '重新加载' : '返回列表'"
        @action="handleEmptyAction"
      />
    </a-spin>

    <EarlyUnlockModal
      v-model:visible="unlockModalOpen"
      :order="order"
      :submitting="unlocking"
      :pending="redemptionPending"
      @confirm="confirmUnlock"
    />
  </div>
</template>

<style scoped>
.lockup-detail-page {
  padding-top: 16px;
}
.bread {
  margin-bottom: 12px;
}
.hero-card {
  background: linear-gradient(135deg, var(--yb-primary-soft) 0%, #fff 60%);
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hero-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hero-code {
  font-size: 16px;
  font-weight: 600;
  color: var(--yb-ink);
  font-family: ui-monospace, monospace;
}
.layout-2col {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 16px;
  margin-bottom: 16px;
}
.rate-card,
.detail-card,
.chart-card,
.txn-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--yb-ink);
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.rate-formula {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 16px 0;
  background: var(--yb-primary-soft);
  border-radius: 4px;
}
.rate-cell {
  text-align: center;
}
.rate-cell .lbl {
  font-size: 11px;
  color: var(--yb-muted);
}
.rate-cell .val {
  font-size: 22px;
  font-weight: 700;
  color: var(--yb-ink);
  font-family: ui-monospace, monospace;
  margin-top: 4px;
}
.rate-cell .val.accent {
  color: var(--yb-brand-primary);
}
.rate-cell.highlight {
  background: #fff;
  padding: 4px 16px;
  border-radius: 4px;
}
.op {
  font-size: 20px;
  color: var(--yb-muted);
}
.vip-row {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.vip-row .lbl {
  font-size: 12px;
  color: var(--yb-muted);
}
.chart-card {
  margin-bottom: 16px;
}
.chart-hint {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--yb-muted);
}
.txn-card {
  margin-bottom: 16px;
}
@media (max-width: 900px) {
  .layout-2col { grid-template-columns: 1fr; }
  .chart-card :deep(canvas), .chart-card :deep(svg) { max-width: 100%; height: auto; }
}
@media (max-width: 640px) {
  .hero-row, .hero-left { align-items: flex-start; flex-direction: column; }
  .hero-code { overflow-wrap: anywhere; font-size: 14px; }
  .rate-formula { gap: 6px; padding: 12px 4px; }
  .rate-cell.highlight { padding: 4px 8px; }
  .rate-cell .val { font-size: 17px; }
  .op { font-size: 16px; }
}
</style>
