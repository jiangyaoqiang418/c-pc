<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import * as productApi from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@iconify/vue';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();

const filter = reactive({
  keyword: '',
  categoryId: undefined as string | undefined,
  aftersaleType: undefined as Api.Product.AftersaleType | undefined,
  overseasCustoms: undefined as boolean | undefined,
  minPrice: undefined as number | undefined,
  maxPrice: undefined as number | undefined,
  sort: 'DEFAULT' as productApi.StorefrontSort
});

const expandedFilters = reactive({ aftersale: true, overseas: true, price: true });
const list = ref<Api.RealProduct.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

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

function optionalQueryNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function syncFromQuery() {
  filter.keyword = (route.query.keyword as string) || '';
  filter.categoryId = (route.query.categoryId as string) || undefined;
  const rawAftersaleType = Array.isArray(route.query.aftersaleType) ? route.query.aftersaleType[0] : route.query.aftersaleType;
  const validAftersaleType = typeof rawAftersaleType === 'string'
    && aftersaleOptions.some(option => option.value !== 'all' && option.value === rawAftersaleType);
  filter.aftersaleType = validAftersaleType ? rawAftersaleType as Api.Product.AftersaleType : undefined;
  const rawOverseas = route.query.overseas;
  const validOverseas = rawOverseas === undefined || rawOverseas === '1';
  filter.overseasCustoms = rawOverseas === '1' ? true : undefined;
  const rawMinPrice = Array.isArray(route.query.minPrice) ? route.query.minPrice[0] : route.query.minPrice;
  const rawMaxPrice = Array.isArray(route.query.maxPrice) ? route.query.maxPrice[0] : route.query.maxPrice;
  const minPrice = typeof rawMinPrice === 'string' ? optionalQueryNumber(rawMinPrice) : undefined;
  const maxPrice = typeof rawMaxPrice === 'string' ? optionalQueryNumber(rawMaxPrice) : undefined;
  filter.minPrice = minPrice;
  filter.maxPrice = maxPrice;
  const querySort = Array.isArray(route.query.sort) ? route.query.sort[0] : route.query.sort;
  filter.sort = productApi.normalizeStorefrontSort(querySort || undefined);
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  const validPage = Number.isSafeInteger(page) && page > 0;
  current.value = validPage ? page : 1;
  return Array.isArray(route.query.sort)
    || (querySort !== undefined && querySort !== filter.sort)
    || (route.query.aftersaleType !== undefined && (Array.isArray(route.query.aftersaleType) || !validAftersaleType))
    || (Array.isArray(rawOverseas) || !validOverseas)
    || (route.query.minPrice !== undefined && (Array.isArray(route.query.minPrice) || minPrice === undefined))
    || (route.query.maxPrice !== undefined && (Array.isArray(route.query.maxPrice) || maxPrice === undefined))
    || (route.query.page !== undefined && (Array.isArray(route.query.page) || !validPage));
}

