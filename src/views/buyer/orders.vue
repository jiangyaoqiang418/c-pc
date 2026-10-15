<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import UmIcon from '@/components/common/um-icon.vue';
import AmountInput from '@/components/common/amount-input.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import ShippingUploadModal from '@/components/buyer/shipping-upload-modal.vue';
import LogisticsManageModal from '@/components/buyer/logistics-manage-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as realOrderApi from '@/service/api/order';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.Order.OrderStatus[];
  unavailable?: boolean;
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending-payment', label: '待付款', statuses: ['PENDING_PAYMENT'] },
  { key: 'procuring', label: '采购中', statuses: ['PROCURING'] },
  { key: 'pending-shipment', label: '待发货', unavailable: true },
  { key: 'shipping', label: '运输中', statuses: ['IN_TRANSIT', 'AFTERSALE_CONFIRM'] },
  { key: 'done', label: '已完成', statuses: ['COMPLETED', 'WARRANTY', 'ARCHIVED'] },
  { key: 'aftersale-confirm', label: '售后确认', unavailable: true },
  { key: 'cancelled', label: '已取消', statuses: ['CANCELLED'] }
];

const activeKey = ref('all');
const orders = ref<Api.RealOrder.Record[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const size = ref(10);
const total = ref(0);
const priceModalOpen = ref(false);
const priceSubmitting = ref(false);
const priceOrder = ref<Api.RealOrder.Record>();
const priceAmount = ref<number>();
const shippingModalOpen = ref(false);
const shippingSubmitting = ref(false);
const shippingOrder = ref<Api.RealOrder.Record>();
const logisticsModalOpen = ref(false);
const logisticsSubmitting = ref(false);
const logisticsOrder = ref<Api.RealOrder.Record>();
const requestGuard = createLatestRequestGuard();
const actionGuard = createLatestRequestGuard();
let logisticsWriteVersion = 0;
let shippingWriteVersion = 0;
let priceWriteVersion = 0;
let shippingModalVersion = 0;
let logisticsModalVersion = 0;
watch(shippingModalOpen, () => { shippingModalVersion += 1; }, { flush: 'sync' });
watch(logisticsModalOpen, () => { logisticsModalVersion += 1; }, { flush: 'sync' });

function syncFromQuery() {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  const matchedTab = TABS.some(item => item.key === tab);
  activeKey.value = matchedTab ? String(tab) : 'all';
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = Number(rawPage);
  current.value = Number.isInteger(page) && page > 0 ? page : 1;
  return route.query.tab !== undefined && (!matchedTab || Array.isArray(route.query.tab));
}

function currentQuery() {
  return {
    ...(activeKey.value !== 'all' ? { tab: activeKey.value } : {}),
    ...(current.value > 1 ? { page: String(current.value) } : {})
  };
}

function syncQuery() {
  const before = route.fullPath;
  void router.push({ query: currentQuery() }).then(() => {
    if (route.fullPath === before) void load();
  });
}

async function load() {
  const isCurrent = requestGuard.begin();
  const user = userStore.currentUser;
  if (!user) {
    loading.value = false;
    orders.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    if (tab?.unavailable) {
      orders.value = [];
      total.value = 0;
      loadError.value = '当前接口尚未提供独立' + tab.label + '阶段，请查看其他订单状态。';
      return;
    }
    const r = await realOrderApi.fetchMyOrders({
      shopperId: user.id,
      current: current.value,
      size: size.value,
      statuses: tab?.statuses,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      void router.replace({ query: currentQuery() });
      return;
    }
    orders.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    orders.value = [];
    total.value = 0;
    loadError.value = '买手订单加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(() => {
  if (syncFromQuery()) void router.replace({ query: currentQuery() });
  void load();
});
onBeforeUnmount(() => {
  actionGuard.invalidate();
  logisticsWriteVersion += 1;
  shippingWriteVersion += 1;
  priceWriteVersion += 1;
  requestGuard.invalidate();
});
watch(() => route.fullPath, () => {
  if (syncFromQuery()) {
    void router.replace({ query: currentQuery() });
    return;
  }
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  logisticsWriteVersion += 1;
  shippingWriteVersion += 1;
  priceWriteVersion += 1;
  requestGuard.invalidate();
  orders.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  priceModalOpen.value = false;
  shippingModalOpen.value = false;
  logisticsModalOpen.value = false;
  priceOrder.value = undefined;
  shippingOrder.value = undefined;
  logisticsOrder.value = undefined;
  priceSubmitting.value = false;
  shippingSubmitting.value = false;
  logisticsSubmitting.value = false;
  syncQuery();
});

function onTabChange() {
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

function onUploadShipping(order: Api.RealOrder.Record) {
  shippingModalVersion += 1;
  shippingOrder.value = order;
  shippingModalOpen.value = true;
}

function manageLogistics(order: Api.RealOrder.Record) {
  logisticsModalVersion += 1;
  logisticsOrder.value = order;
  logisticsModalOpen.value = true;
}

// 工作台入口只定位并读取原订单，仍使用本页已有弹窗，绝不自动执行写入。
watch([() => route.query.action, () => route.query.orderId, () => userStore.currentUser?.id], async ([action, orderId, userId]) => {
  const isCurrent = actionGuard.begin();
  shippingModalOpen.value = false;
  logisticsModalOpen.value = false;
  if ((action !== 'shipping' && action !== 'logistics') || typeof orderId !== 'string' || !orderId || userId === undefined) return;
  try {
    const order = await realOrderApi.fetchOrderDetail(orderId, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    if (!sameBusinessId(order.id, orderId) || !getOrderCapabilities(order, userId).isSeller) {
      Message.warning('无法操作该订单，请从本人的卖出订单重新进入');
      return;
    }
    if (action === 'shipping' && ['PROCURING', 'PROCURED'].includes(order.status)) onUploadShipping(order);
    else if (action === 'logistics' && ['IN_TRANSIT', 'AFTERSALE_CONFIRM'].includes(order.status)) manageLogistics(order);
    else Message.warning('订单状态已变化，请核对最新订单后操作');
  } catch {
    if (isCurrent()) Message.warning('操作订单读取失败，请从下方订单列表重新进入');
  }
}, { immediate: true });

async function createLogisticsTrack(params: Api.RealOrder.LogisticsTrackParams) {
  if (logisticsSubmitting.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++logisticsWriteVersion;
  const submittedModalVersion = logisticsModalVersion;
  const isCurrentWrite = () => operation === logisticsWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  logisticsSubmitting.value = true;
  try {
    await realOrderApi.createLogisticsTrack(params);
    if (!isCurrentWrite()) return;
    Message.success('物流轨迹已登记');
    if (submittedModalVersion === logisticsModalVersion) logisticsModalOpen.value = false;
    await load();
  } catch {
    // 请求层已展示后端业务提示，保留表单供修正后重试。
  } finally {
    if (operation === logisticsWriteVersion) logisticsSubmitting.value = false;
  }
}

async function markLogisticsException(params: Api.RealOrder.LogisticsExceptionParams) {
  if (logisticsSubmitting.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++logisticsWriteVersion;
  const submittedModalVersion = logisticsModalVersion;
  const isCurrentWrite = () => operation === logisticsWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  logisticsSubmitting.value = true;
  try {
    await realOrderApi.markLogisticsException(params);
    if (!isCurrentWrite()) return;
    Message.success('物流异常已标记');
    if (submittedModalVersion === logisticsModalVersion) logisticsModalOpen.value = false;
    await load();
  } catch {
    // 请求层已展示后端业务提示，保留表单供修正后重试。
  } finally {
    if (operation === logisticsWriteVersion) logisticsSubmitting.value = false;
  }
}

async function shipOrder(params: Api.RealOrder.OrderShipParams) {
  if (shippingSubmitting.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++shippingWriteVersion;
  const submittedModalVersion = shippingModalVersion;
  const isCurrentWrite = () => operation === shippingWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  shippingSubmitting.value = true;
  try {
    try {
      await realOrderApi.shipOrder(params);
      if (!isCurrentWrite()) return;
      Message.success('发货信息已提交');
      if (submittedModalVersion === shippingModalVersion) shippingModalOpen.value = false;
      await load();
    } catch {
      // 请求层已展示错误，保留发货表单供用户修正后重试。
    }
  } finally {
    if (operation === shippingWriteVersion) shippingSubmitting.value = false;
  }
}

function openPriceModal(order: Api.RealOrder.Record) {
  if (priceSubmitting.value) return;
  priceOrder.value = order;
  priceAmount.value = Number(order.totalAmount);
  priceModalOpen.value = true;
}

async function changePrice() {
  if (priceSubmitting.value) return false;
  const orderId = priceOrder.value?.id;
  const amount = priceAmount.value;
  if (orderId === undefined || orderId === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    Message.warning('请输入正确的订单金额');
    return false;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return false;
  const operation = ++priceWriteVersion;
  const isCurrentWrite = () => operation === priceWriteVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(priceOrder.value?.id, orderId);
  priceSubmitting.value = true;
  try {
    try {
      await realOrderApi.changeOrderPrice({ id: orderId, amount });
      if (!isCurrentWrite()) return false;
      Message.success('订单价格已修改');
      await load();
      return true;
    } catch {
      // 请求层已展示错误，保留改价表单供用户修正后重试。
      return false;
    }
  } finally {
    if (operation === priceWriteVersion) priceSubmitting.value = false;
  }
}

function selectTab(value: unknown) {
  if (typeof value === 'string' && TABS.some(tab => tab.key === value)) {
    activeKey.value = value;
    onTabChange();
  }
}
</script>

<template>
  <div class="buyer-orders-page shop-container">
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>买手订单</h1><p>从采购到交付，清晰掌握每一步。</p></div><Button class="outline" variant="outline" :disabled="loading" @click="load"><UmIcon name="return" />刷新</Button></header>
    <div class="buyer-tabs" role="group" aria-label="订单状态"><button v-for="tab in TABS" :key="tab.key" type="button" :class="{ active:activeKey === tab.key }" :aria-pressed="activeKey === tab.key" :disabled="tab.unavailable" :title="tab.unavailable ? '当前接口尚未提供独立' + tab.label + '阶段' : undefined" @click="selectTab(tab.key)">{{ tab.label }}</button></div><div class="buyer-filter"><label><UmIcon name="search" /><input aria-label="搜索订单，暂未开放" placeholder="搜索订单号或商品名称" disabled title="当前接口尚未提供订单搜索" /></label><button type="button" :disabled="loading" @click="activeKey = 'all'; onTabChange()">重置</button></div>
    <div v-if="orders.length" class="order-list"><BuyerOrderCard v-for="order in orders" :key="order.id" :order="order" @change-price="openPriceModal" @upload-shipping="onUploadShipping" @manage-logistics="manageLogistics" /></div>
    <div v-else-if="loading" class="loading-list" aria-busy="true" aria-label="正在读取买手订单"><Skeleton v-for="n in 3" :key="n" class="order-skeleton" /></div>
    <EmptyState v-else :title="loadError || '该状态下没有订单'" :description="loadError ? '请稍后重试。' : '去求购大厅接单或等待顾客通过商品下单'" :action-text="loadError ? '重新加载' : undefined" @action="load" />
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="changePage" />
    <a-modal content-class="buyer-dialog" v-model:visible="priceModalOpen" title="修改待付款订单价格" :ok-loading="priceSubmitting" :closable="!priceSubmitting" :mask-closable="!priceSubmitting" :esc-to-close="!priceSubmitting" :on-before-cancel="() => !priceSubmitting" :on-before-ok="changePrice"><div class="price-form"><div class="buyer-field"><Label for="buyer-order-code">订单号</Label><Input id="buyer-order-code" :model-value="priceOrder?.code" disabled /></div><div class="buyer-field"><Label for="buyer-order-amount">订单金额（USDT）<span>*</span></Label><AmountInput id="buyer-order-amount" v-model="priceAmount" :disabled="priceSubmitting" :min="0.01" :precision="2" placeholder="请输入调整后的金额" /></div></div></a-modal>
    <ShippingUploadModal v-model:visible="shippingModalOpen" :order="shippingOrder" :submitting="shippingSubmitting" @confirm="shipOrder" />
    <LogisticsManageModal v-model:visible="logisticsModalOpen" :order="logisticsOrder" :submitting="logisticsSubmitting" @create-track="createLogisticsTrack" @mark-exception="markLogisticsException" />
  </div>
</template>

<style scoped>
.loading-list { display:grid; gap:16px; }
.order-skeleton { height:180px; }
.price-form { display:grid; gap:22px; }
.field { display:grid; gap:10px; }
.field label > span { color:var(--yb-danger); }
</style>
