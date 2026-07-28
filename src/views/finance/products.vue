<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { financeApi, formatAmount, vipApi } from '@shared';
import { getUsdtCnyRate } from '@shared/utils/currency';
import { useUserStore, useWalletStore } from '@/stores';
import InfoTooltip from '@/components/common/info-tooltip.vue';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const products = ref<Api.FinanceProduct.ProductRecord[]>([]);
const myLockups = ref<Api.FinanceProduct.LockupOrder[]>([]);
const vipStatus = ref<Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>>();
const loading = ref(false);
const range = ref<'day' | 'week' | 'month' | 'year'>('year');

async function loadAll() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const [list, mineRes, vip] = await Promise.all([
      financeApi.fetchFinanceProducts(),
      financeApi.fetchMyLockups(userStore.currentUser.id, 'active'),
      vipApi.fetchMyVipStatus(userStore.currentUser.id)
    ]);
    products.value = list;
    myLockups.value = mineRes.records;
    vipStatus.value = vip;
    await walletStore.fetchWallet(userStore.currentUser.id);
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

const vipBonusRate = computed(() => {
  const cfg = vipStatus.value?.config;
  if (!cfg || vipStatus.value?.audience !== 'customer') return 0;
  return Number(cfg.customerBenefits?.interestRateBonus || 0);
});

const currentBalance = computed(() => walletStore.account?.lockedFinance || '0');
const cnyEquiv = computed(() => formatAmount((Number(currentBalance.value) * getUsdtCnyRate()).toFixed(2)));

const bestApy = computed(() => {
  if (!products.value.length) return 0;
  return Math.max(...products.value.map(p => Number(p.baseRate) + vipBonusRate.value));
});

const totalAccruedInterest = computed(() =>
  myLockups.value.reduce((s, o) => s + Number(o.accruedInterest || 0), 0).toFixed(2)
);

const featuredProducts = computed(() => products.value.filter(p => p.lockupDays <= 30));
const strategyProducts = computed(() => products.value.filter(p => p.lockupDays > 30));

const bars = computed(() => {
  const count = range.value === 'day' ? 6 : range.value === 'week' ? 12 : range.value === 'month' ? 20 : 24;
  const arr: number[] = [];
  for (let i = 0; i < count; i++) {
    const growth = Math.pow(1.12, i);
    const noise = 0.9 + ((i * 7) % 20) / 100;
    arr.push(growth * noise);
  }
  const max = Math.max(...arr);
  return arr.map(v => Math.max(8, (v / max) * 100));
});

function effectiveRate(p: Api.FinanceProduct.ProductRecord): string {
  return ((Number(p.baseRate) || 0) + vipBonusRate.value).toFixed(2);
}

function productIcon(p: Api.FinanceProduct.ProductRecord): string {
  if (p.lockupDays <= 7) return '💧';
  if (p.lockupDays <= 30) return '💰';
  if (p.lockupDays <= 90) return '🔒';
  return '🏦';
}

function goDetail(p: Api.FinanceProduct.ProductRecord) {
  router.push({ name: 'finance-detail', params: { id: String(p.id) } });
}

function scrollToList() {
  const el = document.querySelector('.list-section');
  el?.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <div class="finance-page">
    <!-- Hero (Plasma One 极简白) -->
    <section class="earn-hero">
      <div class="hero-eyebrow">EARN BALANCE</div>
      <div class="hero-total">
        <span class="unit">U</span>
        <span class="num">{{ formatAmount(currentBalance) }}</span>
      </div>
      <div class="hero-sub">≈ ¥{{ cnyEquiv }}</div>
      <div v-if="bestApy > 0" class="apy-badge">
        <span class="apy-icon">▁▂▃▄</span>
        <span class="apy-num">{{ bestApy.toFixed(2) }}% APY</span>
      </div>
      <div class="hero-actions">
        <button class="action-btn primary" @click="scrollToList">
          <Icon icon="lucide:arrow-down-to-line" width="14" /> 存入
        </button>
        <button class="action-btn" @click="router.push('/finance/my-lockups')">
          <Icon icon="lucide:arrow-up-from-line" width="14" /> 取出
        </button>
      </div>
    </section>

    <!-- Earn Chart -->
    <section class="chart-card">
      <div class="chart-label">You're earning</div>
      <div class="chart-amount">
        <span class="unit">U</span>
        <span class="num">{{ formatAmount(totalAccruedInterest) }}</span>
      </div>
      <div class="bars">
        <span
          v-for="(h, idx) in bars"
          :key="idx"
          class="bar"
          :style="{ height: `${h}%` }"
        />
      </div>
      <div class="range-tabs">
        <button
          v-for="opt in [
            { key: 'day', label: 'Day' },
            { key: 'week', label: 'Week' },
            { key: 'month', label: 'Month' },
            { key: 'year', label: 'Year' }
          ]"
          :key="opt.key"
          class="range-tab"
          :class="{ active: range === opt.key }"
          @click="range = opt.key as any"
        >
          {{ opt.label }}
        </button>
      </div>
    </section>

    <!-- 分区列表 -->
    <a-spin :loading="loading" style="width: 100%">
      <section class="list-section">
        <template v-if="featuredProducts.length">
          <h3 class="sec-title">精选</h3>
          <div class="product-grid">
            <div v-for="p in featuredProducts" :key="p.id" class="ef-card">
              <div class="ef-head" @click="goDetail(p)">
                <div class="ef-left">
                  <div class="ef-icon-wrap"><span>{{ productIcon(p) }}</span></div>
                  <div class="ef-info">
                    <div class="ef-name">{{ p.name }}</div>
                    <div class="ef-meta">锁定 {{ p.lockupDays }} 天 · 起投 U {{ formatAmount(p.minAmount) }}</div>
                  </div>
                </div>
                <div class="ef-right">
                  <div class="ef-apy-row">
                    <span class="ef-apy-label">APY</span>
                    <InfoTooltip text="APY = 年化收益率。含基准 + VIP 加成，日结到不可提现桶" :size="12" />
                  </div>
                  <div class="ef-apy">{{ effectiveRate(p) }}%</div>
                </div>
              </div>
              <button class="ef-deposit" @click="goDetail(p)">存入</button>
            </div>
          </div>
        </template>

        <template v-if="strategyProducts.length">
          <h3 class="sec-title">策略金库</h3>
          <div class="product-grid">
            <div v-for="p in strategyProducts" :key="p.id" class="ef-card">
              <div class="ef-head" @click="goDetail(p)">
                <div class="ef-left">
                  <div class="ef-icon-wrap"><span>{{ productIcon(p) }}</span></div>
                  <div class="ef-info">
                    <div class="ef-name">{{ p.name }}</div>
                    <div class="ef-meta">锁定 {{ p.lockupDays }} 天 · 起投 U {{ formatAmount(p.minAmount) }}</div>
                  </div>
                </div>
                <div class="ef-right">
                  <div class="ef-apy-row">
                    <span class="ef-apy-label">APY</span>
                    <InfoTooltip text="APY = 年化收益率。含基准 + VIP 加成，日结到不可提现桶" :size="12" />
                  </div>
                  <div class="ef-apy">{{ effectiveRate(p) }}%</div>
                </div>
              </div>
              <button class="ef-deposit" @click="goDetail(p)">存入</button>
            </div>
          </div>
        </template>
      </section>
    </a-spin>
  </div>
