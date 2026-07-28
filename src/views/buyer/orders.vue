<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { buyerApi } from '@shared';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import PurchaseProofUploadModal from '@/components/buyer/purchase-proof-upload-modal.vue';
import ShippingUploadModal from '@/components/buyer/shipping-upload-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.Order.OrderStatus[];
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'procuring', label: '采购中', statuses: ['PROCURING'] },
  { key: 'procured', label: '待发货', statuses: ['PROCURED'] },
  { key: 'shipping', label: '运输中', statuses: ['IN_TRANSIT', 'AFTERSALE_CONFIRM'] },
  { key: 'done', label: '已完成', statuses: ['COMPLETED', 'WARRANTY', 'ARCHIVED'] }
];

const activeKey = ref('all');
const orders = ref<Api.Order.OrderRecord[]>([]);
const loading = ref(false);

const proofModalOpen = ref(false);
const shipModalOpen = ref(false);
const opOrder = ref<Api.Order.OrderRecord>();

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await buyerApi.fetchBuyerOrders(userStore.currentUser.id, tab?.statuses);
    orders.value = r.records;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(activeKey, load);

function onUploadProof(order: Api.Order.OrderRecord) {
  opOrder.value = order;
  proofModalOpen.value = true;
}

function onUploadShipping(order: Api.Order.OrderRecord) {
  opOrder.value = order;
  shipModalOpen.value = true;
}

async function confirmProof(orderId: number, imageUrl: string) {
  const r = await buyerApi.uploadPurchaseProofMock(orderId, imageUrl);
  if (r.ok) {
    Message.success('采购截图已上传，订单变为「已采购待发货」');
    proofModalOpen.value = false;
    load();
  }
}

async function confirmShipping(orderId: number, trackingNumber: string, carrier: Api.Order.ShippingCarrier) {
  const r = await buyerApi.uploadShippingMock(orderId, trackingNumber, carrier);
  if (r.ok) {
    Message.success('发货信息已上传，订单变为「运输中」');
    shipModalOpen.value = false;
    load();
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

    <PurchaseProofUploadModal v-model:visible="proofModalOpen" :order="opOrder" @confirm="confirmProof" />
    <ShippingUploadModal v-model:visible="shipModalOpen" :order="opOrder" @confirm="confirmShipping" />
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
