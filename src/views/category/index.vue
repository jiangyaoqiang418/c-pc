<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as categoryApi from '@/service/api/category';
import * as productApi from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { createLatestRequestGuard } from '@/utils/latest-request';

interface CategoryNode {
  id: string | number;
  name: string;
  level: number;
  children?: CategoryNode[];
}

const router = useRouter();
const route = useRoute();
let syncingSelection = false;

interface TreeData {
  key: string;
  title: string;
  raw: CategoryNode;
  children?: TreeData[];
}

const tree = ref<CategoryNode[]>([]);
const selectedKeys = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const products = ref<Api.RealProduct.Record[]>([]);
const total = ref(0);
const loading = ref(false);
const treeLoading = ref(false);
const treeError = ref('');
const productLoadError = ref('');
const breadcrumb = ref<string>('请选择品类');
const productRequestGuard = createLatestRequestGuard();
const treeRequestGuard = createLatestRequestGuard();

const treeData = computed<TreeData[]>(() => mapTree(tree.value));

function mapTree(nodes: CategoryNode[]): TreeData[] {
  return nodes.map(n => ({
    key: String(n.id),
    title: n.name,
    raw: n,
    children: n.children?.length ? mapTree(n.children) : undefined
  }));
}

function findNode(nodes: CategoryNode[], id: string, path: string[] = [], ids: string[] = []): { node: CategoryNode; path: string[]; ids: string[] } | undefined {
  for (const n of nodes) {
    const next = [...path, n.name];
    const nextIds = [...ids, String(n.id)];
    if (String(n.id) === id) return { node: n, path: next, ids: nextIds };
    if (n.children) {
      const f = findNode(n.children, id, next, nextIds);
      if (f) return f;
    }
  }
  return undefined;
}

function restoreCategory() {
  if (!tree.value.length) return;
  const queryId = typeof route.query.categoryId === 'string' ? route.query.categoryId : undefined;
  const matched = queryId ? findNode(tree.value, queryId) : undefined;
  const id = queryId === '' ? undefined : matched ? queryId : String(tree.value[0].id);
  syncingSelection = true;
  selectedKeys.value = id ? [id] : [];
  syncingSelection = false;
  if (queryId && !matched) void router.replace({ query: { ...route.query, categoryId: id } });
  if (id) {
    expandedKeys.value = [...new Set([...expandedKeys.value, ...(findNode(tree.value, id)?.ids || [])])];
    void pick(id);
  } else {
    productRequestGuard.invalidate();
    products.value = [];
    total.value = 0;
    loading.value = false;
    productLoadError.value = '';
    breadcrumb.value = '请选择品类';
  }
}

async function loadTree() {
  const isCurrent = treeRequestGuard.begin();
  treeLoading.value = true;
  treeError.value = '';
  try {
    const nextTree = (await categoryApi.fetchCategoryTree({ signal: isCurrent.signal })) as CategoryNode[];
    if (!isCurrent()) return;
    tree.value = nextTree;
    if (tree.value.length) {
      expandedKeys.value = [String(tree.value[0].id)];
      restoreCategory();
    } else {
      selectedKeys.value = [];
      products.value = [];
      total.value = 0;
    }
  } catch {
    if (!isCurrent()) return;
    tree.value = [];
    selectedKeys.value = [];
    products.value = [];
    total.value = 0;
    treeError.value = '分类树加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) treeLoading.value = false;
  }
}

async function pick(id: string) {
  const isCurrent = productRequestGuard.begin();
  const found = findNode(tree.value, id);
  breadcrumb.value = found ? found.path.join(' / ') : '';
  loading.value = true;
  productLoadError.value = '';
  try {
    const r = await productApi.fetchStorefrontProducts({ categoryId: id, size: 24, signal: isCurrent.signal });
    if (!isCurrent() || selectedKeys.value[0] !== id) return;
    products.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent() || selectedKeys.value[0] !== id) return;
    products.value = [];
    total.value = 0;
    productLoadError.value = '分类商品加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent() && selectedKeys.value[0] === id) loading.value = false;
  }
}

watch(selectedKeys, keys => {
  if (syncingSelection || !tree.value.length) return;
  const id = keys[0];
  const before = route.fullPath;
  void router.push({ query: { ...route.query, categoryId: id || '' } }).then(() => {
    if (route.fullPath === before) restoreCategory();
  });
}, { flush: 'sync' });
watch(() => route.query.categoryId, restoreCategory);

onMounted(loadTree);
onBeforeUnmount(() => {
  productRequestGuard.invalidate();
  treeRequestGuard.invalidate();
});
</script>

<template>
  <div class="category-page shop-container">
    <a-breadcrumb class="bread">
      <a-breadcrumb-item>首页</a-breadcrumb-item>
      <a-breadcrumb-item>全部分类</a-breadcrumb-item>
      <a-breadcrumb-item>{{ breadcrumb }}</a-breadcrumb-item>
    </a-breadcrumb>

    <div class="layout">
      <aside class="side">
        <div class="side-title">分类树</div>
        <EmptyState v-if="treeError" :title="treeError" action-text="重新加载" @action="loadTree" />
        <a-tree
          v-else
          v-model:selected-keys="selectedKeys"
          v-model:expanded-keys="expandedKeys"
          :data="treeData"
          :auto-expand-parent="false"
          block-node
          show-line
        />
      </aside>

      <section class="content">
        <div class="content-bar">
          <span class="content-title">{{ breadcrumb }}</span>
          <span class="content-meta">共 {{ total }} 件商品</span>
          <a-button v-if="selectedKeys[0] && !treeError" type="text" :disabled="loading || treeLoading || !!productLoadError"
            @click="router.push({ name: 'product-list', query: { categoryId: selectedKeys[0] } })">查看全部</a-button>
        </div>
        <a-spin :loading="loading || treeLoading" style="width: 100%">
          <div v-if="products.length" class="shop-grid-4">
            <ProductCard v-for="p in products" :key="p.id" :product="p" />
          </div>
          <EmptyState
            v-else
            :title="productLoadError || '当前分类暂无商品'"
            :description="productLoadError ? '不会把请求失败误显示为没有商品。' : '试试其他分类或浏览推荐'"
            :action-text="productLoadError ? '重新加载' : undefined"
            @action="selectedKeys[0] && pick(selectedKeys[0])"
          />
        </a-spin>
      </section>
    </div>
  </div>
</template>

<style scoped>
.category-page {
  padding-top: 16px;
}
.bread {
  margin-bottom: 12px;
}
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}
.side {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 12px;
  max-height: 720px;
  overflow-y: auto;
}
.side-title {
  font-size: 13px;
  font-weight: 600;
  color: #4e5969;
  margin-bottom: 8px;
}
.content {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 16px;
}
.content-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f2f3f5;
}
.content-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}
.content-meta {
  font-size: 12px;
  color: #86909c;
}
</style>
