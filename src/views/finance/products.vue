<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import { getUsdtCnyRate } from '@shared/utils/currency';
import * as financeApi from '@/service/api/finance';
import { useUserStore, useWalletStore } from '@/stores';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const products = ref<Api.RealFinance.FinanceProductVO[]>([]);
const overview = ref<Api.RealFinance.FinanceOverviewVO>();
const loading = ref(false);
const loadError = ref('');
const productLoadError = ref(false);
const requestGuard = createLatestRequestGuard();

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    products.value = [];
    overview.value = undefined;
    productLoadError.value = false;
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loading.value = true;
  loadError.value = '';
  productLoadError.value = false;
  try {
    const [productsResult, overviewResult, walletResult] = await Promise.allSettled([
      financeApi.fetchFinanceProducts({ signal: isCurrent.signal, showError: false }),
      financeApi.fetchFinanceOverview({ signal: isCurrent.signal, showError: false }),
      walletStore.fetchWallet(userId)
    ]);
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    if (productsResult.status === 'fulfilled') products.value = productsResult.value;
    productLoadError.value = productsResult.status === 'rejected';
    if (overviewResult.status === 'fulfilled') overview.value = overviewResult.value;
    if ([productsResult, overviewResult, walletResult].some(result => result.status === 'rejected')) {
      loadError.value = '部分小金库数据加载失败，请检查网络后重试。';
    }
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(loadAll);
onBeforeUnmount(requestGuard.invalidate);
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  products.value = [];
  overview.value = undefined;
  void loadAll();
});

const currentBalance = computed(() => walletStore.account?.lockedFinance);
const cnyEquiv = computed(() => currentBalance.value === undefined
  ? '—'
  : formatAmount((Number(currentBalance.value) * getUsdtCnyRate()).toFixed(2)));

const bestApy = computed(() => {
  const rates = products.value
    .map(p => Number(p.annualRate) * 100)
    .filter(rate => Number.isFinite(rate));
  return rates.length ? Math.max(...rates) : 0;
});

const totalAccruedInterest = computed(() => {
  if (!overview.value) return undefined;
  const value = Number(overview.value.pendingInterest || 0);
  return Number.isFinite(value) ? value.toFixed(2) : '—';
});

const availableProducts = computed(() => products.value.filter(p => p.status === 'ON_SALE'));
const featuredProducts = computed(() => availableProducts.value.filter(p => p.lockDays <= 30));
const strategyProducts = computed(() => availableProducts.value.filter(p => p.lockDays > 30));

function effectiveRate(p: Api.RealFinance.FinanceProductVO): string {
  return ((Number(p.annualRate) || 0) * 100).toFixed(2);
}

function productIcon(p: Api.RealFinance.FinanceProductVO): string {
  if (p.lockDays <= 7) return '💧';
  if (p.lockDays <= 30) return '💰';
  if (p.lockDays <= 90) return '🔒';
  return '🏦';
}

function goDetail(p: Api.RealFinance.FinanceProductVO) {
  router.push({ name: 'finance-detail', params: { id: String(p.id) } });
}

function scrollToList() {
  const el = document.querySelector('.list-section');
  el?.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <div class="finance-page">
    <a-alert v-if="loadError" type="error" :closable="false" class="load-alert">
      {{ loadError }}
      <template #action><a-button size="mini" :loading="loading" @click="loadAll">重新加载</a-button></template>
    </a-alert>

    <!-- Hero (Plasma One 极简白) -->
    <section class="earn-hero">
      <div class="hero-eyebrow">EARN BALANCE</div>
      <div class="hero-total">
        <span class="unit">U</span>
        <span class="num">{{ formatAmount(currentBalance) }}</span>
      </div>
      <div class="hero-sub">≈ ¥{{ cnyEquiv }}（本地参考折算，非实时，以 USDT 结算）</div>
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

    <!-- 仅展示后端返回的待结算收益，不生成本地趋势数据 -->
    <section class="chart-card">
      <div class="chart-label">待结算收益</div>
      <div class="chart-amount">
        <span class="unit">U</span>
        <span class="num">{{ formatAmount(totalAccruedInterest) }}</span>
      </div>
    </section>

    <!-- 分区列表 -->
    <a-spin :loading="loading" style="width: 100%">
      <section class="list-section">
        <template v-if="featuredProducts.length">
          <h3 class="sec-title">精选</h3>
          <div class="product-grid">
            <div v-for="p in featuredProducts" :key="p.id" class="ef-card">
              <div class="ef-head" role="button" tabindex="0" @click="goDetail(p)" @keydown.enter="goDetail(p)" @keydown.space.prevent="goDetail(p)">
                <div class="ef-left">
                  <div class="ef-icon-wrap"><span>{{ productIcon(p) }}</span></div>
                  <div class="ef-info">
                    <div class="ef-name">{{ p.name }}</div>
                    <div class="ef-meta">锁定 {{ p.lockDays }} 天 · 起投 U {{ formatAmount(p.minAmount) }}</div>
                  </div>
                </div>
                <div class="ef-right">
                  <div class="ef-apy-row">
                    <span class="ef-apy-label">APY</span>
                    <InfoTooltip text="APY = 后端返回的年化收益率，实际收益以锁仓订单为准" :size="12" />
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
              <div class="ef-head" role="button" tabindex="0" @click="goDetail(p)" @keydown.enter="goDetail(p)" @keydown.space.prevent="goDetail(p)">
                <div class="ef-left">
                  <div class="ef-icon-wrap"><span>{{ productIcon(p) }}</span></div>
                  <div class="ef-info">
                    <div class="ef-name">{{ p.name }}</div>
                    <div class="ef-meta">锁定 {{ p.lockDays }} 天 · 起投 U {{ formatAmount(p.minAmount) }}</div>
                  </div>
                </div>
                <div class="ef-right">
                  <div class="ef-apy-row">
                    <span class="ef-apy-label">APY</span>
                    <InfoTooltip text="APY = 后端返回的年化收益率，实际收益以锁仓订单为准" :size="12" />
                  </div>
                  <div class="ef-apy">{{ effectiveRate(p) }}%</div>
                </div>
              </div>
              <button class="ef-deposit" @click="goDetail(p)">存入</button>
            </div>
          </div>
        </template>

        <EmptyState
          v-if="!featuredProducts.length && !strategyProducts.length && !loading"
          :title="productLoadError ? '小金库产品加载失败' : '暂无可申购产品'"
          :description="productLoadError ? '产品列表请求失败，请检查网络后重试。' : '当前没有上架中的理财产品，请稍后再试'"
          :action-text="productLoadError ? '重新加载' : undefined"
          @action="productLoadError && loadAll()"
        />
      </section>
    </a-spin>
  </div>
</template>

<style scoped>
.finance-page {
  padding: 0;
  padding-bottom: 40px;
}
.load-alert {
  margin-bottom: 16px;
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
.ef-head:focus-visible {
  outline: 2px solid var(--yb-brand-primary, #165dff);
  outline-offset: 4px;
  border-radius: 6px;
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
