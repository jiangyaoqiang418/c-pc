<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import { avatarUrl } from '@shared/utils/image';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import * as realOrderApi from '@/service/api/order';
import * as realPurchaseApi from '@/service/api/purchase';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const pendingOrders = ref<Api.RealOrder.Record[]>([]);
const claimable = ref<Api.RealPurchase.Record[]>([]);
const orderCounts = ref<Record<string, number>>({});
const claimableTotal = ref<number>();
const countsLoaded = ref(false);
const loadErrors = reactive({ wallet: '', orders: '', counts: '', claimable: '' });
const loadStates = reactive({ wallet: false, orders: false, counts: false, claimable: false });
const loading = computed(() => Object.values(loadStates).some(Boolean));
const requestGuard = createLatestRequestGuard();

const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => (user.value ? avatarUrl(user.value.id) : ''));
const account = computed(() => walletStore.account);
const dashboardReady = computed(() => !!user.value);
const loadError = computed(() => Object.values(loadErrors).filter(Boolean).join('；'));

function finiteNonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function loadAll() {
  const currentUser = user.value;
  if (!currentUser) {
    requestGuard.invalidate();
    pendingOrders.value = [];
    claimable.value = [];
    claimableTotal.value = undefined;
    orderCounts.value = {};
    countsLoaded.value = false;
    Object.keys(loadStates).forEach(key => { loadStates[key as keyof typeof loadStates] = false; });
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  Object.keys(loadStates).forEach(key => { loadStates[key as keyof typeof loadStates] = true; });
  Object.keys(loadErrors).forEach(key => { loadErrors[key as keyof typeof loadErrors] = ''; });
  const isCurrentUser = () => isCurrent() && String(userStore.currentUser?.id) === String(userId);
  async function section<T>(key: keyof typeof loadStates, request: Promise<T>, apply: (value: T) => void, message: string) {
    try {
      const value = await request;
      if (isCurrentUser()) apply(value);
    } catch {
      if (isCurrentUser()) loadErrors[key] = message;
    } finally {
      if (isCurrentUser()) loadStates[key] = false;
    }
  }
  await Promise.all([
    section('wallet', walletStore.fetchWallet(userId), () => undefined, '钱包数据加载失败'),
    section('orders', realOrderApi.fetchMyOrders({
        shopperId: userId,
        current: 1,
        size: 5,
        statuses: ['PROCURING', 'PROCURED', 'IN_TRANSIT'],
        signal: isCurrent.signal
      }), value => { pendingOrders.value = value.records; }, '进行中订单加载失败'),
    section('counts', realOrderApi.countMySoldOrdersByStatus({ signal: isCurrent.signal }), value => {
      orderCounts.value = value;
      countsLoaded.value = true;
    }, '订单统计加载失败'),
    section('claimable', realPurchaseApi.fetchHall({ current: 1, size: 6, signal: isCurrent.signal }), value => {
      claimable.value = value.records.slice(0, 6);
      claimableTotal.value = value.total;
    }, '可接求购加载失败')
  ]);
}

function openOrderAction(order: Api.RealOrder.DisplayRecord, action: 'shipping' | 'logistics') {
  void router.push({ name: 'buyer-orders', query: { action, orderId: String(order.id) } });
}
onMounted(loadAll);
onBeforeUnmount(requestGuard.invalidate);
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  pendingOrders.value = [];
  claimable.value = [];
  claimableTotal.value = undefined;
  orderCounts.value = {};
  countsLoaded.value = false;
  void loadAll();
});

const depositPct = computed(() => {
  const available = finiteNonNegative(account.value?.depositAvailable);
  const guaranteed = finiteNonNegative(account.value?.depositGuaranteed);
  if (available === undefined || guaranteed === undefined) return undefined;
  const total = available + guaranteed;
  return total > 0 ? (guaranteed / total) * 100 : 0;
});
const depositTotal = computed(() => {
  if (!account.value) return '—';
  const available = finiteNonNegative(account.value.depositAvailable);
  const guaranteed = finiteNonNegative(account.value.depositGuaranteed);
  return available === undefined || guaranteed === undefined
    ? '—'
    : formatAmount(available + guaranteed);
});
const depositPctLabel = computed(() => depositPct.value === undefined ? '—' : `${depositPct.value.toFixed(1)}%`);

