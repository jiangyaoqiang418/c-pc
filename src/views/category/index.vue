<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { TreeRoot, TreeItem } from 'reka-ui';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
const selectedTreeNode = computed(() => findTreeItem(treeData.value, selectedKeys.value[0]));

function findTreeItem(nodes: TreeData[], key?: string): TreeData | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    const child = findTreeItem(node.children || [], key);
    if (child) return child;
  }
  return undefined;
}

function treeKey(node: TreeData) {
  return node.key || '';
}

function selectTreeNode(node?: TreeData) {
  selectedKeys.value = node ? [node.key] : [];
}

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
    <nav class="bread" aria-label="当前位置">
      <RouterLink to="/">首页</RouterLink><Icon icon="lucide:chevron-right" width="14" /><span>全部分类</span><Icon icon="lucide:chevron-right" width="14" /><span aria-current="page">{{ breadcrumb }}</span>
    </nav>


    <div class="layout">
      <aside class="side">
        <div class="side-title"><Icon icon="lucide:layers" width="18" /> 全部分类</div>
        <EmptyState v-if="treeError" :title="treeError" action-text="重新加载" @action="loadTree" />
        <div v-else-if="treeLoading" class="tree-loading" role="status"><span class="sr-only">正在加载分类</span><Skeleton v-for="index in 6" :key="index" class="h-10 w-full" /></div>
        <TreeRoot
          v-else-if="treeData.length"
          v-slot="{ flattenItems }"
          :items="treeData"
          :model-value="selectedTreeNode"
          v-model:expanded="expandedKeys"
          :get-key="treeKey"
          selection-behavior="replace"
          aria-label="商品分类树"
          @update:model-value="selectTreeNode"
        >
          <TreeItem v-for="item in flattenItems" :key="item._id" v-slot="{ isExpanded, handleToggle }" v-bind="item.bind" class="category-node" :style="{ paddingLeft: `${12 + (item.level - 1) * 18}px` }" :title="item.value.title">
            <button v-if="item.hasChildren" class="node-toggle" tabindex="-1" :aria-label="`${isExpanded ? '收起' : '展开'}${item.value.title}`" @click.stop="handleToggle">
              <Icon icon="lucide:chevron-right" width="14" :class="{ expanded: isExpanded }" />
            </button>
            <span v-else class="node-leaf" aria-hidden="true" />
            <span class="node-name">{{ item.value.title }}</span>
          </TreeItem>
        </TreeRoot>
        <EmptyState v-else title="暂无商品分类" />
      </aside>

      <section class="content">
        <section v-if="selectedTreeNode?.children?.length" class="taxonomy" aria-label="子分类">
          <h1>{{ selectedTreeNode.title }}</h1>
          <article v-for="group in selectedTreeNode.children" :key="group.key" class="taxonomy-group">
            <button class="taxonomy-title" @click="selectTreeNode(group)">{{ group.title }}<Icon icon="lucide:chevron-right" width="14" /></button>
            <div v-if="group.children?.length" class="taxonomy-links"><button v-for="leaf in group.children" :key="leaf.key" @click="selectTreeNode(leaf)">{{ leaf.title }}</button></div>
          </article>
        </section>
        <div class="content-bar">
          <span class="content-title">{{ breadcrumb }}</span>
          <span class="content-meta">共 {{ total }} 件商品</span>
          <Button v-if="selectedKeys[0] && !treeError" variant="ghost" size="sm" :disabled="loading || treeLoading || !!productLoadError"
            @click="router.push({ name: 'product-list', query: { categoryId: selectedKeys[0] } })">查看全部 <Icon icon="lucide:arrow-right" width="16" /></Button>
        </div>
        <div :aria-busy="loading || treeLoading">
          <span v-if="loading || treeLoading" class="sr-only" role="status">正在加载分类商品</span>
          <div v-if="(loading || treeLoading) && !products.length" class="category-grid" aria-hidden="true">
            <div v-for="index in 6" :key="index" class="category-skeleton"><Skeleton class="aspect-square w-full" /><Skeleton class="mt-4 h-5 w-3/4" /><Skeleton class="mt-3 h-6 w-1/2" /></div>
          </div>
          <div v-else-if="products.length" class="category-grid" :class="{ 'is-updating': loading }">
            <ProductCard v-for="p in products" :key="p.id" :product="p" />
          </div>
          <EmptyState
            v-else
            :title="productLoadError || '当前分类暂无商品'"
            :description="productLoadError ? '请稍后重试。' : '试试其他分类或浏览推荐'"
            :action-text="productLoadError ? '重新加载' : undefined"
            @action="selectedKeys[0] && pick(selectedKeys[0])"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.category-page .layout { grid-template-columns: 220px minmax(0, 1fr); gap: 32px; border: 1px solid var(--yb-hairline); border-radius: 10px; background: var(--yb-paper); overflow: hidden; }
