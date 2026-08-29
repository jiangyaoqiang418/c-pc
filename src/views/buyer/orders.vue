<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import ShippingUploadModal from '@/components/buyer/shipping-upload-modal.vue';
import LogisticsManageModal from '@/components/buyer/logistics-manage-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as realOrderApi from '@/service/api/order';
import { enums } from '@shared';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.Order.OrderStatus[];
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending-payment', label: '待付款', statuses: ['PENDING_PAYMENT'] },
  { key: 'procuring', label: '采购中', statuses: ['PROCURING'] },
  { key: 'procured', label: '待发货', statuses: ['PROCURED'] },
  { key: 'shipping', label: '运输中', statuses: ['IN_TRANSIT', 'AFTERSALE_CONFIRM'] },
  { key: 'done', label: '已完成', statuses: ['COMPLETED', 'WARRANTY', 'ARCHIVED'] }
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

function syncFromQuery() {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  activeKey.value = TABS.some(item => item.key === tab) ? String(tab) : 'all';
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = Number(rawPage);
  current.value = Number.isInteger(page) && page > 0 ? page : 1;
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
  if (!user) return;
  loading.value = true;
  loadError.value = '';
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await realOrderApi.fetchMyOrders({
      shopperId: user.id,
      current: current.value,
      size: size.value,
      statuses: tab?.statuses,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
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
  syncFromQuery();
  void load();
});
onBeforeUnmount(requestGuard.invalidate);
watch(() => route.fullPath, () => {
  syncFromQuery();
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
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

function onUploadProof() {
  Message.info('采购凭证绑定订单接口暂未提供');
}

function onUploadShipping(order: Api.RealOrder.Record) {
  shippingOrder.value = order;
  shippingModalOpen.value = true;
}

function manageLogistics(order: Api.RealOrder.Record) {
  logisticsOrder.value = order;
  logisticsModalOpen.value = true;
}

async function createLogisticsTrack(params: Api.RealOrder.LogisticsTrackParams) {
  if (logisticsSubmitting.value) return;
  logisticsSubmitting.value = true;
  try {
    await realOrderApi.createLogisticsTrack(params);
    Message.success('物流轨迹已登记');
    logisticsModalOpen.value = false;
    await load();
  } catch {
    // 请求层已展示后端业务提示，保留表单供修正后重试。
  } finally {
    logisticsSubmitting.value = false;
  }
}

async function markLogisticsException(params: Api.RealOrder.LogisticsExceptionParams) {
  if (logisticsSubmitting.value) return;
  logisticsSubmitting.value = true;
  try {
    await realOrderApi.markLogisticsException(params);
    Message.success('物流异常已标记');
    logisticsModalOpen.value = false;
    await load();
  } catch {
    // 请求层已展示后端业务提示，保留表单供修正后重试。
  } finally {
    logisticsSubmitting.value = false;
  }
}

async function shipOrder(params: Api.RealOrder.OrderShipParams) {
  if (shippingSubmitting.value) return;
  shippingSubmitting.value = true;
  try {
    try {
      await realOrderApi.shipOrder(params);
      Message.success('发货信息已提交');
      shippingModalOpen.value = false;
      await load();
    } catch {
      // 请求层已展示错误，保留发货表单供用户修正后重试。
    }
  } finally {
    shippingSubmitting.value = false;
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
  if (orderId === undefined || orderId === null || !amount || amount <= 0) {
    Message.warning('请输入正确的订单金额');
    return false;
  }
  priceSubmitting.value = true;
  try {
    try {
      await realOrderApi.changeOrderPrice({ id: orderId, amount });
      Message.success('订单价格已修改');
      await load();
      return true;
    } catch {
      // 请求层已展示错误，保留改价表单供用户修正后重试。
      return false;
    }
  } finally {
    priceSubmitting.value = false;
  }
}
</script>

<template>
  <div class="buyer-orders-page shop-container">
    <h1 class="page-title">买手订单</h1>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load @change="onTabChange">
        <a-tab-pane v-for="t in TABS" :key="t.key" :title="t.label" />
      </a-tabs>
    </a-card>

    <div class="list-wrap">
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="orders.length">
          <BuyerOrderCard
            v-for="o in orders"
            :key="o.id"
            :order="o"
            @change-price="openPriceModal"
            @upload-proof="onUploadProof"
            @upload-shipping="onUploadShipping"
            @manage-logistics="manageLogistics"
          />
        </template>
        <EmptyState
          v-else
          :title="loadError || '该状态下没有订单'"
          :description="loadError ? '不会把请求失败误显示为没有订单。' : '去求购大厅接单或等待顾客通过商品下单'"
          :action-text="loadError ? '重新加载' : undefined"
          @action="load"
        />
      </a-spin>
    </div>

    <div v-if="total > size" class="pagination">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="changePage"
      />
    </div>

    <a-modal v-model:visible="priceModalOpen" title="修改待付款订单价格" :ok-loading="priceSubmitting" :before-ok="changePrice">
      <a-form :model="{ priceAmount }" layout="vertical">
        <a-form-item label="订单">
          <a-input :model-value="priceOrder?.code" disabled />
        </a-form-item>
        <a-form-item label="订单金额 (USDT)" required>
          <a-input-number v-model="priceAmount" :min="0.01" :precision="2" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>

    <ShippingUploadModal
      v-model:visible="shippingModalOpen"
      :order="shippingOrder"
      :submitting="shippingSubmitting"
      @confirm="shipOrder"
    />
    <LogisticsManageModal
      v-model:visible="logisticsModalOpen"
      :order="logisticsOrder"
      :submitting="logisticsSubmitting"
      @create-track="createLogisticsTrack"
      @mark-exception="markLogisticsException"
    />
  </div>
</template>

<style scoped>
.buyer-orders-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.list-wrap {
  margin-top: 16px;
}
.pagination {
  display: flex;
  justify-content: center;
  margin: 20px 0 32px;
}
</style>
