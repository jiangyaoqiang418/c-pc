<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { formatAmount } from '@shared';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { useUserStore, useWalletStore } from '@/stores';
import * as realOrderApi from '@/service/api/order';
import * as realPurchaseApi from '@/service/api/purchase';
import { fetchBusinessStats, fetchBuyerDepositSummary } from '@/service/api/buyer';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const pendingOrders = ref<Api.RealOrder.Record[]>([]);
const claimable = ref<Api.RealPurchase.Record[]>([]);
const orderCounts = ref<Record<string, number>>({});
const claimableTotal = ref<number>();
const countsLoaded = ref(false);
const businessStats = ref<Api.RealBuyer.BusinessStats>();
const depositSummary = ref<Api.RealBuyer.DepositSummary>();
const loadErrors = reactive({ wallet: '', deposit: '', orders: '', counts: '', claimable: '', stats: '' });
const loadStates = reactive({ wallet: false, deposit: false, orders: false, counts: false, claimable: false, stats: false });
const loading = computed(() => Object.values(loadStates).some(Boolean));
const requestGuard = createLatestRequestGuard();

const user = computed(() => userStore.currentUser);
const account = computed(() => walletStore.account);
const dashboardReady = computed(() => !!user.value);
const loadError = computed(() => Object.values(loadErrors).filter(Boolean).join('；'));

function finiteNonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function loadAll() {
  businessStats.value = undefined;
  depositSummary.value = undefined;
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
    } catch (error) {
      if (isCurrentUser()) loadErrors[key] = key === 'stats' && error instanceof Error ? error.message : message;
    } finally {
      if (isCurrentUser()) loadStates[key] = false;
    }
  }
  await Promise.all([
    section('stats', fetchBusinessStats({}, { signal: isCurrent.signal }), value => {
      if (value === null) return;
      if (String(value.sellerId) !== String(userId)) throw new Error('经营数据归属不符');
      if ([value.reviewRate, value.complaintRate, value.avgShipDurationHours, value.completedOrderCount, value.reviewedOrderCount, value.refundCount]
        .some(item => item === undefined || item === null || String(item).trim() === '' || !Number.isFinite(Number(item)))) throw new Error('经营数据响应不完整，请重新加载');
      businessStats.value = value;
    }, '经营数据读取失败或无权限'),
    section('wallet', walletStore.fetchWallet(userId), () => undefined, '钱包数据加载失败'),
    section('deposit', fetchBuyerDepositSummary({ signal: isCurrent.signal, showError: false }), value => { depositSummary.value = value; }, '保证金数据加载失败'),
    section('orders', realOrderApi.fetchMyOrders({
        shopperId: userId,
        current: 1,
        size: 5,
        statuses: ['PROCURING', 'PROCURED'],
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

const pendingOrderCount = computed(() => sumOrderCounts('PROCURING', 'PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM', 'IN_AFTERSALE'));
const completedOrderCount = computed(() => orderCount('COMPLETED'));
const kpis = computed(() => [
  { label: '采购中', value: orderCount('PROCURING'), icon: 'bag', tab: 'procuring' },
  { label: '待发货', value: orderCount('PROCURED'), icon: 'box', tab: 'pending-shipment' },
  { label: '运输中', value: orderCount('IN_TRANSIT'), icon: 'truck', tab: 'shipping' },
  { label: '已完成', value: completedOrderCount.value, icon: 'check', tab: 'done' }
]);


const shortcuts = [
  { to: '/buyer/products', label: '商品管理', icon: 'bag' },
  { to: '/buyer/orders', label: '买手订单', icon: 'box' },
  { to: '/buyer/claimable', label: '可接求购', icon: 'search' },
  { to: '/buyer/aftersales', label: '售后记录', icon: 'shield' },
  { to: '/buyer/wallet', label: '买手钱包', icon: 'wallet' },
  { to: '/buyer/deposit', label: '押金管理', icon: 'shield' },
  { to: '/buyer/categories/apply', label: '分类申请', icon: 'grid' },
  { to: '/buyer/flash-sales', label: '秒杀报名', icon: 'clock' },
  { to: '/finance', label: '小金库', icon: 'clock' }
];
</script>

<template>
  <div class="dashboard-page shop-container">
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>买手工作台</h1><p>从选品到交付，让每一份期待都有着落。</p></div><button type="button" class="primary" @click="router.push('/buyer/products/create')"><UmIcon name="plus" />发布商品</button></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="alert-row"><span>{{ loadError }}</span><Button class="outline" variant="outline" size="sm" :disabled="loading" @click="loadAll">{{ loading ? '加载中…' : '重新加载' }}</Button></AlertDescription></Alert>
    <template v-if="dashboardReady && user">
      <section class="buyer-hero"><div><span class="eyebrow">CURATE. CONNECT. DELIVER.</span><h2>你好，{{ user.nickname }}。</h2><p>目前有 <b>{{ pendingOrderCount ?? '—' }}</b> 笔进行中订单，<br />也有新的心愿，等你来实现。</p><button type="button" class="gold" @click="router.push('/buyer/orders?tab=procuring')">处理订单<UmIcon name="arrow" /></button></div><div class="buyer-hero-art"><span>U.</span><small>GOOD FINDS<br />START WITH YOU.</small><UmIcon name="bag" /></div></section>
      <div class="buyer-kpis" aria-label="订单概况"><button v-for="metric in kpis" :key="metric.label" type="button" @click="router.push({ path:'/buyer/orders', query:{ tab:metric.tab } })"><UmIcon :name="metric.icon" /><strong>{{ metric.value ?? '—' }}<small>单</small></strong><span>{{ metric.label }}<UmIcon name="arrow" /></span></button></div>
      <p class="buyer-inline-hint">订单概况按当前阶段统计；“—”表示数据尚未读取。</p>
      <div class="buyer-info"><UmIcon name="wallet" /><span>钱包可用余额：{{ account?.available === undefined ? '—' : formatAmount(account.available) }} USDT</span><button type="button" @click="router.push('/buyer/wallet')">查看钱包 →</button></div>
      <section class="buyer-focus-tools"><div class="buyer-section-title"><h2>经营工具</h2><small>常用功能，一步直达</small></div><div class="buyer-tools-grid"><button v-for="item in shortcuts" :key="item.to" type="button" @click="router.push(item.to)"><span><UmIcon :name="item.icon" /></span>{{ item.label }}</button></div></section>
      <section class="buyer-dashboard-grid">
        <div class="paper ongoing"><div class="buyer-section-title"><div><span class="eyebrow">YOUR NEXT STEP</span><h2>今日待办</h2></div><button type="button" @click="router.push('/buyer/orders')">全部订单 →</button></div>
          <button v-for="order in pendingOrders" :key="order.id" type="button" class="buyer-task" @click="router.push({ name:'order-detail', params:{ id:String(order.id) } })"><img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle" @error="setImageFallback" /><span><b>{{ order.productTitle }}</b><small>{{ order.code }} · {{ order.status === 'PROCURING' ? '采购中' : order.status === 'PROCURED' ? '待发货' : '运输中' }}</small></span><UmIcon name="arrow" /></button>
          <div v-if="!pendingOrders.length && loadStates.orders" class="loading-list" aria-busy="true" aria-label="正在加载进行中订单"><Skeleton v-for="n in 2" :key="n" class="order-skeleton" /></div>
          <EmptyState v-else-if="!pendingOrders.length" icon="lucide:inbox" :title="loadErrors.orders || '暂无进行中订单'" :description="loadErrors.orders ? '请稍后重试。' : '去求购大厅查看新的需求'" :action-text="loadErrors.orders ? '重新加载' : '查看求购大厅'" @action="loadErrors.orders ? loadAll() : router.push('/buyer/claimable')" />
        </div>
        <section class="paper buyer-deposit-mini"><span class="eyebrow">DEPOSIT OVERVIEW</span><h2>押金概况</h2><strong>{{ depositSummary?.depositBalance === undefined ? '—' : formatAmount(depositSummary.depositBalance) }}<small>USDT</small></strong><div class="buyer-meter"><i :style="{ width:(depositSummary?.usageRate ?? 0) + '%' }"></i></div><p><span>可退保证金<b>{{ depositSummary?.depositAvailable === undefined ? '—' : formatAmount(depositSummary.depositAvailable) }}</b></span><span>订单占用<b>{{ depositSummary?.depositFrozen === undefined ? '—' : formatAmount(depositSummary.depositFrozen) }}</b></span></p><p v-if="loadErrors.deposit" role="alert">{{ loadErrors.deposit }}</p><button type="button" class="outline full" @click="router.push('/buyer/deposit')">管理押金<UmIcon name="arrow" /></button></section>
      </section>
      <section class="paper buyer-performance"><div class="buyer-section-title"><h2>经营数据</h2><small>全部时间</small></div><div v-if="loadStates.stats" class="performance-grid" aria-busy="true"><Skeleton v-for="n in 6" :key="n" class="metric-skeleton" /></div>
        <div v-else-if="businessStats"><span v-for="item in [
          { label: '评价率', value: businessStats.reviewRate + '%' },
          { label: '客诉率', value: businessStats.complaintRate + '%' },
          { label: '平均发货时长', value: businessStats.avgShipDurationHours + ' 小时' },
          { label: '完成订单', value: businessStats.completedOrderCount },
          { label: '有效评价', value: businessStats.reviewedOrderCount },
          { label: '售后申请', value: businessStats.refundCount }
        ]" :key="item.label"><small>{{ item.label }}</small><b>{{ item.value }}</b></span></div>
        <p v-else class="empty-note">{{ loadErrors.stats || '暂无经营数据' }}</p>
        <details><summary>统计口径</summary><p>评价率按评价/完成时间，客诉率按退款创建/订单创建时间统计；平均发货时长按发货范围内的付款至发货时长统计。</p></details>
      </section>
      <section class="paper demand-section"><div class="buyer-section-title"><div><span class="eyebrow">MAKE A WISH COME TRUE</span><h2>等待你的好眼光</h2></div><button type="button" @click="router.push('/buyer/claimable')">{{ claimableTotal ?? '—' }} 个可接求购 →</button></div>
        <div v-if="claimable.length" class="buyer-demand-mini"><button v-for="request in claimable" :key="request.id" type="button" @click="router.push({ name:'purchase-detail', params:{ id:String(request.id) } })"><img :src="request.evidenceUrls?.[0] || PRODUCT_IMAGE_PLACEHOLDER" :alt="request.productTitle" @error="setImageFallback" /><span><small>{{ request.categoryPath }} · 期望 {{ request.expectedDays }} 天</small><b>{{ request.productTitle }}</b><strong>{{ formatAmount(request.budgetAmount) }} <small>USDT</small></strong></span><UmIcon name="arrow" /></button></div>
        <div v-else-if="loadStates.claimable" class="loading-list" aria-busy="true"><Skeleton v-for="n in 2" :key="n" class="order-skeleton" /></div>
        <EmptyState v-else icon="lucide:handshake" :title="loadErrors.claimable || '暂无可接求购'" :description="loadErrors.claimable ? '请稍后重试。' : '当前暂无可接求购'" :action-text="loadErrors.claimable ? '重新加载' : undefined" @action="loadErrors.claimable && loadAll()" />
      </section>
    </template>
    <EmptyState v-else-if="!loading" icon="lucide:alert-triangle" title="买手资料加载失败" />
  </div>
</template>

<style scoped>
.alert-row { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.buyer-inline-hint { margin-bottom:20px; }
.buyer-kpis > button:disabled { opacity:1; cursor:default; }
.loading-list { display:grid; gap:16px; }
.order-skeleton { height:130px; }
.metric-skeleton { height:80px; }
</style>