function orderCount(status: string) {
  if (!countsLoaded.value) return undefined;
  const parsed = finiteNonNegative(orderCounts.value[status]);
  return parsed === undefined ? undefined : Math.floor(parsed);
}

function sumOrderCounts(...statuses: string[]) {
  if (!countsLoaded.value) return undefined;
  const counts = statuses.map(status => orderCount(status));
  if (counts.some(count => count === undefined)) return undefined;
  return counts.filter((count): count is number => count !== undefined)
    .reduce((sum, count) => sum + count, 0);
}

const pendingOrderCount = computed(() => sumOrderCounts('PROCURING', 'PROCURED', 'IN_TRANSIT'));
const completedOrderCount = computed(() => orderCount('COMPLETED'));
const kpis = computed(() => [
  { label: '待发货', value: orderCount('PROCURED'), icon: 'lucide:package', color: '#B8935A' },
  { label: '采购中', value: orderCount('PROCURING'), icon: 'lucide:shopping-cart', color: '#5B5CE7' },
  { label: '运输中', value: orderCount('IN_TRANSIT'), icon: 'lucide:truck', color: '#7C5CFC' },
  { label: '已完成', value: completedOrderCount.value, icon: 'lucide:badge-check', color: '#00A88A' }
]);

</script>

<template>
  <div class="dashboard-page shop-container">
    <a-alert v-if="loadError" type="error" :closable="false" class="load-alert">
      {{ loadError }}。未使用空数据替代失败结果。
      <template #action><a-button size="mini" :loading="loading" @click="loadAll">重新加载</a-button></template>
    </a-alert>

    <template v-if="dashboardReady && user">
      <!-- ============ Hero (深色 accent) ============ -->
      <section class="hero" v-motion :initial="{ opacity: 0, y: 20 }" :enter="{ opacity: 1, y: 0, transition: { duration: 500 } }">
        <div class="hero-glow"></div>
        <div class="hero-left">
          <img :src="userAvatar" :alt="user.nickname" class="hero-avatar" />
          <div>
            <div class="welcome-eyebrow">买手工作台 · BUYER STUDIO</div>
            <div class="welcome-row">
              <h1 class="welcome-name">{{ user.nickname }}</h1>
              <VipBadge :level="user.vipLevel" size="lg" />
            </div>
            <div class="welcome-sub">
              <Icon icon="lucide:check-circle" width="12" />
              累计完成 <span class="yb-mono strong">{{ completedOrderCount ?? '—' }}</span> 笔订单
            </div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="stat">
            <div class="stat-label">进行中</div>
            <div class="stat-val"><span class="num yb-mono">{{ pendingOrderCount ?? '—' }}</span><span class="unit">单</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">可接求购</div>
            <div class="stat-val"><span class="num yb-mono">{{ claimableTotal ?? '—' }}</span><span class="unit">单</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">可用余额</div>
            <div class="stat-val"><span class="num yb-mono">{{ account?.available === undefined ? '—' : formatAmount(account.available) }}</span><span class="unit">U</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">已担保</div>
            <div class="stat-val"><span class="num yb-mono">{{ account?.depositGuaranteed === undefined ? '—' : formatAmount(account.depositGuaranteed) }}</span><span class="unit">U</span></div>
          </div>
        </div>
      </section>

      <!-- ============ KPI grid ============ -->
      <section class="kpi-grid">
        <div v-for="metric in kpis" :key="metric.label" class="real-kpi" :style="{ '--accent': metric.color }">
          <div class="kpi-icon"><Icon :icon="metric.icon" width="18" /></div>
          <div class="kpi-value yb-mono">{{ metric.value ?? '—' }}<span>单</span></div>
          <div class="kpi-label">{{ metric.label }}</div>
        </div>
      </section>

      <!-- ============ 双栏：订单 + 求购 ============ -->
      <section class="split-grid">
        <div class="split-card">
          <div class="split-head">
            <div class="split-title-group">
              <div class="sec-tag primary"><Icon icon="lucide:layers" width="12" /> ORDERS</div>
              <h3 class="split-title">进行中订单</h3>
            </div>
            <button class="text-link" @click="router.push('/buyer/orders')">查看全部 <Icon icon="lucide:arrow-right" width="13" /></button>
          </div>
          <template v-if="pendingOrders.length">
            <BuyerOrderCard v-for="o in pendingOrders" :key="o.id" :order="o"
              @upload-shipping="openOrderAction($event, 'shipping')" @manage-logistics="openOrderAction($event, 'logistics')" />
          </template>
          <div v-else-if="loadStates.orders"><a-spin :loading="true" /> 正在加载进行中订单</div>
          <EmptyState
            v-else
            icon="lucide:inbox"
            :title="loadErrors.orders || '暂无进行中订单'"
            :description="loadErrors.orders ? '不会把请求失败显示成没有订单。' : '去求购大厅接单赚取收益'"
            :action-text="loadErrors.orders ? '重新加载' : undefined"
            @action="loadErrors.orders && loadAll()"
          />
        </div>

        <div class="split-card">
          <div class="split-head">
            <div class="split-title-group">
              <div class="sec-tag gold"><Icon icon="lucide:sparkles" width="12" /> CLAIMABLE</div>
              <h3 class="split-title">可接求购 <span class="count yb-mono">{{ claimableTotal ?? '—' }}</span></h3>
            </div>
            <button class="text-link" @click="router.push('/buyer/claimable')">前往大厅 <Icon icon="lucide:arrow-right" width="13" /></button>
          </div>
          <template v-if="claimable.length">
            <PurchaseRequestCard v-for="r in claimable" :key="r.id" :request="r" mode="hall" :can-claim="false" />
          </template>
          <div v-else-if="loadStates.claimable"><a-spin :loading="true" /> 正在加载可接求购</div>
          <EmptyState
            v-else
            icon="lucide:sparkles"
            :title="loadErrors.claimable || '暂无可接求购'"
            :description="loadErrors.claimable ? '不会把请求失败显示成没有求购。' : '当前暂无可接求购'"
            :action-text="loadErrors.claimable ? '重新加载' : undefined"
            @action="loadErrors.claimable && loadAll()"
          />
        </div>
      </section>

      <!-- ============ 押金 donut ============ -->
      <section class="deposit-card" v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500 } }">
        <div class="deposit-head">
          <div>
            <div class="sec-tag gold"><Icon icon="lucide:coins" width="12" /> DEPOSIT</div>
            <h3 class="split-title">押金概况</h3>
          </div>
          <button class="text-link" @click="router.push('/buyer/deposit')">押金管理 <Icon icon="lucide:arrow-right" width="13" /></button>
        </div>
        <div class="deposit-body">
          <div class="donut-wrap">
            <div class="donut" :style="{ '--pct': (depositPct ?? 0) + '%' }">
              <div class="donut-inner">
                <div class="donut-label">总押金</div>
                <div class="donut-value"><span class="unit">U</span><span class="num yb-mono">{{ depositTotal }}</span></div>
              </div>
            </div>
          </div>
          <div class="deposit-detail">
            <div class="dd-row">
              <div class="dd-key"><span class="dd-dot avail"></span> 可用押金</div>
              <div class="dd-val yb-mono">U {{ account?.depositAvailable === undefined ? '—' : formatAmount(account.depositAvailable) }}</div>
            </div>
            <div class="dd-row">
              <div class="dd-key"><span class="dd-dot lock"></span> 已担保</div>
              <div class="dd-val yb-mono">U {{ account?.depositGuaranteed === undefined ? '—' : formatAmount(account.depositGuaranteed) }}</div>
            </div>
            <div class="dd-row">
              <div class="dd-key">担保占比</div>
              <div class="dd-val yb-mono">{{ account ? depositPctLabel : '—' }}</div>
            </div>
            <div class="deposit-actions">
              <button class="btn primary sm" @click="router.push('/buyer/deposit')">
                <Icon icon="lucide:arrow-down-to-line" width="14" /> 充值
              </button>
              <button class="btn ghost sm" @click="router.push('/buyer/deposit')">
                <Icon icon="lucide:arrow-up-from-line" width="14" /> 转出
              </button>
              <button class="btn ghost sm" @click="router.push('/buyer/deposit')">
                <Icon icon="lucide:list" width="14" /> 流水
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <EmptyState v-else-if="!loading" icon="lucide:alert-triangle" title="买手资料加载失败" />
  </div>
