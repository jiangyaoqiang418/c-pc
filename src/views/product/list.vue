<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { FocusScope } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import * as productApi from '@/service/api/product';
import * as categoryApi from '@/service/api/category';
import { useCategoryNavigation } from '@/composables/use-category-navigation';
import ProductCard from '@/components/product/product-card.vue';
import { Skeleton } from '@/components/ui/skeleton';
import UmIcon from '@/components/common/um-icon.vue';
import V47CatalogCategories from '@/components/product/v47-catalog-categories.vue';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { exactDecimalNumber } from '@/components/wallet/decimal-amount';
import type { CatalogVisualFixture } from '@/visual/types';

const props = defineProps<{ visualFixture?: CatalogVisualFixture }>();
const router = useRouter();
const route = useRoute();

const filter = reactive({
  keyword: '',
  categoryId: undefined as string | undefined,
  brandId: undefined as string | undefined,
  aftersaleType: undefined as Api.Product.AftersaleType | undefined,
  overseasCustoms: undefined as boolean | undefined,
  minPrice: undefined as number | undefined,
  maxPrice: undefined as number | undefined,
  sort: 'DEFAULT' as productApi.StorefrontSort
});

const expandedFilters = reactive({ aftersale: true, overseas: true, price: true });
const priceTexts = reactive({ minPrice:'', maxPrice:'' });
function readPrice(value: string) { return value.trim() ? exactDecimalNumber(value, true) : { value:undefined, error:'' }; }
const priceError = computed(() => {
  const min = readPrice(priceTexts.minPrice);
  const max = readPrice(priceTexts.maxPrice);
  return min.error ? `最低价格：${min.error}` : max.error ? `最高价格：${max.error}` : '';
});
const filterOpen = ref(false);
const filterTrigger = ref<HTMLButtonElement>();
const filterClose = ref<HTMLButtonElement>();
let filterViewport: MediaQueryList | undefined;
let previousOverflow = '';
watch(filterOpen, value => {
  if (value) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  else document.body.style.overflow = previousOverflow;
}, { flush:'sync' });
function openFilters() {
  if (!filterViewport?.matches) return;
  filterOpen.value = true;
  void nextTick(() => { if (filterOpen.value) filterClose.value?.focus({ preventScroll:true }); });
}
function closeFilterPanel(restoreFocus = true) {
  filterOpen.value = false;
  if (restoreFocus) void nextTick(() => {
    if (filterTrigger.value?.isConnected && filterTrigger.value.getClientRects().length) filterTrigger.value.focus({ preventScroll:true });
  });
}
function syncFilterViewport() { if (!filterViewport?.matches) closeFilterPanel(false); }
function closeFilters(event: KeyboardEvent) { if (event.key === 'Escape' && filterOpen.value) closeFilterPanel(); }
const list = ref<Api.RealProduct.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(24);
const loading = ref(false);
const appending = ref(false);
const loadError = ref('');
const feedError = ref('');
const feedRoot = ref<HTMLElement>();
const feedSentinel = ref<HTMLElement>();
const loadedPage = ref(0);
const visibleLimit = ref(24);
const visibleProducts = computed(() => list.value.slice(0, visibleLimit.value));
const hasMoreFeed = computed(() => visibleProducts.value.length < list.value.length || loadedPage.value * size.value < total.value);
let feedObserver: IntersectionObserver | undefined;
const requestGuard = createLatestRequestGuard();
const { categories: navigationCategories, loadCategories } = useCategoryNavigation();
const categoryTree = ref<Api.RealCategory.CategoryNodeDTO[]>([]);
const categoryTreeLoaded = ref(false);
const categoryLoading = ref(false);
const categoryError = ref('');
const categoryRequestGuard = createLatestRequestGuard();

interface CategoryPathNode {
  id: string;
  name: string;
  children?: readonly CategoryPathNode[];
}

