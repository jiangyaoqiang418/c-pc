<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import BuyerKpiCard from '@/components/buyer/buyer-kpi-card.vue';
import DepositMeter from '@/components/buyer/deposit-meter.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import EmptyState from '@/components/common/empty-state.vue';
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
const userAvatar = computed(() => user.value?.avatar || '');
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
  { label: '待发货', value: orderCount('PROCURED'), icon: 'lucide:package', color: 'var(--yb-gold)' },
  { label: '采购中', value: orderCount('PROCURING'), icon: 'lucide:shopping-cart', color: 'var(--yb-primary)' },
  { label: '运输中', value: orderCount('IN_TRANSIT'), icon: 'lucide:truck', color: 'var(--yb-primary-2)' },
  { label: '已完成', value: completedOrderCount.value, icon: 'lucide:badge-check', color: 'var(--yb-success)' }
]);


const avatarFailed = ref(false);
watch(userAvatar, () => { avatarFailed.value = false; });
const shortcuts = [
  { to: '/buyer/products', label: '商品管理', icon: 'lucide:package' },
  { to: '/buyer/orders', label: '买手订单', icon: 'lucide:clipboard-list' },
  { to: '/buyer/claimable', label: '可接求购', icon: 'lucide:handshake' },
  { to: '/buyer/aftersales', label: '售后记录', icon: 'lucide:rotate-ccw' },
  { to: '/buyer/wallet', label: '买手钱包', icon: 'lucide:wallet' },
  { to: '/finance', label: '小金库', icon: 'lucide:clock' }
];
</script>

