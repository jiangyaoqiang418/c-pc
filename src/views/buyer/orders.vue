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
  { key: 'procuring', label: '采购中', statuses: ['PROCURING'] },
  { key: 'procured', label: '待发货', statuses: ['PROCURED'] },
  { key: 'shipping', label: '运输中', statuses: ['IN_TRANSIT', 'AFTERSALE_CONFIRM'] },
  { key: 'done', label: '已完成', statuses: ['COMPLETED', 'WARRANTY', 'ARCHIVED'] }
];

const activeKey = ref('all');
const orders = ref<Api.Order.OrderRecord[]>([]);
const loading = ref(false);

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
