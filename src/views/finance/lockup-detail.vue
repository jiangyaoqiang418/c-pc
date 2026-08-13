<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { enums, financeApi, formatAmount, formatPoints, formatRate, walletApi } from '@shared';
import InterestCurveChart from '@/components/finance/interest-curve-chart.vue';
import EarlyUnlockModal from '@/components/finance/early-unlock-modal.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const order = ref<Api.FinanceProduct.LockupOrder>();
const relatedTxns = ref<Api.Wallet.Txn[]>([]);
const loading = ref(false);
const loadError = ref('');
const unlockModalOpen = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();
const drawerOpen = ref(false);

const id = computed(() => Number(route.params.id));

const meta = computed(() => (order.value ? enums.LOCKUP_ORDER_STATUS_META[order.value.status] : undefined));

const daysPassed = computed(() => {
  if (!order.value) return 0;
  const start = new Date(order.value.startAt).getTime();
  const now = order.value.unlockedAt ? new Date(order.value.unlockedAt).getTime() : Math.min(Date.now(), new Date(order.value.maturityAt).getTime());
  return Math.max(0, Math.floor((now - start) / 86400_000));
});

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  loadError.value = '';
  try {
    order.value = await financeApi.fetchLockupDetail(id.value);
    if (order.value) {
      const r = await walletApi.fetchMyTxns({ userId: userStore.currentUser.id, refType: 'finance' });
      relatedTxns.value = r.records.filter(t => t.refId === order.value!.code);
    }
  } catch {
    order.value = undefined;
    relatedTxns.value = [];
    loadError.value = '锁仓信息加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);

function openUnlock() {
  if (!order.value) return;
  unlockModalOpen.value = true;
}

async function confirmUnlock(o: Api.FinanceProduct.LockupOrder) {
  try {
    const r = await financeApi.earlyUnlockMock(o.id);
    if (r.ok) {
      Message.success('提前解锁成功');
      unlockModalOpen.value = false;
      await walletStore.refetch();
      await load();
    } else {
      Message.error(r.message || '解锁失败');
    }
  } catch {
    Message.error('解锁失败，请稍后重试');
  }
}

function handleEmptyAction() {
  if (loadError.value) {
    load();
    return;
  }
  router.push('/finance/my-lockups');
}

function openTxnDetail(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="lockup-detail-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="order">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item @click="router.push('/finance')">小金库</a-breadcrumb-item>
          <a-breadcrumb-item @click="router.push('/finance/my-lockups')">我的锁仓</a-breadcrumb-item>
          <a-breadcrumb-item>{{ order.code }}</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="hero-card" :body-style="{ padding: '20px 28px' }" :bordered="false">
          <div class="hero-row">
            <div class="hero-left">
              <a-tag v-if="meta" :color="meta.color" size="large">{{ meta.label }}</a-tag>
              <span class="hero-code">{{ order.code }} · {{ order.productName }}</span>
            </div>
            <div class="hero-right">
              <a-button v-if="order.status === 'active'" type="primary" status="danger" @click="openUnlock">
                提前解锁
              </a-button>
              <a-button v-else disabled>{{ order.status === 'matured' ? '已到期，本金已转入可用余额' : '已结束' }}</a-button>
            </div>
          </div>
        </a-card>

        <div class="layout-2col">
          <a-card class="rate-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
            <div class="section-title">利率快照（订阅时刻冻结）</div>
            <div class="rate-formula">
              <div class="rate-cell">
                <div class="lbl">基准</div>
                <div class="val">{{ order.rate.baseRate }}%</div>
              </div>
              <div class="op">+</div>
              <div class="rate-cell">
                <div class="lbl">VIP 加成</div>
                <div class="val">{{ order.rate.vipBonusRate }}%</div>
              </div>
              <div class="op">=</div>
              <div class="rate-cell highlight">
                <div class="lbl">综合年化</div>
                <div class="val accent">{{ order.rate.effectiveRate }}%</div>
              </div>
            </div>
            <div class="vip-row">
              <span class="lbl">锁仓时刻 VIP</span>
              <VipBadge :level="order.rate.vipLevelAtLock" size="sm" />
            </div>
          </a-card>

          <a-card class="detail-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
            <div class="section-title">持仓详情</div>
            <a-descriptions :column="2" :data="[
              { label: '本金', value: 'U ' + formatAmount(order.principalAmount) },
              { label: '预期利息', value: 'U ' + formatAmount(order.expectedInterest) },
              { label: '已累积利息', value: 'U ' + formatAmount(order.accruedInterest) },
              { label: '损失利息', value: order.forfeitedInterest ? 'U ' + formatAmount(order.forfeitedInterest) : '—' },
              { label: '锁定天数 / 已过', value: order.lockupDays + ' / ' + daysPassed + ' 天' },
              { label: '起息时间', value: new Date(order.startAt).toLocaleString() },
              { label: '到期时间', value: new Date(order.maturityAt).toLocaleString() },
              { label: '解锁时间', value: order.unlockedAt ? new Date(order.unlockedAt).toLocaleString() : '—' },
              { label: '积分奖励', value: '+ ' + formatPoints(order.pointsAccrued) + ' 分' }
            ]" />
          </a-card>
        </div>

        <a-card class="chart-card" :body-style="{ padding: '20px 24px 24px' }" :bordered="false">
          <div class="section-title">利息累积曲线</div>
          <InterestCurveChart
            :lockup-days="order.lockupDays"
            :effective-rate-pct="Number(order.rate.effectiveRate)"
            :principal="order.principalAmount"
            :accrued-days="daysPassed"
            :width="720"
            :height="220"
          />
          <div class="chart-hint">{{ formatRate(Number(order.rate.effectiveRate) / 100) }} 年化 · 本金 U {{ formatAmount(order.principalAmount) }}</div>
        </a-card>

        <a-card class="txn-card" :body-style="{ padding: '20px 24px 0' }" :bordered="false">
          <div class="section-title">派息 / 锁定 / 解锁 流水</div>
          <template v-if="relatedTxns.length">
            <TxnRow v-for="t in relatedTxns" :key="t.id" :txn="t" @detail="openTxnDetail" />
          </template>
          <EmptyState v-else title="暂无关联流水" />
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

    <EarlyUnlockModal v-model:visible="unlockModalOpen" :order="order" @confirm="confirmUnlock" />
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
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
  background: linear-gradient(135deg, #f5e8ff 0%, #fff 60%);
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
  color: #1d2129;
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
  color: #1d2129;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.rate-formula {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 16px 0;
  background: #faf5ff;
  border-radius: 4px;
}
.rate-cell {
  text-align: center;
}
.rate-cell .lbl {
  font-size: 11px;
  color: #86909c;
}
.rate-cell .val {
  font-size: 22px;
  font-weight: 700;
  color: #1d2129;
  font-family: ui-monospace, monospace;
  margin-top: 4px;
}
.rate-cell .val.accent {
  color: #722ed1;
}
.rate-cell.highlight {
  background: #fff;
  padding: 4px 16px;
  border-radius: 4px;
}
.op {
  font-size: 20px;
  color: #86909c;
}
.vip-row {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.vip-row .lbl {
  font-size: 12px;
  color: #86909c;
}
.chart-card {
  margin-bottom: 16px;
}
.chart-hint {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  color: #86909c;
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