</template>

<style scoped>
.dashboard-page {
  padding-top: 24px;
  padding-bottom: 64px;
}
.load-alert {
  margin-bottom: 16px;
}

/* ========== Hero (dark accent) ========== */
.hero {
  position: relative;
  background: linear-gradient(135deg, #0F1B36 0%, #1E1F3A 60%, #5B5CE7 100%);
  color: #fff;
  border-radius: var(--yb-radius-card);
  padding: 36px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 32px;
  overflow: hidden;
  margin-bottom: 20px;
}
.hero-glow {
  position: absolute;
  top: -30%;
  right: -10%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(184, 147, 90, 0.25) 0%, transparent 60%);
  pointer-events: none;
}
.hero-left {
  position: relative;
  display: flex;
  gap: 20px;
  align-items: center;
}
.hero-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 3px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.welcome-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-gold);
  margin-bottom: 6px;
}
.welcome-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.welcome-name {
  font-family: var(--yb-font-display);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}
.welcome-sub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}
.welcome-sub .strong {
  color: #fff;
  font-weight: 700;
  padding: 0 3px;
}

.hero-stats {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 40px;
}
.stat-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
}
.stat-val {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-val .num {
  font-family: var(--yb-font-mono);
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}
.stat-val .unit {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* ========== KPI grid ========== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}
.real-kpi {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
}
.real-kpi::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--accent);
}
.kpi-icon {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, var(--yb-surface));
  color: var(--accent);
  margin-bottom: 12px;
}
.kpi-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--yb-ink);
  font-variant-numeric: tabular-nums;
}
.kpi-value span {
  font-size: 12px;
  color: var(--yb-muted);
  margin-left: 4px;
}
.kpi-label {
  font-size: 12px;
  color: var(--yb-muted);
  margin-top: 4px;
}

