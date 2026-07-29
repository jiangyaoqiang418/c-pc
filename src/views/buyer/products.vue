<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import BuyerProductCard from '@/components/buyer/buyer-product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as productApi from '@/service/api/product';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  status?: Api.Product.ProductStatus;
  shelf?: Api.Product.ShelfStatus;
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'on-shelf', label: '在售', status: 'NORMAL', shelf: 'on-shelf' },
  { key: 'pending', label: '待审核', status: 'PENDING_AUDIT' },
  { key: 'in-audit', label: '审核中', status: 'IN_AUDIT' },
  { key: 'off-shelf', label: '已下架', status: 'NORMAL', shelf: 'off-shelf' },
  { key: 'frozen', label: '已冻结', status: 'FROZEN' }
];

const activeKey = ref('all');
const products = ref<Api.Product.ProductRecord[]>([]);
const loading = ref(false);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await productApi.fetchMyProducts({ status: tab?.status });
    let list = r.records;
    if (tab?.shelf) list = list.filter(p => p.shelfStatus === tab.shelf);
    products.value = list;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(activeKey, load);

async function toggleShelf(p: Api.Product.ProductRecord) {
  const nextOnShelf = p.shelfStatus !== 'on-shelf';
  await productApi.toggleProductShelf(p.id, nextOnShelf);
  Message.success(nextOnShelf ? '已上架' : '已下架');
  await load();
}

function onDelete(p: Api.Product.ProductRecord) {
  void p;
  Message.warning('当前真实接口暂不支持买手删除商品');
}
</script>

<template>
  <div class="bp-page shop-container">
    <div class="page-head">
      <h1 class="page-title">商品管理</h1>
      <a-button type="primary" @click="router.push('/buyer/products/create')">+ 上架新商品</a-button>
    </div>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
        <a-tab-pane v-for="t in TABS" :key="t.key" :title="t.label" />
      </a-tabs>
    </a-card>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="products.length" class="grid">
        <BuyerProductCard
          v-for="p in products"
          :key="p.id"
          :product="p"
          @toggle-shelf="toggleShelf"
          @delete="onDelete"
        />
      </div>
      <EmptyState
        v-else
        title="该状态下没有商品"
        description="点击右上角「上架新商品」开始售卖"
        action-text="上架新商品"
        @action="router.push('/buyer/products/create')"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.bp-page {
  padding-top: 16px;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 16px;
}
</style>
