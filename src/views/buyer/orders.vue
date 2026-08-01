<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as realOrderApi from '@/service/api/order';

const userStore = useUserStore();

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
const orders = ref<Api.Order.OrderRecord[]>([]);
const loading = ref(false);
const priceModalOpen = ref(false);
const priceSubmitting = ref(false);
const priceOrder = ref<Api.Order.OrderRecord>();
const priceAmount = ref<number>();

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await realOrderApi.fetchMyOrders({
      shopperId: userStore.currentUser.id,
      current: 1,
      size: 50,
      statuses: tab?.statuses
    });
    orders.value = r.records;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(activeKey, load);

function onUploadProof() {
  Message.info('采购凭证绑定订单接口暂未提供');
}

function onUploadShipping() {
  Message.info('物流信息绑定订单接口暂未提供');
}

function openPriceModal(order: Api.Order.OrderRecord) {
  priceOrder.value = order;
  priceAmount.value = Number(order.totalAmount);
  priceModalOpen.value = true;
}

async function changePrice() {
  if (!priceOrder.value || !priceAmount.value || priceAmount.value <= 0) {
    Message.warning('请输入正确的订单金额');
    return;
  }
  priceSubmitting.value = true;
  try {
    await realOrderApi.changeOrderPrice({ id: priceOrder.value.id, amount: priceAmount.value });
    Message.success('订单价格已修改');
    priceModalOpen.value = false;
    await load();
  } finally {
    priceSubmitting.value = false;
  }
}
</script>

<template>
  <div class="buyer-orders-page shop-container">
    <h1 class="page-title">买手订单</h1>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
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
          />
        </template>
        <EmptyState
          v-else
          title="该状态下没有订单"
          description="去求购大厅接单或等待顾客通过商品下单"
        />
      </a-spin>
    </div>

    <a-modal v-model:visible="priceModalOpen" title="修改待付款订单价格" :ok-loading="priceSubmitting" @ok="changePrice">
      <a-form layout="vertical">
        <a-form-item label="订单">
          <a-input :model-value="priceOrder?.code" disabled />
        </a-form-item>
        <a-form-item label="订单金额 (USDT)" required>
          <a-input-number v-model="priceAmount" :min="0.01" :precision="2" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.buyer-orders-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.list-wrap {
  margin-top: 16px;
}
</style>