function findCategoryPath(nodes: readonly CategoryPathNode[], id?: string): { id: string; name: string }[] | undefined {
  if (!id) return undefined;
  for (const node of nodes) {
    const segment = { id: node.id, name: node.name };
    if (node.id === id) return [segment];
    const childPath = findCategoryPath(node.children || [], id);
    if (childPath) return [segment, ...childPath];
  }
  return undefined;
}

const categoryPath = computed(() => findCategoryPath(navigationCategories.value, filter.categoryId)
  || findCategoryPath(categoryTree.value, filter.categoryId) || []);
const catalogCategories = computed(() => navigationCategories.value.some(node => node.id === categoryPath.value[0]?.id)
  ? navigationCategories.value : categoryTree.value);
const categoryLabel = computed(() => categoryPath.value.map(node => node.name).join(' / ')
  || (categoryLoading.value ? '正在加载分类…' : categoryError.value || '当前分类'));

async function loadCategoryPath(force = false) {
  if (props.visualFixture) return;
  const isCurrent = categoryRequestGuard.begin();
  categoryLoading.value = true;
  categoryError.value = '';
  try {
    await loadCategories(force);
    if (!isCurrent() || !filter.categoryId) return;
    if (categoryPath.value.length) return;
    // 导航只包含有商品的分类；空分类的名称仍从现有完整分类树读取。
    if (!categoryTreeLoaded.value || force) {
      const nextTree = await categoryApi.fetchRealCategoryTree({ signal: isCurrent.signal });
      if (!isCurrent()) return;
      categoryTree.value = nextTree;
      categoryTreeLoaded.value = true;
    }
    if (!categoryPath.value.length) categoryError.value = '当前分类不可用';
  } catch {
    if (isCurrent()) categoryError.value = '分类名称加载失败';
  } finally {
    if (isCurrent()) categoryLoading.value = false;
  }
}

function categoryLocation(categoryId?: string) {
  return { name: 'product-list', query: { ...route.query, categoryId, page: undefined } };
}

function clearCategory() {
  void router.push(categoryLocation());
}

watch(() => filter.categoryId, id => {
  if (id) void loadCategoryPath();
  else {
    categoryRequestGuard.invalidate();
    categoryLoading.value = false;
    categoryError.value = '';
  }
});

const sortOptions: { value: productApi.StorefrontSort; label: string }[] = [
  { value: 'DEFAULT', label: '综合排序' },
  { value: 'SALES', label: '销量优先' },
  { value: 'NEW', label: '最新上架' },
  { value: 'PRICE_ASC', label: '价格升序' },
  { value: 'PRICE_DESC', label: '价格降序' }
];

const aftersaleOptions = [
  { value: 'all', label: '不限' },
  { value: '7day-no-reason', label: '7 天无理由' },
  { value: 'shop-warranty', label: '店铺保修' },
  { value: 'national-warranty', label: '全国联保' },
  { value: 'none', label: '无售后' }
];
const aftersaleSelection = computed({
  get: () => filter.aftersaleType || 'all',
  set: (value: string) => { filter.aftersaleType = value === 'all' ? undefined : value as Api.Product.AftersaleType; }
});
const overseasSelection = computed({
  get: () => filter.overseasCustoms ? 'overseas' : 'all',
  set: (value: string) => { filter.overseasCustoms = value === 'overseas' ? true : undefined; }
});