<template>
  <div class="dashboard-page shop-container">
    <header class="page-heading"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>买手工作台</h1><p>从选品到交付，让每一份期待都有着落。</p></div><Button @click="router.push('/buyer/products/create')"><Icon icon="lucide:plus" />发布商品</Button></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="alert-row"><span>{{ loadError }}</span><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">{{ loading ? '加载中…' : '重新加载' }}</Button></AlertDescription></Alert>
    <template v-if="dashboardReady && user">
      <section class="studio-hero">
        <div class="hero-content"><span class="eyebrow">CURATE. CONNECT. DELIVER.</span><div class="welcome"><img v-if="userAvatar && !avatarFailed" :src="userAvatar" :alt="user.nickname" @error="avatarFailed = true" /><span v-else class="avatar-letter">{{ user.nickname?.slice(0, 1) || '买' }}</span><h2 :title="user.nickname">你好，{{ user.nickname }}。</h2><VipBadge :level="user.vipLevel" /></div><p>目前有 <strong>{{ pendingOrderCount ?? '—' }}</strong> 笔进行中订单，累计完成 <strong>{{ completedOrderCount ?? '—' }}</strong> 笔。</p><Button class="hero-cta" @click="router.push('/buyer/orders')">处理订单<Icon icon="lucide:arrow-right" /></Button></div>
        <div class="hero-account"><span>钱包可用余额</span><strong>U {{ account?.available === undefined ? '—' : formatAmount(account.available) }}</strong><span>订单占用保证金</span><b>U {{ depositSummary?.depositFrozen === undefined ? '—' : formatAmount(depositSummary.depositFrozen) }}</b></div>
      </section>
      <section class="kpi-grid" aria-label="订单概况"><BuyerKpiCard v-for="metric in kpis" :key="metric.label" :label="metric.label" :value="metric.value ?? '—'" unit="单" :icon="metric.icon" :color="metric.color" /></section>
      <section class="studio-tools"><div class="section-heading"><h2>经营工具</h2><small>常用功能，一步直达</small></div><div class="shortcut-grid"><RouterLink v-for="item in shortcuts" :key="item.to" :to="item.to"><span><Icon :icon="item.icon" /></span>{{ item.label }}</RouterLink></div></section>
      <section class="work-grid">
        <div class="paper ongoing"><div class="section-heading"><div><span class="eyebrow">YOUR NEXT STEP</span><h2>进行中订单</h2></div><Button variant="ghost" size="sm" @click="router.push('/buyer/orders')">全部订单<Icon icon="lucide:arrow-right" /></Button></div>
          <div v-if="pendingOrders.length" class="order-list"><BuyerOrderCard v-for="order in pendingOrders" :key="order.id" :order="order" @upload-shipping="openOrderAction($event, 'shipping')" @manage-logistics="openOrderAction($event, 'logistics')" /></div>
          <div v-else-if="loadStates.orders" class="loading-list" aria-busy="true" aria-label="正在加载进行中订单"><Skeleton v-for="n in 2" :key="n" class="order-skeleton" /></div>
          <EmptyState v-else icon="lucide:inbox" :title="loadErrors.orders || '暂无进行中订单'" :description="loadErrors.orders ? '请稍后重试。' : '去求购大厅查看新的需求'" :action-text="loadErrors.orders ? '重新加载' : '查看求购大厅'" @action="loadErrors.orders ? loadAll() : router.push('/buyer/claimable')" />
        </div>
        <section class="paper deposit-card"><span class="eyebrow">DEPOSIT OVERVIEW</span><h2>押金概况</h2><Skeleton v-if="loadStates.deposit" class="deposit-skeleton" /><DepositMeter v-else :balance="depositSummary?.depositBalance" :available="depositSummary?.depositAvailable" :frozen="depositSummary?.depositFrozen" :usage-rate="depositSummary?.usageRate" size="sm" /><p v-if="loadErrors.deposit" class="helper-error">{{ loadErrors.deposit }}</p><Button variant="outline" class="full" @click="router.push('/buyer/deposit')">管理押金<Icon icon="lucide:arrow-right" /></Button></section>
      </section>
      <section class="paper performance"><div class="section-heading"><h2>经营数据</h2><small>全部时间</small></div><div v-if="loadStates.stats" class="performance-grid" aria-busy="true"><Skeleton v-for="n in 6" :key="n" class="metric-skeleton" /></div>
        <dl v-else-if="businessStats" class="performance-grid"><div v-for="item in [
          { label: '评价率', value: businessStats.reviewRate + '%' },
          { label: '客诉率', value: businessStats.complaintRate + '%' },
          { label: '平均发货时长', value: businessStats.avgShipDurationHours + ' 小时' },
          { label: '完成订单', value: businessStats.completedOrderCount },
          { label: '有效评价', value: businessStats.reviewedOrderCount },
          { label: '售后申请', value: businessStats.refundCount }
        ]" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
        <p v-else class="empty-note">{{ loadErrors.stats || '暂无经营数据' }}</p>
        <details><summary>统计口径</summary><p>评价率按评价/完成时间，客诉率按退款创建/订单创建时间统计；平均发货时长按发货范围内的付款至发货时长统计。</p></details>
      </section>
      <section class="paper demand-section"><div class="section-heading"><div><span class="eyebrow">MAKE A WISH COME TRUE</span><h2>等待你的好眼光</h2></div><Button variant="ghost" size="sm" @click="router.push('/buyer/claimable')">{{ claimableTotal ?? '—' }} 个可接求购<Icon icon="lucide:arrow-right" /></Button></div>
        <div v-if="claimable.length" class="demand-list"><PurchaseRequestCard v-for="request in claimable" :key="request.id" :request="request" mode="hall" :can-claim="false" /></div>
        <div v-else-if="loadStates.claimable" class="loading-list" aria-busy="true"><Skeleton v-for="n in 2" :key="n" class="order-skeleton" /></div>
        <EmptyState v-else icon="lucide:handshake" :title="loadErrors.claimable || '暂无可接求购'" :description="loadErrors.claimable ? '请稍后重试。' : '当前暂无可接求购'" :action-text="loadErrors.claimable ? '重新加载' : undefined" @action="loadErrors.claimable && loadAll()" />
      </section>
    </template>
    <EmptyState v-else-if="!loading" icon="lucide:alert-triangle" title="买手资料加载失败" />
  </div>
</template>

