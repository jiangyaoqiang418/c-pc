<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import * as categoryApi from '@/service/api/category';
import * as productApi from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

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
const products = ref<Api.Product.ProductRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const breadcrumb = ref<string>('请选择品类');

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

onMounted(async () => {
  tree.value = (await categoryApi.fetchCategoryTree()) as CategoryNode[];
  if (tree.value.length) {
    expandedKeys.value = [String(tree.value[0].id)];
    // 只设 selectedKeys，让 watcher 一次性接管 fetch —— 避免 onMounted 直接 pick 触发 watcher 重入
    selectedKeys.value = [String(tree.value[0].id)];
  }
});

let lastPickedId = '';
async function pick(id: string) {
  // 同 id 且不在 loading 中，跳过重复请求
  if (id === lastPickedId && !loading.value) return;
  lastPickedId = id;
  const found = findNode(tree.value, id);
  breadcrumb.value = found ? found.path.join(' / ') : '';
  loading.value = true;
  try {
    const r = await productApi.fetchStorefrontProducts({ categoryId: id, size: 24 });
    products.value = r.records;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}

watch(selectedKeys, keys => {
  const id = keys[0];
  if (id) pick(id);
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
        <a-tree
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
        <a-spin :loading="loading" style="width: 100%">
          <div v-if="products.length" class="shop-grid-4">
            <ProductCard v-for="p in products" :key="p.id" :product="p" />
          </div>
          <EmptyState v-else title="当前分类暂无商品" description="试试其他分类或浏览推荐" />
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