function syncFromQuery() {
  const queryKeyword = route.query.keyword;
  const queryCategoryId = route.query.categoryId;
  const queryBrandId = route.query.brandId;
  filter.keyword = typeof queryKeyword === 'string' ? queryKeyword : '';
  filter.categoryId = typeof queryCategoryId === 'string' ? queryCategoryId || undefined : undefined;
  filter.brandId = typeof queryBrandId === 'string' ? queryBrandId || undefined : undefined;
  const rawAftersaleType = Array.isArray(route.query.aftersaleType) ? route.query.aftersaleType[0] : route.query.aftersaleType;
  const validAftersaleType = typeof rawAftersaleType === 'string'
    && aftersaleOptions.some(option => option.value !== 'all' && option.value === rawAftersaleType);
  filter.aftersaleType = validAftersaleType ? rawAftersaleType as Api.Product.AftersaleType : undefined;
  const rawOverseas = route.query.overseas;
  const validOverseas = rawOverseas === undefined || rawOverseas === '1';
  filter.overseasCustoms = rawOverseas === '1' ? true : undefined;
  const rawMinPrice = Array.isArray(route.query.minPrice) ? route.query.minPrice[0] : route.query.minPrice;
  const rawMaxPrice = Array.isArray(route.query.maxPrice) ? route.query.maxPrice[0] : route.query.maxPrice;
  priceTexts.minPrice = typeof rawMinPrice === 'string' ? rawMinPrice : '';
  priceTexts.maxPrice = typeof rawMaxPrice === 'string' ? rawMaxPrice : '';
  const minPrice = readPrice(priceTexts.minPrice).value;
  const maxPrice = readPrice(priceTexts.maxPrice).value;
  filter.minPrice = minPrice;
  filter.maxPrice = maxPrice;
  const querySort = Array.isArray(route.query.sort) ? route.query.sort[0] : route.query.sort;
  filter.sort = productApi.normalizeStorefrontSort(querySort || undefined);
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  const validPage = Number.isSafeInteger(page) && page > 0;
  current.value = validPage ? page : 1;
  return (queryKeyword !== undefined && typeof queryKeyword !== 'string')
    || (queryCategoryId !== undefined && typeof queryCategoryId !== 'string')
    || (queryBrandId !== undefined && typeof queryBrandId !== 'string')
    || Array.isArray(route.query.sort)
    || (querySort !== undefined && querySort !== filter.sort)
    || (route.query.aftersaleType !== undefined && (Array.isArray(route.query.aftersaleType) || !validAftersaleType))
    || (Array.isArray(rawOverseas) || !validOverseas)
    || Array.isArray(route.query.minPrice)
    || Array.isArray(route.query.maxPrice)
    || (route.query.page !== undefined && (Array.isArray(route.query.page) || !validPage));
}