/* ========== Split section ========== */
.split-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.split-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 24px 26px;
}
.split-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
}
.split-title-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sec-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--yb-radius-pill);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  width: fit-content;
}
.sec-tag.primary { background: var(--yb-primary-soft); color: var(--yb-primary); }
.sec-tag.gold { background: var(--yb-champagne); color: var(--yb-gold); }
.split-title {
  font-family: var(--yb-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--yb-ink);
  margin: 0;
}
.count {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 10px;
  background: var(--yb-primary-soft);
  color: var(--yb-primary);
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  font-weight: 700;
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

/* ========== Deposit ========== */
.deposit-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 24px 28px;
}
.deposit-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}
.deposit-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 40px;
  align-items: center;
}
.donut-wrap {
  display: flex;
  justify-content: center;
}
.donut {
  --pct: 0%;
  --size: 200px;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: conic-gradient(var(--yb-gold) 0% var(--pct), var(--yb-primary-soft) var(--pct) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 0 0 40px rgba(184, 147, 90, 0.15);
}
.donut::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: var(--yb-surface);
}
.donut-inner {
  position: relative;
  z-index: 2;
  text-align: center;
}
.donut-label {
  font-size: 11px;
  color: var(--yb-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
}
.donut-value {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}
.donut-value .unit {
  font-family: var(--yb-font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--yb-gold);
}
.donut-value .num {
  font-size: 30px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
}

.deposit-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dd-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--yb-hairline);
}
.dd-row:last-of-type { border-bottom: none; }
.dd-key {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--yb-muted);
}
.dd-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dd-dot.avail { background: var(--yb-primary); }
.dd-dot.lock { background: var(--yb-gold); }
.dd-val {
  font-size: 15px;
  font-weight: 700;
  color: var(--yb-ink);
  font-variant-numeric: tabular-nums;
}
.deposit-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 18px;
  border-radius: var(--yb-radius-pill);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.btn.sm { padding: 8px 14px; font-size: 12px; }
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(91, 92, 231, 0.28);
}
.btn.ghost {
  background: var(--yb-bg);
  color: var(--yb-ink);
  border-color: var(--yb-hairline);
}
.btn.ghost:hover {
  border-color: var(--yb-ink);
}

@media (max-width: 1024px) {
  .hero { flex-direction: column; align-items: flex-start; }
  .hero-stats { grid-template-columns: repeat(2, 1fr); gap: 20px; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .split-grid { grid-template-columns: 1fr; }
  .deposit-body { grid-template-columns: 1fr; gap: 24px; }
}
</style>
