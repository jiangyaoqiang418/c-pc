<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();

const list = ref<Api.RealPurchase.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(15);
const loading = ref(false);
const keyword = ref('');
const minBudget = ref<number>();
const maxBudget = ref<number>();
const expDaysFilter = ref<number | undefined>();
const claimingId = ref<string | number>();
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

const canClaim = computed(() => {
  if (!userStore.currentUser) return false;
  return userStore.isBuyerActive;
});

async function load() {
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const r = await purchaseApi.fetchHall({
      current: current.value,
      size: size.value,
      keyword: keyword.value || undefined,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    let records = r.records;
    if (minBudget.value != null) records = records.filter(x => Number(x.budgetAmount) >= minBudget.value!);
    if (maxBudget.value != null) records = records.filter(x => Number(x.budgetAmount) <= maxBudget.value!);
    if (expDaysFilter.value != null) records = records.filter(x => x.expectedDays <= expDaysFilter.value!);
    list.value = records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '求购大厅加载失败，请检查登录状态或网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(load); onBeforeUnmount(requestGuard.invalidate);

async function onClaim(req: Api.RealPurchase.Record) {
  if (claimingId.value !== undefined) return;
  if (!userStore.currentUser) {
    Message.warning('请先登录后再接单');
    router.push({ name: 'login', query: { redirect: '/purchase/hall' } });
    return;
  }
  claimingId.value = req.id;
  try {
    const r = await purchaseApi.claimRequest(req.id);
    if (r.ok) {
      Message.success('接单成功');
      await load();
      router.push({ name: 'purchase-detail', params: { id: String(req.id) } });
    } else {
      Message.error(r.message || '接单失败');
    }
  } catch {
    // 请求层已展示错误，保留当前求购供用户重试。
  } finally {
    claimingId.value = undefined;
  }
}

const CNY_RATE = 7.18;
const totalBudget = computed(() =>
  list.value.reduce((s, x) => s + Number(x.budgetAmount), 0).toFixed(2)
);
const avgBudget = computed(() =>
  list.value.length
    ? (Number(totalBudget.value) / list.value.length).toFixed(2)
    : '0.00'
);
const totalBudgetCny = computed(() =>
  formatAmount((Number(totalBudget.value) * CNY_RATE).toFixed(2))
);

function reset() {
  keyword.value = '';
  minBudget.value = undefined;
  maxBudget.value = undefined;
  expDaysFilter.value = undefined;
  current.value = 1;
  load();
}
</script>

<template>
  <div class="hall-page">
    <!-- ============ Hero (白底) ============ -->
    <section class="hero">
      <div class="hero-main">
        <div class="hero-eyebrow">PURCHASE HALL · REAL-TIME MARKETPLACE</div>
        <h1 class="hero-title">求购大厅</h1>
        <p class="hero-sub">USDT 担保 · 全球买手 24h 内接单 · 三方监管</p>
        <div class="hero-stats">
          <div class="stat">
            <div class="stat-label">进行中</div>
            <div class="stat-value">
              <span class="num">{{ total }}</span>
              <span class="unit">单</span>
            </div>
          </div>
          <div class="stat-divider" />
          <div class="stat">
            <div class="stat-label">悬赏总额</div>
            <div class="stat-value">
              <span class="unit">U</span>
              <span class="num">{{ formatAmount(totalBudget) }}</span>
            </div>
            <div class="stat-hint">≈ ¥{{ totalBudgetCny }}</div>
          </div>
          <div class="stat-divider" />
          <div class="stat">
            <div class="stat-label">平均预算</div>
            <div class="stat-value">
              <span class="unit">U</span>
              <span class="num">{{ formatAmount(avgBudget) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="hero-side">
        <button class="btn primary" @click="router.push('/purchase/create')">
          <Icon icon="lucide:plus" width="15" /> 发起求购
        </button>
        <button class="btn ghost" @click="router.push('/purchase')">
          <Icon icon="lucide:list" width="15" /> 我的求购
        </button>
      </div>
    </section>

    <!-- ============ Filter ============ -->
    <section class="filter">
      <div class="filter-eyebrow">
        <Icon icon="lucide:filter" width="12" />
        <span>FILTER · 筛选条件</span>
      </div>
      <div class="filter-row">
        <div class="fi">
          <label class="fi-label">关键词</label>
          <a-input v-model="keyword" placeholder="搜索商品标题" allow-clear @press-enter="load" />
        </div>
        <div class="fi">
          <label class="fi-label">预算区间 (USDT)</label>
          <div class="fi-range">
            <a-input-number v-model="minBudget" placeholder="最低" :min="0" />
            <span class="sep">—</span>
            <a-input-number v-model="maxBudget" placeholder="最高" :min="0" />
          </div>
        </div>
        <div class="fi">
          <label class="fi-label">期望天数</label>
          <a-select v-model="expDaysFilter" placeholder="不限" allow-clear>
            <a-option :value="7">≤ 7 天</a-option>
            <a-option :value="15">≤ 15 天</a-option>
            <a-option :value="30">≤ 30 天</a-option>
          </a-select>
        </div>
        <div class="fi-actions">
          <button class="btn primary sm" @click="() => { current = 1; load(); }">
            <Icon icon="lucide:search" width="13" /> 查询
          </button>
          <button class="btn ghost sm" @click="reset">重置</button>
        </div>
      </div>
    </section>

    <!-- ============ 非买手提示 ============ -->
    <div v-if="!canClaim && userStore.isLoggedIn" class="notice">
      <div class="notice-icon">
        <Icon icon="lucide:info" width="14" />
      </div>
      <div class="notice-text">
        <strong>仅已审核通过的买手可接单。</strong>
        <span class="notice-hint">
          {{ userStore.canSwitchToBuyer ? '可切换到买手工作台接单' : '提交买手申请并等待平台审核' }}
        </span>
      </div>
      <button class="notice-cta" @click="userStore.canSwitchToBuyer ? router.push('/buyer/dashboard') : router.push('/buyer/apply')">
        {{ userStore.canSwitchToBuyer ? '进入买手工作台' : '申请成为买手' }} <Icon icon="lucide:arrow-right" width="12" />
      </button>
    </div>

    <!-- ============ 求购列表分区 ============ -->
    <div class="deco-title-wrap">
      <div class="deco-title">
        <span class="deco-mark">◆</span>
        <span class="deco-line" />
        <span class="deco-text">求购列表 · LIVE REQUESTS</span>
        <span class="deco-line" />
        <span class="deco-mark">◆</span>
      </div>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="list.length" class="req-grid">
        <PurchaseRequestCard
          v-for="r in list"
          :key="r.id"
          :request="r"
          mode="hall"
          :can-claim="canClaim"
          :claiming="String(claimingId) === String(r.id)"
          @claim="onClaim"
        />
      </div>
      <EmptyState
        v-else
        icon="lucide:inbox"
        :title="loadError || '暂无进行中的求购'"
        :description="loadError ? '不会把请求失败误显示为没有求购。' : '求购任务每 10 分钟刷新一批，请稍后再来'"
        :action-text="loadError ? '重新加载' : undefined"
        @action="load"
      />

      <div v-if="total > size" class="pagination-bar">
        <a-pagination
          :total="total"
          :current="current"
          :page-size="size"
          show-total
          @change="(p: number) => { current = p; load(); }"
        />
      </div>
    </a-spin>
  </div>
</template>

<style scoped>
.hall-page {
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
  grid-template-columns: 1fr auto;
  gap: 40px;
  align-items: center;
  margin-bottom: 16px;
}
.hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 8px;
}
.hero-title {
  font-family: var(--yb-font-display);
  font-size: 32px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}
.hero-sub {
  font-size: 14px;
  color: var(--yb-muted);
  margin: 0 0 20px;
}

.hero-stats {
  display: flex;
  align-items: center;
  gap: 24px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--yb-muted);
  text-transform: uppercase;
}
.stat-value {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  color: var(--yb-ink);
}
.stat-value .unit {
  font-family: var(--yb-font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--yb-muted);
}
.stat-value .num {
  font-family: var(--yb-font-mono);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.stat-hint {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 2px;
}
.stat-divider {
  width: 1px;
  height: 40px;
  background: var(--yb-hairline);
}
.hero-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ========== Buttons ========== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  white-space: nowrap;
}
.btn.sm { padding: 8px 16px; font-size: 12px; }
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

/* ========== Filter ========== */
.filter {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 16px;
}
.filter-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--yb-muted);
  margin-bottom: 14px;
}
.filter-row {
  display: grid;
  grid-template-columns: 1.4fr 1.6fr 1fr auto;
  gap: 16px;
  align-items: flex-end;
}
.fi { display: flex; flex-direction: column; gap: 6px; }
.fi-label {
  font-size: 11px;
  color: var(--yb-muted);
  font-weight: 500;
}
.fi-range {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fi-range :deep(.arco-input-number) { flex: 1; }
.sep { color: var(--yb-faint); font-size: 12px; }
.fi-actions {
  display: flex;
  gap: 8px;
}

/* ========== Notice ========== */
.notice {
  background: var(--yb-champagne);
  border: 1px solid rgba(184, 147, 90, 0.24);
  border-radius: 14px;
  padding: 14px 20px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.notice-icon {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: rgba(184, 147, 90, 0.16);
  color: var(--yb-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.notice-text {
  flex: 1;
  font-size: 13px;
  color: var(--yb-ink-2);
}
.notice-text strong {
  color: var(--yb-ink);
  font-weight: 700;
  margin-right: 6px;
}
.notice-hint {
  color: var(--yb-muted);
}
.notice-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--yb-gold);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.notice-cta:hover {
  background: var(--yb-brand-pink);
}

/* ========== Decorative title ========== */
.deco-title-wrap {
  display: flex;
  justify-content: center;
  margin: 24px 0 16px;
}
.deco-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.deco-mark {
  color: var(--yb-gold);
  font-size: 11px;
}
.deco-line {
  width: 32px;
  height: 1px;
  background: var(--yb-hairline-2);
}
.deco-text {
  font-family: var(--yb-font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--yb-ink);
}

/* ========== Grid ========== */
.req-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.pagination-bar {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

@media (max-width: 1200px) {
  .hero { grid-template-columns: 1fr; }
  .hero-stats { flex-wrap: wrap; }
  .filter-row { grid-template-columns: 1fr 1fr; }
}
</style>