<style scoped>
.dashboard-page { display:grid; gap:24px; }.page-heading,.section-heading,.alert-row { display:flex; justify-content:space-between; align-items:center; gap:18px; }.page-heading h1 { font-size:28px; font-weight:650; margin:8px 0; }.page-heading p { margin:0; color:var(--yb-muted); font-size:13px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.studio-hero { display:flex; justify-content:space-between; gap:28px; align-items:center; padding:36px; border-radius:14px; background:var(--yb-primary); color:var(--primary-foreground); }.studio-hero .eyebrow { color:var(--yb-accent); }.welcome { display:flex; align-items:center; gap:12px; margin:18px 0; min-width:0; }.welcome img,.avatar-letter { width:44px; height:44px; flex-shrink:0; border-radius:50%; }.avatar-letter { display:grid; place-items:center; background:color-mix(in srgb,var(--yb-surface) 16%,transparent); font-size:21px; }.welcome h2 { font-size:28px; line-height:1.5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0; }.hero-content { min-width:0; }.hero-content p { font-size:14px; opacity:.85; margin:0 0 24px; }.hero-cta { background:var(--yb-accent); color:var(--yb-accent-ink); }.hero-cta:hover { background:var(--um-gold-light); }.hero-account { display:grid; gap:10px; padding-left:30px; border-left:1px solid color-mix(in srgb,var(--yb-surface) 20%,transparent); flex-shrink:0; }.hero-account span { font-size:12px; opacity:.7; }.hero-account strong { font-family:var(--yb-font-mono); font-size:28px; }.hero-account b { font-family:var(--yb-font-mono); font-size:19px; }.kpi-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }.studio-tools { padding:12px 0; }.section-heading { margin-bottom:24px; }.section-heading h2,.paper>h2 { font-size:21px; font-weight:600; margin:5px 0 0; }.section-heading small { color:var(--yb-muted); font-size:12px; }.shortcut-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }.shortcut-grid>a { display:grid; justify-items:center; gap:10px; font-size:13px; padding:15px 8px; border-radius:9px; transition:background 200ms var(--um-ease),transform 200ms var(--um-ease); }.shortcut-grid>a>span { display:grid; place-items:center; width:42px; height:42px; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-surface); color:var(--yb-primary); }.shortcut-grid>a>span>svg { width:20px; }.shortcut-grid>a:hover { background:var(--yb-primary-soft); transform:translateY(-2px); }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:12px; padding:28px; min-width:0; }.work-grid { display:grid; grid-template-columns:minmax(0,1.65fr) minmax(260px,1fr); gap:22px; align-items:start; }.order-list,.loading-list,.demand-list { display:grid; gap:16px; }.ongoing { padding:24px; }.ongoing :deep(.buyer-order-card) { padding:18px; }.deposit-card>h2 { margin-bottom:24px; }.deposit-card :deep(.deposit-meter) { flex-direction:column; align-items:stretch; gap:20px; }.deposit-card :deep(.ring) { align-self:center; }.full { width:100%; margin-top:24px; }.performance-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:25px; margin:0; }.performance-grid dt { font-size:12px; color:var(--yb-muted); }.performance-grid dd { font-size:24px; font-weight:550; margin:8px 0 0; }.performance details { margin-top:26px; border-top:1px solid var(--yb-hairline); padding-top:18px; font-size:12px; color:var(--yb-muted); }.performance summary { cursor:pointer; }.performance details p { margin:12px 0 0; line-height:1.9; }.empty-note,.helper-error { color:var(--yb-muted); font-size:13px; }.helper-error { color:var(--yb-danger); }.order-skeleton { height:130px; }.deposit-skeleton { height:230px; }.metric-skeleton { height:70px; }@media(max-width:1150px) { .studio-hero { padding:28px; }.hero-account { padding-left:22px; }.welcome h2 { font-size:24px; }.work-grid { grid-template-columns:1fr; }.deposit-card :deep(.deposit-meter) { flex-direction:row; }.hero-account strong { font-size:23px; }.shortcut-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }@media(max-width:700px) { .studio-hero { display:grid; }.hero-account { border-left:0; border-top:1px solid color-mix(in srgb,var(--yb-surface) 20%,transparent); padding:20px 0 0; }.kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.performance-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.page-heading { align-items:flex-start; }.paper { padding:20px; } }@media(prefers-reduced-motion:reduce) { .shortcut-grid>a { transition:none; }.shortcut-grid>a:hover { transform:none; } }
</style>
