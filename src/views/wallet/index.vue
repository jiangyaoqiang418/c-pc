<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import BucketCard from '@/components/wallet/bucket-card.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import AssetCompositionChart from '@/components/wallet/asset-composition-chart.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const recentTxns = ref<Api.RealWallet.Ledger[]>([]);
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const drawerOpen = ref(false);
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

async function loadAll() {
  const userId = userStore.currentUser?.id;
  if (!userId) {
    requestGuard.invalidate();
    recentTxns.value = [];
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  const [walletResult, ledgerResult] = await Promise.allSettled([
    walletStore.fetchWallet(userId),
    realWalletApi.fetchWalletLedger({ current: 1, size: 5, signal: isCurrent.signal })
  ]);
  if (!isCurrent()) return;
  // 本次流水读取明确失败时不能继续展示上一次快照；钱包与流水独立结算，
  // 因此余额失败但本次流水成功仍保留本次成功结果。
  recentTxns.value = ledgerResult.status === 'fulfilled' ? ledgerResult.value.records : [];
  if (walletResult.status === 'rejected' || ledgerResult.status === 'rejected') {
    loadError.value = '钱包数据加载失败，请检查网络后重试。';
  }
  loading.value = false;
}

onMounted(loadAll);
watch(() => userStore.currentAudience, loadAll);
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  requestGuard.invalidate();
  recentTxns.value = [];
  drawerTxn.value = undefined;
  drawerOpen.value = false;
  loadError.value = '';
  void loadAll();
});
onBeforeUnmount(requestGuard.invalidate);

import { getUsdtCnyRate } from '@shared/utils/currency';
const cnyRate = getUsdtCnyRate();
const cnyEquiv = computed(() =>
  walletStore.account ? formatAmount((Number(walletStore.totalAssets) * cnyRate).toFixed(2)) : '—'
);

const bucketsWithPct = computed(() => walletStore.bucketsWithPct);