async function load(append = false) {
  if (append && (loading.value || !hasMoreFeed.value)) return;
  const page = append ? loadedPage.value + 1 : current.value;
  const shown = visibleProducts.value.length;
  if (priceError.value || filter.minPrice !== undefined && filter.maxPrice !== undefined && filter.minPrice > filter.maxPrice) {
    requestGuard.invalidate();
    loading.value = false;
    appending.value = false;
    list.value = [];
    total.value = 0;
    loadError.value = priceError.value || '最低价格不能高于最高价格，请调整筛选条件。';
    return;
  }
  const isCurrent = requestGuard.begin();
  appending.value = append;
  loading.value = true;
  loadError.value = '';
  feedError.value = '';
  try {
    const r = await (props.visualFixture?.load || productApi.fetchStorefrontProducts)({
      current: page,
      size: size.value,
      keyword: filter.keyword || undefined,
      categoryId: filter.categoryId || undefined,
      brandId: filter.brandId,
      aftersaleType: filter.aftersaleType,
      overseasCustoms: filter.overseasCustoms,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      sort: filter.sort,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (page > maxPage) {
      current.value = append ? 1 : maxPage;
      updateUrl(true);
      return;
    }
    if (append) {
      const ids = new Set(list.value.map(product => String(product.id)));
      list.value = [...list.value, ...r.records.filter(product => {
        const id = String(product.id);
        if (ids.has(id)) return false;
        ids.add(id);
        return true;
      })];
      visibleLimit.value = shown + 12;
    } else {
      if (list.value.length && feedRoot.value && feedRoot.value.getBoundingClientRect().top < 120) {
        feedRoot.value.scrollIntoView({ block:'start', behavior:'instant' });
      }
      list.value = r.records;
      visibleLimit.value = 24;
    }
    loadedPage.value = page;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    if (append) {
      feedError.value = '商品列表加载失败，请检查网络后重试。';
      return;
    }
    list.value = [];
    total.value = 0;
    loadError.value = '商品列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) { loading.value = false; appending.value = false; }
  }
}

function loadMoreFeed() {
  if (loading.value || !hasMoreFeed.value) return;
  if (visibleLimit.value < list.value.length) visibleLimit.value += 12;
  else void load(true);
}

watch(feedSentinel, node => {
  feedObserver?.disconnect();
  if (node) feedObserver?.observe(node);
}, { flush:'post' });

function updateUrl(replace: boolean) {
  const before = route.fullPath;
  const location = {
    name: 'product-list',
    query: {
      keyword: filter.keyword || undefined,
      categoryId: filter.categoryId ? String(filter.categoryId) : undefined,
      brandId: filter.brandId,
      aftersaleType: filter.aftersaleType,
      overseas: filter.overseasCustoms ? '1' : undefined,
      minPrice: priceTexts.minPrice.trim() || undefined,
      maxPrice: priceTexts.maxPrice.trim() || undefined,
      sort: filter.sort,
      page: current.value === 1 ? undefined : String(current.value)
    }
  };
  void (replace ? router.replace(location) : router.push(location)).then(() => {
    if (route.fullPath === before) void load();
  });
}

function applyToUrl(closePanel = false) {
  if (priceError.value) {
    Message.warning(priceError.value);
    void load();
    return;
  }
  if ([filter.minPrice, filter.maxPrice].some(price => price != null && (!Number.isFinite(price) || price < 0))) {
    Message.warning('请输入有效的非负价格');
    return;
  }
  if (filter.minPrice != null && filter.maxPrice != null && filter.minPrice > filter.maxPrice) {
    Message.warning('最低价格不能高于最高价格');
    return;
  }
  if (closePanel) closeFilterPanel();
  current.value = 1;
  updateUrl(false);
}

function resetFilters() {
  filter.aftersaleType = undefined;
  filter.overseasCustoms = undefined;
  filter.minPrice = undefined;
  filter.maxPrice = undefined;
  priceTexts.minPrice = '';
  priceTexts.maxPrice = '';
  current.value = 1;
  applyToUrl();
}

onMounted(() => {
  if ('IntersectionObserver' in window) feedObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting) && !feedError.value) loadMoreFeed();
  }, { rootMargin:'0px 0px 480px 0px' });
  filterViewport = matchMedia('(max-width:700px)');
  filterViewport.addEventListener('change', syncFilterViewport);
  window.addEventListener('keydown', closeFilters);
  if (syncFromQuery()) updateUrl(true);
  else load();
});
onBeforeUnmount(() => {
  feedObserver?.disconnect();
  filterViewport?.removeEventListener('change', syncFilterViewport);
  window.removeEventListener('keydown', closeFilters);
  if (filterOpen.value) document.body.style.overflow = previousOverflow;
  requestGuard.invalidate();
  categoryRequestGuard.invalidate();
});

watch(
  () => route.fullPath,
  () => {
    if (syncFromQuery()) updateUrl(true);
    else load();
  }
);

const title = computed(() => {
  if (filter.keyword) return `搜索：「${filter.keyword}」`;
  if (filter.categoryId) return categoryPath.value.at(-1)?.name || '分类筛选';
  return '全部商品';
});

function updatePrice(bound: 'minPrice' | 'maxPrice', value: string | number) {
  priceTexts[bound] = String(value);
  filter[bound] = readPrice(priceTexts[bound]).value;
}

function selectAftersale(value: string) {
  aftersaleSelection.value = value;
  applyToUrl();
}

function selectOverseas(value: string) {
  overseasSelection.value = value;
  applyToUrl();
}

function selectSort(value: unknown) {
  if (typeof value !== 'string' || !sortOptions.some(option => option.value === value)) return;
  filter.sort = value as productApi.StorefrontSort;
  applyToUrl();
}

function ignoreVisualFavorite() {}
</script>

