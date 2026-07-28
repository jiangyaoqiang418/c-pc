<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount, walletApi } from '@shared';
import BucketCard from '@/components/wallet/bucket-card.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const txns = ref<Api.Wallet.Txn[]>([]);
const loading = ref(false);
const drawerOpen = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();

async function loadAll() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    await walletStore.fetchWallet(userStore.currentUser.id);
    const r = await walletApi.fetchMyTxns({
      userId: userStore.currentUser.id,
      types: ['DEPOSIT_PLEDGE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT', 'ORDER_SETTLE', 'INTEREST_ACCRUE'],
      size: 30
    });
    txns.value = r.records;
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);
watch(() => userStore.currentAudience, loadAll);

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

function openTxn(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="bw-page">
    <!-- ============ Hero (统一白 · 金色徽章区分买手身份) ============ -->
    <section class="hero">
      <div class="hero-top">
        <div class="hero-eyebrow-row">
          <span class="hero-eyebrow">TOTAL ASSETS · USDT</span>
          <span class="buyer-badge">
            <Icon icon="lucide:store" width="11" /> 买手钱包
          </span>
        </div>
        <div class="hero-total">
          <span class="unit">U</span>
          <span class="num">{{ formatAmount(walletStore.totalAssets) }}</span>
        </div>
        <div class="hero-sub">
          ≈ <span class="cny-num">¥{{ cnyEquiv }}</span>
          <span class="rate-sep">·</span>
          <span class="rate-info">1 USDT = ¥{{ cnyRate.toFixed(2) }}</span>
        </div>
        <div class="hero-note">含押金 · 钱包 · 冻结 · 利息</div>
      </div>
      <div class="hero-side">
        <div class="hero-actions">
          <button class="btn primary" @click="router.push('/wallet/deposit')">
            <Icon icon="lucide:arrow-down-to-line" width="15" /> 链上充值
          </button>
          <button class="btn ghost" @click="router.push('/wallet/withdraw')">
            <Icon icon="lucide:arrow-up-from-line" width="15" /> 转出
          </button>
          <button class="btn ghost" @click="router.push('/buyer/deposit')">
            <Icon icon="lucide:lock" width="15" /> 押金管理
          </button>
        </div>
      </div>
    </section>

    <!-- ============ 桶明细 ============ -->
    <section class="dist-section">
      <div class="dist-head">
        <div class="sec-eyebrow">ASSET BUCKETS · BUYER</div>
        <h3 class="sec-title">资产桶（买手视角）</h3>
      </div>
      <div class="bucket-list">
        <BucketCard
          v-for="b in bucketsWithPct"
          :key="b.key"
          :bucket-key="b.key"
          :amount="b.value"
          :pct="b.pct"
          variant="row"
        />
      </div>
    </section>

    <!-- ============ 买手专属流水 ============ -->
    <section class="txn-section">
      <div class="sec-bar">
        <div>
          <div class="sec-eyebrow">BUYER TRANSACTIONS</div>
          <h3 class="sec-title">买手专属流水（押金 / 接单结算 / 利息）</h3>
        </div>
      </div>
      <a-spin :loading="loading" style="width: 100%">
        <div v-if="txns.length" class="txn-list">
          <TxnRow v-for="t in txns" :key="t.id" :txn="t" @detail="openTxn" />
        </div>
        <EmptyState v-else icon="lucide:receipt" title="暂无买手专属流水" description="接单完成 / 押金变动 / 利息发放后这里会显示" />
      </a-spin>
    </section>

    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.bw-page {
  padding: 0;
  padding-bottom: 40px;
}

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
.hero-eyebrow-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
}
.buyer-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: var(--yb-champagne);
  color: var(--yb-gold);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
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
.rate-sep { color: var(--yb-hairline); }
.rate-info {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  color: var(--yb-faint);
}
.hero-note {
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 8px;
  letter-spacing: 0.06em;
}

.hero-side {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
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
.dist-head, .sec-bar {
  margin-bottom: 20px;
}
.bucket-list, .txn-list {
  border-top: 1px solid var(--yb-hairline);
  border-bottom: 1px solid var(--yb-hairline);
}

@media (max-width: 1200px) {
  .hero { grid-template-columns: 1fr; }
  .hero-side { align-items: flex-start; justify-content: flex-start; }
}
</style>