</template>

<style scoped>
.finance-page {
  padding: 0;
  padding-bottom: 40px;
}

/* Hero */
.earn-hero {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 40px 32px;
  margin-bottom: 20px;
  text-align: center;
}
.hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 16px;
}
.hero-total {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  color: var(--yb-ink);
  margin-bottom: 8px;
}
.hero-total .unit {
  font-family: var(--yb-font-mono);
  font-size: 32px;
  font-weight: 600;
  color: var(--yb-muted);
}
.hero-total .num {
  font-family: var(--yb-font-mono);
  font-size: 64px;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hero-sub {
  font-family: var(--yb-font-mono);
  font-size: 15px;
  color: var(--yb-muted);
  margin-bottom: 20px;
  font-variant-numeric: tabular-nums;
}
.apy-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(0, 168, 138, 0.10);
  border-radius: 999px;
  margin-bottom: 24px;
}
.apy-icon {
  color: #00A88A;
  font-size: 12px;
  letter-spacing: 2px;
}
.apy-num {
  color: #00A88A;
  font-family: var(--yb-font-mono);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.hero-actions {
  display: inline-flex;
  gap: 12px;
  margin: 0 auto;
}
.action-btn {
  min-width: 160px;
  height: 48px;
  padding: 0 28px;
  border-radius: 999px;
  border: 1px solid var(--yb-hairline-2);
  background: var(--yb-surface);
  color: var(--yb-ink);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.action-btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
  border-color: var(--yb-brand-pink);
}
.action-btn:hover {
  transform: translateY(-1px);
}

/* Chart card */
.chart-card {
  background: linear-gradient(180deg, #F0FDF7 0%, #FFFFFF 50%);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 28px 32px;
  margin-bottom: 20px;
}
.chart-label {
  font-size: 13px;
  color: var(--yb-muted);
  margin-bottom: 6px;
}
.chart-amount {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 20px;
}
.chart-amount .unit {
  font-family: var(--yb-font-mono);
  font-size: 20px;
  font-weight: 600;
  color: var(--yb-muted);
}
.chart-amount .num {
  font-family: var(--yb-font-mono);
  font-size: 36px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 140px;
  margin-bottom: 20px;
}
.bar {
  flex: 1;
  background: linear-gradient(180deg, #00A88A 0%, #4FE0B7 100%);
  border-radius: 3px 3px 0 0;
  min-height: 8px;
}
.range-tabs {
  display: flex;
  gap: 4px;
  background: var(--yb-bg);
  border-radius: 999px;
  padding: 4px;
}
.range-tab {
  flex: 1;
  height: 34px;
  background: transparent;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  color: var(--yb-muted);
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}
.range-tab.active {
  background: #fff;
  color: var(--yb-ink);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 17, 26, 0.06);
}

/* Sections */
.list-section {
  padding: 0;
}
.sec-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--yb-muted);
  letter-spacing: 0.14em;
  margin: 24px 4px 12px;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

/* ether.fi 卡片 */
.ef-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: all 0.15s;
}
.ef-card:hover {
  border-color: var(--yb-hairline-2);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(15, 17, 26, 0.06);
}
.ef-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  cursor: pointer;
}
.ef-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.ef-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--yb-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.ef-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ef-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.01em;
}
.ef-meta {
  font-size: 11px;
  color: var(--yb-muted);
}
.ef-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.ef-apy-row {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 700;
  color: var(--yb-muted);
  letter-spacing: 0.1em;
}
.ef-apy {
  font-family: var(--yb-font-mono);
  font-size: 22px;
  font-weight: 700;
  color: #00A88A;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ef-deposit {
  background: transparent;
  color: var(--yb-gold);
  border: 1.5px solid var(--yb-gold);
  border-radius: 999px;
  padding: 12px 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
  width: 100%;
}
.ef-deposit:hover {
  background: var(--yb-gold);
  color: #fff;
}
</style>