<template>
  <div class="list-page">
    <nav class="breadcrumb" aria-label="当前位置"><RouterLink to="/">首页</RouterLink><UmIcon name="chevron" /><template v-if="filter.categoryId"><RouterLink :to="categoryLocation()">精选商品</RouterLink><template v-for="(node, index) in categoryPath" :key="node.id"><UmIcon name="chevron" /><RouterLink v-if="index < categoryPath.length - 1" :to="categoryLocation(node.id)">{{ node.name }}</RouterLink><span v-else aria-current="page">{{ node.name }}</span></template><template v-if="!categoryPath.length"><UmIcon name="chevron" /><span aria-current="page">{{ categoryLabel }}</span></template></template><span v-else aria-current="page">精选商品</span></nav>
    <h1 class="catalog-sr-only">{{ title }}</h1><p v-if="filter.keyword" class="catalog-search-caption">“{{ filter.keyword }}” 的搜索结果</p>
    <div class="catalog-layout">
      <div v-if="filterOpen" class="catalog-filter-touch-mask" aria-hidden="true" @pointerdown.prevent @touchmove.prevent @click.stop="closeFilterPanel()" />
      <FocusScope as-child :trapped="filterOpen" :loop="filterOpen" :present="filterOpen" @mount-auto-focus="$event.preventDefault()" @unmount-auto-focus="$event.preventDefault()">
      <aside class="filters" :class="{ open: filterOpen }" :role="filterOpen ? 'dialog' : undefined" :aria-modal="filterOpen || undefined" aria-labelledby="catalog-filter-title">
        <div class="section-heading"><h3 id="catalog-filter-title">筛选商品</h3><button type="button" @click="resetFilters">重置</button><button ref="filterClose" type="button" class="mobile-only icon-btn" aria-label="关闭筛选" @click="closeFilterPanel()"><UmIcon name="close" /></button></div>
        <details :open="expandedFilters.aftersale" @toggle="expandedFilters.aftersale = ($event.target as HTMLDetailsElement).open"><summary>售后服务</summary><label v-for="option in aftersaleOptions" :key="option.value"><input type="radio" name="service" :value="option.value" :checked="aftersaleSelection === option.value" @change="selectAftersale(option.value)" />{{ option.label }}</label></details>
        <details :open="expandedFilters.overseas" @toggle="expandedFilters.overseas = ($event.target as HTMLDetailsElement).open"><summary>配送方式</summary><label><input type="checkbox" :checked="overseasSelection === 'overseas'" @change="selectOverseas(($event.target as HTMLInputElement).checked ? 'overseas' : 'all')" />仅海外直邮</label></details>
        <details :open="expandedFilters.price" @toggle="expandedFilters.price = ($event.target as HTMLDetailsElement).open"><summary>价格范围 · USDT</summary><form class="price-inputs" @submit.prevent="applyToUrl(true)"><input :value="priceTexts.minPrice" type="text" inputmode="decimal" autocomplete="off" placeholder="最低" aria-label="最低价格" @input="updatePrice('minPrice', ($event.target as HTMLInputElement).value)" /><span>–</span><input :value="priceTexts.maxPrice" type="text" inputmode="decimal" autocomplete="off" placeholder="最高" aria-label="最高价格" @input="updatePrice('maxPrice', ($event.target as HTMLInputElement).value)" /><button type="submit" class="catalog-sr-only" tabindex="-1">应用筛选</button></form></details>
        <button type="button" class="primary full" @click="applyToUrl(true)">应用筛选<UmIcon name="arrow" /></button>
      </aside>
      </FocusScope>
      <div class="catalog-content">
        <V47CatalogCategories :roots="catalogCategories" :selected-id="filter.categoryId" @select="router.push(categoryLocation($event))" />
        <div class="catalog-toolbar" aria-label="搜索结果与排序"><span>{{ loading ? '正在加载…' : loadError ? '读取失败' : '共 ' }}<template v-if="!loading && !loadError"><b>{{ total }}</b> 件精选商品</template></span><div><button ref="filterTrigger" type="button" class="filter-button outline" :aria-expanded="filterOpen" @click="openFilters"><UmIcon name="filter" />筛选</button><select aria-label="商品排序" :value="filter.sort" @change="selectSort(($event.target as HTMLSelectElement).value)"><option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div></div>
        <div v-if="filter.categoryId || filter.aftersaleType || filter.overseasCustoms" class="active-filters" role="group" aria-label="已选筛选条件"><button v-if="filter.categoryId" type="button" aria-label="清除商品分类筛选" :title="`清除分类：${categoryLabel}`" @click="clearCategory">{{ categoryLabel }} ×</button><button v-if="filter.aftersaleType" type="button" aria-label="清除售后服务筛选" @click="selectAftersale('all')">{{ aftersaleOptions.find(option => option.value === filter.aftersaleType)?.label }} ×</button><button v-if="filter.overseasCustoms" type="button" aria-label="清除海外直邮筛选" @click="selectOverseas('all')">海外直邮 ×</button><button v-if="categoryError && !categoryLoading" type="button" @click="loadCategoryPath(true)">重试分类名称</button></div>
        <section ref="feedRoot" class="catalog-results product-feed" :aria-busy="loading" aria-label="商品列表">
          <span v-if="loading" class="catalog-sr-only" role="status">正在加载商品</span>
          <div v-if="loading && !list.length" class="product-grid feed-grid" aria-hidden="true"><div v-for="index in 8" :key="index" class="product-skeleton"><Skeleton class="aspect-square w-full rounded-[9px]" /><div class="skeleton-info"><Skeleton class="h-4 w-3/4" /><Skeleton class="h-4 w-1/2" /><Skeleton class="mt-3 h-6 w-2/5" /></div></div></div>
          <div v-else-if="list.length" class="product-grid feed-grid" :class="{ 'is-updating': loading && !appending }"><ProductCard v-for="product in visibleProducts" :key="product.id" :product="product" variant="catalog" :favorite-handler="visualFixture ? ignoreVisualFavorite : undefined" /></div>
          <div v-else class="empty"><UmIcon name="search" /><h2>{{ loadError || '暂时没有找到匹配商品' }}</h2><p>{{ loadError ? '请稍后重试。' : '不妨换一个方向，发现新的喜欢。' }}</p><button type="button" class="primary" @click="loadError ? load() : resetFilters()">{{ loadError ? '重新加载' : '重置筛选' }}</button></div>
          <div v-if="list.length && !loadError" ref="feedSentinel" class="feed-status"><template v-if="hasMoreFeed || feedError"><span aria-live="polite">已展示 {{ visibleProducts.length }} / {{ total }} 件</span><button type="button" :disabled="loading" @click="loadMoreFeed">{{ feedError ? '重新加载' : loading ? '正在加载…' : '继续浏览' }}<UmIcon name="chevron" /></button></template><span v-else role="status">已展示全部 {{ visibleProducts.length }} 件好物</span></div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.breadcrumb { flex-wrap:wrap; }
.breadcrumb a,.breadcrumb span { min-width:0; overflow-wrap:anywhere; }
.catalog-results { min-height:320px; }
.feed-grid { transition:opacity .15s; }
.feed-grid.is-updating { opacity:.55; }
.product-skeleton { overflow:hidden; background:var(--paper); border:1px solid var(--line); border-radius:13px; padding:8px 8px 0; }
.skeleton-info { padding:12px 5px 13px; display:grid; gap:6px; }
.active-filters button { max-width:100%; white-space:normal; text-align:left; }
@media (max-width:700px) {
  .catalog-filter-touch-mask { position:fixed; inset:0; z-index:69; background:transparent; }
  .filters.open { overscroll-behavior:contain; }
  .catalog-toolbar { flex-wrap:wrap; gap:10px; }
  .catalog-toolbar > span { flex:0 0 auto; max-width:100%; }
  .catalog-toolbar > div { min-width:0; max-width:100%; gap:8px; }
  .catalog-toolbar .filter-button { flex:0 0 auto; white-space:nowrap; }
  .catalog-toolbar select { min-width:0; max-width:100%; }
}
@media (prefers-reduced-motion:reduce) { .feed-grid { transition:none; } }
</style>
