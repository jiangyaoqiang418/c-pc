<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

const treeData = computed<TreeData[]>(() => mapTree(tree.value));

function mapTree(nodes: CategoryNode[]): TreeData[] {
  return nodes.map(n => ({
    key: String(n.id),
    title: n.name,
    raw: n,
    children: n.children?.length ? mapTree(n.children) : undefined
  }));
}

function findNode(nodes: CategoryNode[], id: string, path: string[] = []): { node: CategoryNode; path: string[] } | undefined {
  for (const n of nodes) {
    const next = [...path, n.name];
    if (String(n.id) === id) return { node: n, path: next };
    if (n.children) {
      const f = findNode(n.children, id, next);
      if (f) return f;
    }
  }
  return undefined;
}

async function loadTree() {
  treeLoading.value = true;
  treeError.value = '';
  try {
    tree.value = (await categoryApi.fetchCategoryTree()) as CategoryNode[];
    if (tree.value.length) {
      expandedKeys.value = [String(tree.value[0].id)];
      // 只设 selectedKeys，让 watcher 一次性接管 fetch —— 避免直接 pick 触发 watcher 重入
      selectedKeys.value = [String(tree.value[0].id)];
    } else {
      selectedKeys.value = [];
      products.value = [];
      total.value = 0;
    }
  } catch {
    tree.value = [];
    selectedKeys.value = [];
    products.value = [];
    total.value = 0;
    treeError.value = '分类树加载失败，请检查网络后重试。';
  } finally {
    treeLoading.value = false;
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
  const id = keys[0];
  if (id) pick(id);
});

onMounted(loadTree);
onBeforeUnmount(productRequestGuard.invalidate);
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
