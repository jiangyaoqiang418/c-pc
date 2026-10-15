<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
import ThemePicker from '@/components/layout/theme-picker.vue';
import V47CategoryLeafRail from '@/components/layout/v47-category-leaf-rail.vue';
import { useRoute, useRouter } from 'vue-router';
import { Skeleton } from '@/components/ui/skeleton';
import * as categoryApi from '@/service/api/category';
import * as productApi from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';

interface CategoryNode {
  id: string | number;
  name: string;
  icon?: string;
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
const fullTreeLoaded = ref(false);
const rootElement = ref<HTMLElement>();
const searchOpen = ref(false);
const search = ref('');
const searchInput = ref<HTMLInputElement>();
const composing = ref(false);
function openSearch() { searchOpen.value = true; void nextTick(() => searchInput.value?.focus()); }
function doSearch() { if (!composing.value) void router.push({ name:'product-list', query:{ keyword:search.value.trim() || undefined } }); }
function exitCategory() {
  if (searchOpen.value) { searchOpen.value = false; return; }
  const previous = router.options.history.state.back;
  void router.push(typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//') && !previous.startsWith('/category') ? previous : '/');
}
const selectedKeys = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const products = ref<Api.RealProduct.Record[]>([]);
const total = ref(0);
const loading = ref(false);
const treeLoading = ref(false);
const treeError = ref('');
const selectionError = ref('');
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
  selectionError.value = '';
  const queryId = typeof route.query.categoryId === 'string' ? route.query.categoryId : undefined;
  const matched = queryId ? findNode(tree.value, queryId) : undefined;
  if (queryId && !matched && !fullTreeLoaded.value) { void loadTree(true); return; }
  if (route.query.categoryId !== undefined && route.query.categoryId !== '' && !matched) {
    productRequestGuard.invalidate();
    syncingSelection = true;
    selectedKeys.value = [];
    syncingSelection = false;
    products.value = [];
    total.value = 0;
    loading.value = false;
    productLoadError.value = '';
    breadcrumb.value = '当前分类不可用';
    selectionError.value = '当前分类不可用，请重新选择品类。';
    return;
  }
  const id = queryId === '' ? undefined : matched ? queryId : String(tree.value[0].id);
  syncingSelection = true;
  selectedKeys.value = id ? [id] : [];
  syncingSelection = false;
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

async function loadTree(complete = false) {
  const isCurrent = treeRequestGuard.begin();
  treeLoading.value = true;
  treeError.value = '';
  selectionError.value = '';
  try {
    const nextTree = (await (complete ? categoryApi.fetchRealCategoryTree({ signal:isCurrent.signal }) : categoryApi.fetchCategoryTree({ signal:isCurrent.signal }))) as CategoryNode[];
    if (!isCurrent()) return;
    tree.value = nextTree;
    fullTreeLoaded.value = complete;
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

onMounted(() => { void loadTree(); });
onBeforeUnmount(() => {
  productRequestGuard.invalidate();
  treeRequestGuard.invalidate();
});
const selectedPath = computed(() => selectedKeys.value[0] ? findNode(tree.value, selectedKeys.value[0]) : undefined);
const rootId = computed(() => selectedPath.value?.ids[0]);
function categoryIcon(node: CategoryNode) {
  if (node.icon) return node.icon;
  if (/手机|数码|平板/.test(node.name)) return 'phone';
  if (/电脑|办公/.test(node.name)) return 'laptop';
  if (/家电|电器/.test(node.name)) return 'sun';
  if (/服饰|箱包/.test(node.name)) return 'bag';
  if (/运动|户外/.test(node.name)) return 'globe';
  if (/钟表|腕表/.test(node.name)) return 'clock';
  if (/美妆|护肤/.test(node.name)) return 'star';
  return 'grid';
}
function browse(id: string) { return { name:'product-list', query:{ categoryId:id } }; }
function rootKeyboard(event: KeyboardEvent, index: number) {
  const count = treeData.value.length;
  if (!count) return;
  const next = event.key === 'ArrowDown' ? (index + 1) % count : event.key === 'ArrowUp' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : undefined;
  if (next === undefined) return;
  event.preventDefault();
  selectTreeNode(treeData.value[next]);
  void nextTick(() => rootElement.value?.querySelectorAll<HTMLButtonElement>('.category-root-button')[next]?.focus());
}
</script>

<template>
  <div class="category-page">
    <nav class="breadcrumb" aria-label="当前位置"><RouterLink to="/">首页</RouterLink><UmIcon name="chevron" /><span aria-current="page">发现分类</span></nav>
    <div class="category-focus-toolbar"><button type="button" :aria-label="searchOpen ? '收起分类搜索' : '返回上一页'" @click="exitCategory"><UmIcon name="chevron" /></button><form v-if="searchOpen" class="category-focus-search" @submit.prevent="doSearch"><input ref="searchInput" v-model="search" type="search" aria-label="分类页搜索商品" placeholder="搜索商品、品牌" enterkeyhint="search" @compositionstart="composing = true" @compositionend="composing = false" @keydown.esc.prevent="searchOpen = false" /></form><span v-else>全部分类</span><ThemePicker /><button type="button" :aria-label="searchOpen ? '提交商品搜索' : '打开分类搜索'" :aria-expanded="searchOpen" @click="searchOpen ? doSearch() : openSearch()"><UmIcon name="search" /></button></div>
    <h1 class="catalog-sr-only">商品分类</h1>
    <div ref="rootElement" class="category-browser category-browser-page">
      <div class="category-menu-surface">
        <nav class="category-root-list" aria-label="一级商品分类" :aria-busy="treeLoading"><span class="category-rail-label">商品分类</span><div v-if="treeError" class="category-status" role="alert"><p>{{ treeError }}</p><button type="button" @click="loadTree()">重新加载</button></div><div v-else-if="treeLoading && !treeData.length" class="tree-loading" role="status"><span class="catalog-sr-only">正在加载分类</span><Skeleton v-for="index in 6" :key="index" class="h-10 w-full" /></div><p v-else-if="!treeData.length" class="category-status">暂无商品分类</p><button v-for="(node, index) in treeData" :key="node.key" type="button" class="category-root-button" :class="{ active: rootId === node.key }" :aria-expanded="rootId === node.key" aria-controls="category-page-panel" @click="selectTreeNode(node)" @keydown="rootKeyboard($event, index)"><UmIcon :name="categoryIcon(node.raw)" /><span>{{ node.title }}</span><UmIcon name="chevron" /></button></nav>
        <section id="category-page-panel" class="category-mega" :aria-label="`${selectedTreeNode?.title || '商品'}的下级分类`">
          <template v-if="selectedTreeNode">
            <nav v-if="(selectedPath?.ids.length || 0) > 1" class="category-path" aria-label="当前分类层级"><template v-for="(id, index) in selectedPath?.ids" :key="id"><UmIcon v-if="index" name="chevron" /><button v-if="index < (selectedPath?.ids.length || 0) - 1" type="button" @click="selectTreeNode(findTreeItem(treeData, id))">{{ selectedPath?.path[index] }}</button><span v-else>{{ selectedPath?.path[index] }}</span></template></nav>
            <div class="category-mega-heading"><h2>{{ selectedTreeNode.title }}</h2><RouterLink :to="browse(selectedTreeNode.key)">查看全部<UmIcon name="arrow" /></RouterLink></div>
            <div class="category-subgroups"><section v-for="group in selectedTreeNode.children" :key="group.key" class="category-subgroup"><h3><RouterLink :to="browse(group.key)">{{ group.title }}<UmIcon name="chevron" /></RouterLink></h3><V47CategoryLeafRail :label="`${group.title}细分商品`"><span v-for="leaf in group.children" :key="leaf.key" class="category-leaf"><RouterLink :to="browse(leaf.key)">{{ leaf.title }}</RouterLink><button v-if="leaf.children?.length" type="button" class="category-drill" :aria-label="`展开${leaf.title}的子分类`" @click="selectTreeNode(leaf)"><UmIcon name="chevron" /></button></span><button v-if="!group.children?.length" type="button" class="category-drill category-drill-link" @click="selectTreeNode(group)">查看{{ group.title }}<UmIcon name="arrow" /></button></V47CategoryLeafRail></section></div>
            <div v-if="!selectedTreeNode.children?.length" class="category-status">该分类暂无下级分类，可点击“查看全部”浏览商品。</div>
            <div v-if="productLoadError" class="category-status" role="alert"><p>{{ productLoadError }}</p><button type="button" :disabled="loading" @click="selectedKeys[0] && pick(selectedKeys[0])">重新加载</button></div><span v-else class="catalog-sr-only" role="status">{{ loading ? '正在加载分类商品' : `共 ${total} 件商品` }}</span>
          </template><div v-else-if="selectionError" class="category-status" role="alert">{{ selectionError }}</div><div v-else-if="!treeLoading && !treeError" class="category-status">请选择品类</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-status { padding:16px; color:var(--muted); font-size:13px; display:grid; gap:8px; }
.category-status p { font-size:13px; margin:0; }
.category-status button { justify-self:start; color:var(--green); }
.tree-loading { display:grid; gap:8px; padding:8px; }
.category-root-button { width:100%; }
.category-leaf { display:flex; flex-shrink:0; }
.category-leaf:has(> button) > a { border-right:0; border-top-right-radius:0; border-bottom-right-radius:0; }
.category-drill { display:grid; place-items:center; min-width:32px; border:1px solid var(--line); border-radius:0 6px 6px 0; background:var(--soft); color:var(--green); }
.category-drill svg { width:14px; height:14px; }
.category-drill-link { display:flex; gap:8px; padding:7px 13px; border-radius:6px; font-size:12px; }
.category-path { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px; color:var(--muted); font-size:12px; }
.category-path svg { width:12px; height:12px; } .category-path button { color:var(--green); }
@media (max-width:700px) { .category-page > .breadcrumb { display:none; } }
</style>