.category-page .side { border: 0; border-radius: 0; background: var(--yb-fill); padding: 20px 10px; min-height: 520px; }
.category-page .content { padding: 28px 28px 28px 0; }
.category-page .content-title { font-size: 18px; }
.category-page .category-node[data-selected] { background: var(--yb-paper); }
.taxonomy { padding-bottom: 28px; margin-bottom: 24px; border-bottom: 1px solid var(--yb-hairline); }
.taxonomy h1 { margin: 0 0 24px; font-size: 24px; font-weight: 650; }
.taxonomy-group { display: grid; grid-template-columns: 160px minmax(0,1fr); gap: 24px; padding: 18px 0; border-top: 1px solid var(--yb-hairline); align-items: baseline; }
.taxonomy-title { display: flex; align-items: center; gap: 8px; text-align: left; font-size: 15px; font-weight: 600; }
.taxonomy-links { display: flex; flex-wrap: wrap; gap: 14px 24px; }
.taxonomy-links button { font-size: 13px; color: var(--yb-muted); }
.taxonomy-links button:hover,.taxonomy-title:hover { color: var(--yb-brand-primary); }
@media(max-width: 800px) { .category-page .layout { grid-template-columns: 180px minmax(0,1fr); gap: 20px; } .taxonomy-group { grid-template-columns: 1fr; gap: 14px; } }
.category-page { padding-top: 24px; padding-bottom: 48px; }
.bread { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 24px; color: var(--yb-muted); font-size: 13px; }
.bread a:hover { color: var(--yb-primary); }
.bread [aria-current] { color: var(--yb-ink); }
.category-heading { margin-bottom: 28px; }
.category-heading > span { color: var(--yb-muted); font-size: 11px; letter-spacing: .14em; }
.category-heading h1 { margin-top: 8px; font-size: 28px; font-weight: 650; }
.layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 28px; align-items: start; }
.side { background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 12px; padding: 16px 10px; max-height: 720px; overflow-y: auto; }
.side-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; padding: 0 12px 16px; margin-bottom: 8px; border-bottom: 1px solid var(--yb-hairline); }
.tree-loading { display: grid; gap: 8px; padding: 8px; }
.category-node { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 12px; border-radius: 6px; color: var(--yb-muted); font-size: 14px; cursor: pointer; transition: background 150ms, color 150ms; }
.category-node:hover { background: var(--yb-fill); color: var(--yb-primary); }
.category-node[data-selected] { background: var(--yb-primary-soft); color: var(--yb-primary); font-weight: 600; }
.node-toggle { flex-shrink: 0; display: grid; place-items: center; width: 20px; height: 24px; }
.node-toggle svg { transition: transform 150ms; }
.node-toggle svg.expanded { transform: rotate(90deg); }
.node-leaf { width: 20px; flex-shrink: 0; }
.node-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content { min-width: 0; }
.content-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--yb-hairline); }
.content-title { min-width: 0; overflow-wrap: anywhere; font-size: 18px; font-weight: 600; }
.content-meta { color: var(--yb-muted); font-size: 13px; margin-left: auto; }
.category-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; transition: opacity 150ms; }
.category-grid.is-updating { opacity: .55; }
.category-skeleton { padding: 12px; border: 1px solid var(--yb-hairline); border-radius: 12px; background: var(--yb-surface); }
@media (max-width: 1100px) { .layout { grid-template-columns: 220px minmax(0, 1fr); gap: 20px; } .category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .category-node, .category-grid, .node-toggle svg { transition: none; } }
</style>