async function load() {
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const r = await productApi.fetchStorefrontProducts({
      current: current.value,
      size: size.value,
      keyword: filter.keyword || undefined,
      categoryId: filter.categoryId || undefined,
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
    if (current.value > maxPage) {
      current.value = maxPage;
      updateUrl(true);
      return;
    }
    list.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '商品列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function updateUrl(replace: boolean) {
  const before = route.fullPath;
  const location = {
    name: 'product-list',
    query: {
      keyword: filter.keyword || undefined,
      categoryId: filter.categoryId ? String(filter.categoryId) : undefined,
      aftersaleType: filter.aftersaleType,
      overseas: filter.overseasCustoms ? '1' : undefined,
      minPrice: filter.minPrice !== undefined ? String(filter.minPrice) : undefined,
      maxPrice: filter.maxPrice !== undefined ? String(filter.maxPrice) : undefined,
      sort: filter.sort,
      page: current.value === 1 ? undefined : String(current.value)
    }
  };
  void (replace ? router.replace(location) : router.push(location)).then(() => {
    if (route.fullPath === before) void load();
  });
}

function applyToUrl() {
  if ([filter.minPrice, filter.maxPrice].some(price => price != null && (!Number.isFinite(price) || price < 0))) {
    Message.warning('请输入有效的非负价格');
    return;
  }
  if (filter.minPrice != null && filter.maxPrice != null && filter.minPrice > filter.maxPrice) {
    Message.warning('最低价格不能高于最高价格');
    return;
  }
  current.value = 1;
  updateUrl(false);
}

function resetFilters() {
  filter.aftersaleType = undefined;
  filter.overseasCustoms = undefined;
  filter.minPrice = undefined;
  filter.maxPrice = undefined;
  current.value = 1;
  applyToUrl();
}

onMounted(() => {
  if (syncFromQuery()) updateUrl(true);
  else load();
});
onBeforeUnmount(requestGuard.invalidate);

watch(
  () => route.fullPath,
  () => {
    if (syncFromQuery()) updateUrl(true);
    else load();
  }
);

const title = computed(() => {
  if (filter.keyword) return `搜索：「${filter.keyword}」`;
  if (filter.categoryId) return `分类筛选`;
  return '全部商品';
});

function onPageChange(p: number) {
  current.value = p;
  updateUrl(false);
}

function updatePrice(bound: 'minPrice' | 'maxPrice', value: string | number) {
  filter[bound] = String(value).trim() === '' ? undefined : Number(value);
}

function selectAftersale(value: string) {
  aftersaleSelection.value = value;
  applyToUrl();
}

function selectOverseas(value: string) {
  overseasSelection.value = value;
  applyToUrl();
}

function selectSort(value: string) {
  if (!sortOptions.some(option => option.value === value)) return;
  filter.sort = value as productApi.StorefrontSort;
  applyToUrl();
}
</script>

<template>
  <div class="list-page shop-container">
    <nav class="bread" aria-label="当前位置">
      <RouterLink to="/">首页</RouterLink><Icon icon="lucide:chevron-right" width="14" /><span aria-current="page">商品列表</span>
    </nav>
    <div class="catalog-layout">
    <aside class="filter-bar" aria-label="商品筛选">
      <header class="filter-heading"><h1>筛选商品</h1><Button variant="ghost" size="sm" @click="resetFilters">重置</Button></header>
      <div class="filter-row">
        <button type="button" class="filter-label filter-toggle" id="aftersale-filter-label" :aria-expanded="expandedFilters.aftersale" aria-controls="aftersale-filter-options" @click="expandedFilters.aftersale = !expandedFilters.aftersale">售后类型<span aria-hidden="true">{{ expandedFilters.aftersale ? '−' : '+' }}</span></button>
        <div v-show="expandedFilters.aftersale" id="aftersale-filter-options" class="filter-options" role="group" aria-labelledby="aftersale-filter-label">
          <label v-for="option in aftersaleOptions" :key="option.value" class="filter-choice">
            <input type="radio" name="aftersale" :value="option.value" :checked="aftersaleSelection === option.value" @change="selectAftersale(option.value)" />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>
      <div class="filter-row">
        <button type="button" class="filter-label filter-toggle" id="overseas-filter-label" :aria-expanded="expandedFilters.overseas" aria-controls="overseas-filter-options" @click="expandedFilters.overseas = !expandedFilters.overseas">海外过关<span aria-hidden="true">{{ expandedFilters.overseas ? '−' : '+' }}</span></button>
        <div v-show="expandedFilters.overseas" id="overseas-filter-options" class="filter-options" role="group" aria-labelledby="overseas-filter-label">
          <label class="filter-choice"><input type="radio" name="overseas" :checked="overseasSelection === 'all'" @change="selectOverseas('all')" /><span>不限</span></label>
          <label class="filter-choice"><input type="radio" name="overseas" :checked="overseasSelection === 'overseas'" @change="selectOverseas('overseas')" /><span>仅海外直邮</span></label>
        </div>
      </div>
      <form class="filter-row price-filter" @submit.prevent="applyToUrl">
        <button type="button" class="filter-label filter-toggle" :aria-expanded="expandedFilters.price" aria-controls="price-filter-options" @click="expandedFilters.price = !expandedFilters.price">价格区间（USDT）<span aria-hidden="true">{{ expandedFilters.price ? '−' : '+' }}</span></button>
        <div v-show="expandedFilters.price" id="price-filter-options" class="price-range">
        <Input :model-value="filter.minPrice" type="number" min="0" step="any" aria-label="最低价格（USDT）" placeholder="USDT 最低" class="price-input" @update:model-value="updatePrice('minPrice', $event)" />
        <span class="price-dash" aria-hidden="true">—</span>
        <Input :model-value="filter.maxPrice" type="number" min="0" step="any" aria-label="最高价格（USDT）" placeholder="USDT 最高" class="price-input" @update:model-value="updatePrice('maxPrice', $event)" />
        </div>
        <Button v-show="expandedFilters.price" type="submit" variant="outline" size="sm">应用筛选</Button>
      </form>
    </aside>
    <div class="catalog-main">

    <section class="result-bar" aria-label="搜索结果与排序">
      <div class="result-title">{{ title }} <span class="muted">{{ loading ? '正在加载…' : loadError ? '读取失败' : `共 ${total} 件精选商品` }}</span></div>
      <select class="sort-select" aria-label="商品排序" :value="filter.sort" @change="selectSort(($event.target as HTMLSelectElement).value)">
        <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </section>

    <section class="catalog-results" :aria-busy="loading" aria-label="商品列表">
      <span v-if="loading" class="sr-only" role="status">正在加载商品</span>
      <div v-if="loading && !list.length" class="catalog-grid" aria-hidden="true">
        <div v-for="index in 8" :key="index" class="product-skeleton">
          <Skeleton class="aspect-square w-full rounded-none" />
          <div class="skeleton-info"><Skeleton class="h-4 w-3/4" /><Skeleton class="h-4 w-1/2" /><Skeleton class="mt-3 h-6 w-2/5" /></div>
        </div>
      </div>
      <div v-else-if="list.length" class="catalog-grid" :class="{ 'is-updating': loading }">
        <ProductCard v-for="product in list" :key="product.id" :product="product" />
      </div>
      <EmptyState
        v-else
        :title="loadError || '没有找到符合条件的商品'"
        :description="loadError ? '请稍后重试。' : '尝试调整筛选条件，或使用顶部搜索重新查找。'"
        :action-text="loadError ? '重新加载' : undefined"
        @action="load"
      />
      <BusinessPagination v-if="total > size" class="pagination-bar" :total="total" :current="current" :page-size="size" :loading="loading" @change="onPageChange" />
    </section>
    </div>
    </div>
  </div>
</template>

<style scoped>
.filter-toggle { display:flex; justify-content:space-between; width:100%; text-align:left; cursor:pointer; }
.filter-toggle:focus-visible { outline:2px solid var(--yb-primary); outline-offset:4px; }
.sort-select { padding:8px 32px 8px 12px; border:1px solid var(--yb-hairline); border-radius:4px; background:var(--yb-paper); font:inherit; font-size:13px; color:var(--yb-ink); }
.catalog-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 32px; align-items: start; }
.catalog-main { min-width: 0; }
.list-page .filter-bar { position: sticky; top: 170px; padding:20px; border:1px solid var(--yb-hairline); border-radius:6px; background:var(--yb-paper); gap: 0; }
.filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.filter-heading h1 { font-size: 15px; font-weight: 600; }
.filter-heading button { font-size: 12px; padding: 0; height: 30px; color: var(--yb-muted); }
.list-page .filter-row { display: grid; gap: 16px; padding:18px 0; border-top: 1px solid var(--yb-hairline); }
.list-page .filter-label { width: auto; color: var(--yb-ink); font-size: 14px; font-weight: 600; }
.list-page .filter-options { display: grid; gap: 6px; }
.filter-choice { display: flex; align-items: center; gap: 10px; color: var(--yb-muted); font-size: 13px; cursor: pointer; }
.filter-choice input { width: 14px; height: 14px; accent-color: var(--yb-primary); }
.filter-choice:has(input:checked) { color: var(--yb-ink); }
.price-range { display: flex; align-items: center; gap: 7px; min-width: 0; }
.list-page .price-input { width: 0; flex: 1; height: 38px; min-width: 0; padding: 8px; font-size: 12px; }
.list-page .price-filter > button { width: 100%; }
.list-page .result-title { font-size: 14px; font-weight: 600; }
.list-page .muted { font-size: 12px; }
.list-page .catalog-grid { gap: 24px 16px; }
@media (max-width: 1100px) { .catalog-layout { grid-template-columns: 180px minmax(0, 1fr); gap: 24px; } }
@media (max-width: 800px) {
  .catalog-layout { grid-template-columns: minmax(0, 1fr); }
  .list-page .filter-bar { position: static; border-right: 0; padding: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .filter-heading { grid-column: 1 / -1; }
}
.list-page { margin-top:-8px; padding-top: 0; padding-bottom: 48px; }
.bread { display:flex; align-items:center; gap:10px; margin-bottom:12px; color: var(--yb-muted); font-size: 12px; }
.bread a:hover { color: var(--yb-primary); }
.bread [aria-current] { color: var(--yb-ink); }
.catalog-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.eyebrow { color: var(--yb-muted); font-size: 11px; letter-spacing: .14em; }
.catalog-heading h1 { margin-top: 8px; font-size: 28px; font-weight: 650; letter-spacing: -.5px; }
.catalog-heading p { color: var(--yb-muted); font-size: 14px; }
.filter-bar { background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 12px; padding: 22px 24px; margin-bottom: 24px; display: grid; gap: 16px; }
.filter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.filter-label { width: 76px; flex-shrink: 0; color: var(--yb-muted); font-size: 14px; }
.filter-options { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.price-input { width: 144px; height: 36px; }
.price-dash { color: var(--yb-muted); }
.result-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 22px; }
.result-title { min-width: 0; overflow-wrap: anywhere; font-size: 16px; font-weight: 600; color: var(--yb-ink); }
.muted { font-size: 13px; color: var(--yb-muted); font-weight: 400; margin-left: 12px; }
.catalog-results { min-height: 320px; }
.catalog-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; transition: opacity 150ms; }
.catalog-grid.is-updating { opacity: .55; }
.product-skeleton { overflow: hidden; background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 12px; }
.skeleton-info { padding: 20px; display: grid; gap: 10px; }
.pagination-bar { margin-top: 36px; }
@media (max-width: 1100px) {
  .catalog-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
  .result-bar { align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .catalog-grid { transition:none; }
}
</style>
