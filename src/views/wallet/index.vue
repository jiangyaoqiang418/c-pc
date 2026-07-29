<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount, walletApi } from '@shared';
import BucketCard from '@/components/wallet/bucket-card.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import AssetCompositionChart from '@/components/wallet/asset-composition-chart.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const recentTxns = ref<Api.Wallet.Txn[]>([]);
const today = ref<{ depositIn: string; withdrawOut: string; internalVolume: string }>();
const drawerTxn = ref<Api.Wallet.Txn>();
const drawerOpen = ref(false);

async function loadAll() {
  if (!userStore.currentUser) return;
  await walletStore.fetchWallet(userStore.currentUser.id);
  const r = await walletApi.fetchMyTxns({ userId: userStore.currentUser.id, size: 5 });
  recentTxns.value = r.records;
  today.value = (await import('@shared/mock/data/wallet-txns')).todayAggregates();
}

onMounted(loadAll);
watch(() => userStore.currentAudience, loadAll);
watch(() => userStore.currentUser?.id, loadAll);

import { getUsdtCnyRate } from '@shared/utils/currency';
const cnyRate = getUsdtCnyRate();
const cnyEquiv = computed(() =>
  formatAmount((Number(walletStore.totalAssets) * cnyRate).toFixed(2))
);

const totalAssetsNum = computed(() => Number(walletStore.totalAssets) || 0);

const bucketsWithPct = computed(() =>
  walletStore.bucketsArray.map(b => ({
    ...b,
    pct: totalAssetsNum.value > 0 ? (Number(b.value) / totalAssetsNum.value) * 100 : 0
  }))
);

function openDetail(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="wallet-page">
    <!-- ============ Hero (白底 · BiyaPay 风) ============ -->
    <section class="hero">
      <div class="hero-top">
        <div class="hero-eyebrow">TOTAL ASSETS · USDT</div>
        <div class="hero-total">
          <span class="unit">U</span>
          <span class="num">{{ formatAmount(walletStore.totalAssets) }}</span>
        </div>
        <div class="hero-sub">
          ≈ <span class="cny-num">¥{{ cnyEquiv }}</span>
          <span class="rate-sep">·</span>
          <span class="rate-info">1 USDT = ¥{{ cnyRate.toFixed(2) }}</span>
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
        <div v-if="today" class="hero-today">
          <div class="today-item">
            <span class="dot inbound"></span>
            <span class="today-label">今日入</span>
            <span class="today-val yb-mono">+U {{ formatAmount(today.depositIn) }}</span>
          </div>
          <div class="today-item">
            <span class="dot outbound"></span>
            <span class="today-label">今日出</span>
            <span class="today-val yb-mono">−U {{ formatAmount(today.withdrawOut) }}</span>
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
            :breakdown="walletStore.compositionBreakdown"
            :total-assets="walletStore.totalAssets"
            :size="200"
          />
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
      <EmptyState v-else icon="lucide:receipt" title="暂无交易" description="完成链上充值 / 消费后这里会显示资金动态" />
    </section>

    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.wallet-page {
  padding: 0;
  padding-bottom: 40px;
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