function openDetail(t: Api.RealWallet.DisplayLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="wallet-page">
    <a-alert v-if="loadError" type="error" :closable="false" class="load-error">
      {{ loadError }}
      <template #action><a-button size="mini" :loading="loading" @click="loadAll">重新加载</a-button></template>
    </a-alert>
    <a-alert v-if="walletStore.partialData" type="warning" :closable="false" class="load-error">
      部分钱包金额尚未取得，已知金额继续显示；“—”不代表零余额。
      <template #action><a-button size="mini" :loading="loading" @click="loadAll">重新加载</a-button></template>
    </a-alert>
    <!-- ============ Hero (白底 · BiyaPay 风) ============ -->
    <section class="hero">
      <div class="hero-top">
        <div class="hero-eyebrow">TOTAL ASSETS · USDT</div>
        <div class="hero-total">
          <span class="unit">U</span>
          <span class="num">{{ walletStore.account ? formatAmount(walletStore.totalAssets) : '—' }}</span>
        </div>
        <div class="hero-sub">
          ≈ <span class="cny-num">¥{{ cnyEquiv }}</span>
          <span class="rate-sep">·</span>
          <span class="rate-info">本地参考折算 · 1 USDT = ¥{{ cnyRate.toFixed(2) }}（非实时，以 USDT 结算）</span>
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-actions">
          <button class="btn primary" @click="router.push('/wallet/deposit')">
            <Icon icon="lucide:arrow-down-to-line" width="15" /> 链上充值
          </button>
          <button class="btn ghost" @click="router.push('/wallet/withdraw')">
            <Icon icon="lucide:arrow-up-from-line" width="15" /> 转出
          </button>
          <button class="btn ghost" @click="router.push('/wallet/history')">
            <Icon icon="lucide:list" width="15" /> 交易记录
          </button>
        </div>
        <div v-if="walletStore.today" class="hero-today">
          <div class="today-item">
            <span class="dot inbound"></span>
            <span class="today-label">今日入</span>
            <span class="today-val yb-mono">+U {{ formatAmount(walletStore.today.depositIn) }}</span>
          </div>
          <div class="today-item">
            <span class="dot outbound"></span>
            <span class="today-label">今日出</span>
            <span class="today-val yb-mono">−U {{ formatAmount(walletStore.today.withdrawOut) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 资产分布 (Composition + 桶 list) ============ -->
    <section class="dist-section">
      <div class="dist-head">
        <div class="sec-eyebrow">ASSET DISTRIBUTION</div>
        <h3 class="sec-title">资产分布</h3>
      </div>
      <div class="dist-body">
        <div class="dist-chart">
          <AssetCompositionChart
            v-if="walletStore.compositionReady"
            :breakdown="walletStore.compositionBreakdown"
            :total-assets="walletStore.totalAssets"
            :size="200"
          />
          <span v-else>{{ walletStore.loading ? '资产读取中…' : walletStore.account ? '资产分布尚不完整，请重新加载' : '资产暂不可用，请重新加载' }}</span>
        </div>
        <div class="dist-list">
          <BucketCard
            v-for="b in bucketsWithPct"
            :key="b.key"
            :bucket-key="b.key"
            :amount="b.value"
            :pct="b.pct"
            variant="row"
          />
        </div>
      </div>
    </section>

    <!-- ============ 最近交易 ============ -->
    <section class="txn-section">
      <div class="sec-bar">
        <div>
          <div class="sec-eyebrow">RECENT TRANSACTIONS</div>
          <h3 class="sec-title">最近交易</h3>
        </div>
        <button class="text-link" @click="router.push('/wallet/history')">
          查看全部 <Icon icon="lucide:arrow-right" width="12" />
        </button>
      </div>
      <div v-if="recentTxns.length" class="txn-list">
        <TxnRow v-for="t in recentTxns" :key="t.id" :txn="t" @detail="openDetail" />
      </div>
      <EmptyState
        v-else
        icon="lucide:receipt"
        :title="loadError || '暂无交易'"
        :description="loadError ? '未使用本地数据替代失败的真实接口。' : '完成链上充值 / 消费后这里会显示资金动态'"
        :action-text="loadError ? '重新加载' : undefined"
        @action="loadError ? loadAll() : undefined"
      />
    </section>

    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.wallet-page {
  padding: 0;
  padding-bottom: 40px;
}
.load-error {
  margin-bottom: 16px;
}

/* ========== Hero ========== */
.hero {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 32px 40px;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 40px;
  align-items: center;
  margin-bottom: 20px;
}
.hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 12px;
}
.hero-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--yb-ink);
  margin-bottom: 10px;
}
.hero-total .unit {
  font-family: var(--yb-font-mono);
  font-size: 26px;
  font-weight: 600;
  color: var(--yb-muted);
}
.hero-total .num {
  font-family: var(--yb-font-mono);
  font-size: 52px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hero-sub {
  font-size: 14px;
  color: var(--yb-muted);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.cny-num {
  font-family: var(--yb-font-mono);
  font-weight: 600;
  color: var(--yb-ink-2);
  font-variant-numeric: tabular-nums;
}
.rate-sep {
  color: var(--yb-hairline);
}
.rate-info {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  color: var(--yb-faint);
}

.hero-side {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: flex-end;
}
.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  white-space: nowrap;
}
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(91, 92, 231, 0.24);
}
.btn.ghost {
  background: transparent;
  color: var(--yb-ink);
  border-color: var(--yb-hairline-2);
}
.btn.ghost:hover {
  border-color: var(--yb-ink);
  background: var(--yb-bg);
}
.hero-today {
  display: flex;
  gap: 20px;
}
.today-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dot.inbound { background: var(--yb-success); }
.dot.outbound { background: var(--yb-danger); }
.today-label {
  font-size: 11px;
  color: var(--yb-muted);
  letter-spacing: 0.06em;
}
.today-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--yb-ink);
  font-variant-numeric: tabular-nums;
}

/* ========== Sections ========== */
.dist-section,
.txn-section {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 28px 32px;
  margin-bottom: 20px;
}
.sec-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 4px;
}
.sec-title {
  font-family: var(--yb-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--yb-ink);
  margin: 0;
}
.dist-head {
  margin-bottom: 24px;
}
.dist-body {
  display: grid;
  grid-template-columns: 480px 1fr;
  gap: 40px;
  align-items: center;
}
.dist-chart {
  display: flex;
  justify-content: center;
}
.dist-list {
  border-top: 1px solid var(--yb-hairline);
  border-bottom: 1px solid var(--yb-hairline);
}

/* ========== Txn section ========== */
.sec-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}
.txn-list {
  border-top: 1px solid var(--yb-hairline);
}
.text-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--yb-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}
.text-link:hover { color: var(--yb-ink); }

@media (max-width: 1200px) {
  .hero { grid-template-columns: 1fr; }
  .hero-side { align-items: flex-start; }
  .dist-body { grid-template-columns: 1fr; }
}
</style>
