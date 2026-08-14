<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import BuyerProductCard from '@/components/buyer/buyer-product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as productApi from '@/service/api/product';
import { fetchCategoryTree } from '@/service/api/category';
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
  { key: 'rejected', label: '审核驳回', status: 'REJECTED' },
  { key: 'off-shelf', label: '已下架', status: 'NORMAL', shelf: 'off-shelf' },
  { key: 'frozen', label: '已冻结', status: 'FROZEN' }
];

const activeKey = ref('all');
const products = ref<Api.Product.ProductRecord[]>([]);
const loading = ref(false);
const loadError = ref('');
const keyword = ref('');
const categoryPath = ref<Array<string | number>>([]);
const categoryOptions = ref<Array<{ value: string | number; label: string; children?: any[] }>>([]);
const current = ref(1);
const size = ref(12);
const total = ref(0);

function mapCategoryOptions(nodes: Api.Category.CategoryNode[]): Array<{ value: string | number; label: string; children?: any[] }> {
  return nodes.map(node => ({
    value: node.id,
    label: node.name,
    children: node.children?.length ? mapCategoryOptions(node.children) : undefined
  }));
}

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  loadError.value = '';
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await productApi.fetchMyProducts({
      current: current.value,
      size: size.value,
      keyword: keyword.value.trim() || undefined,
      categoryId: categoryPath.value.at(-1),
      status: tab?.status,
      shelf: tab?.shelf
    });
    products.value = r.records;
    total.value = r.total;
  } catch {
    products.value = [];
    total.value = 0;
    loadError.value = '商品列表加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    categoryOptions.value = mapCategoryOptions(await fetchCategoryTree());
  } catch {
    categoryOptions.value = [];
    Message.warning('商品分类加载失败，可先按名称查询商品');
  }
}

function queryProducts() {
  current.value = 1;
  void load();
}

function resetFilters() {
  keyword.value = '';
  categoryPath.value = [];
  queryProducts();
}

onMounted(() => {
  void Promise.all([load(), loadCategories()]);
});
watch(activeKey, () => {
  current.value = 1;
  void load();
});

async function toggleShelf(p: Api.Product.ProductRecord) {
  const nextOnShelf = p.shelfStatus !== 'on-shelf';
  try {
    await productApi.toggleProductShelf(p.id, nextOnShelf);
    Message.success(nextOnShelf ? '已上架' : '已下架');
    await load();
  } catch {
    Message.error(nextOnShelf ? '上架失败，请稍后重试' : '下架失败，请稍后重试');
  }
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
      <a-space>
        <a-button @click="router.push('/buyer/categories/apply')">分类申请</a-button>
        <a-button @click="router.push('/buyer/flash-sales')">秒杀报名</a-button>
        <a-button type="primary" @click="router.push('/buyer/products/create')">+ 上架新商品</a-button>
      </a-space>
    </div>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
        <a-tab-pane v-for="t in TABS" :key="t.key" :title="t.label" />
      </a-tabs>
    </a-card>

    <a-card class="filter-card" :bordered="false">
      <a-space wrap>
        <a-input v-model="keyword" placeholder="搜索商品名称" allow-clear style="width: 240px" @press-enter="queryProducts" />
        <a-cascader
          v-model="categoryPath"
          :options="categoryOptions"
          placeholder="选择商品分类"
          allow-clear
          check-strictly
          style="width: 240px"
        />
        <a-button type="primary" @click="queryProducts">查询</a-button>
        <a-button @click="resetFilters">重置</a-button>
      </a-space>
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
        :title="loadError ? '商品列表加载失败' : '该状态下没有商品'"
        :description="loadError || '点击右上角「上架新商品」开始售卖'"
        :action-text="loadError ? '重新加载' : '上架新商品'"
        @action="loadError ? load() : router.push('/buyer/products/create')"
      />
    </a-spin>

    <div v-if="total > size" class="pagination">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="(page: number) => { current = page; load(); }"
      />
    </div>
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
.filter-card {
  margin-top: 16px;
}
.pagination {
  display: flex;
  justify-content: center;
  margin: 20px 0 32px;
}
@media (max-width: 960px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) {
  .page-head { align-items: flex-start; flex-direction: column; }
  .page-head :deep(.arco-space) { flex-wrap: wrap; }
  .filter-card :deep(.arco-space) { width: 100%; }
  .filter-card :deep(.arco-input-wrapper), .filter-card :deep(.arco-cascader) { width: 100% !important; }
  .grid { grid-template-columns: 1fr; }
}
</style>
