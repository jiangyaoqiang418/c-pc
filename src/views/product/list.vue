<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import * as productApi from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
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

const list = ref<Api.RealProduct.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

const sortOptions = [
  { value: 'DEFAULT', label: '综合排序' },
  { value: 'SALES', label: '销量优先' },
  { value: 'NEW', label: '最新上架' },
  { value: 'PRICE_ASC', label: '价格升序' },
  { value: 'PRICE_DESC', label: '价格降序' }
];

const aftersaleOptions = [
  { value: undefined, label: '不限' },
  { value: '7day-no-reason', label: '7 天无理由' },
  { value: 'shop-warranty', label: '店铺保修' },
  { value: 'national-warranty', label: '全国联保' },
  { value: 'none', label: '无售后' }
];

function optionalQueryNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function queryPage(value: unknown) {
  const parsed = optionalQueryNumber(value);
  return parsed ? Math.max(1, Math.floor(parsed)) : 1;
}

function syncFromQuery() {
  filter.keyword = (route.query.keyword as string) || '';
  filter.categoryId = (route.query.categoryId as string) || undefined;
  filter.aftersaleType = (route.query.aftersaleType as Api.Product.AftersaleType) || undefined;
  filter.overseasCustoms = route.query.overseas === '1' ? true : undefined;
  filter.minPrice = route.query.minPrice ? optionalQueryNumber(route.query.minPrice) : undefined;
  filter.maxPrice = route.query.maxPrice ? optionalQueryNumber(route.query.maxPrice) : undefined;
  const querySort = Array.isArray(route.query.sort) ? route.query.sort[0] : route.query.sort;
  filter.sort = productApi.normalizeStorefrontSort(querySort || undefined);
  current.value = queryPage(route.query.page);
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
  syncFromQuery();
  load();
});
onBeforeUnmount(requestGuard.invalidate);

watch(
  () => route.fullPath,
  () => {
    syncFromQuery();
    load();
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
</script>

<template>
  <div class="list-page shop-container">
    <a-breadcrumb class="bread">
      <a-breadcrumb-item role="link" tabindex="0" @click="router.push('/')" @keydown.enter="router.push('/')" @keydown.space.prevent="router.push('/')">首页</a-breadcrumb-item>
      <a-breadcrumb-item>商品列表</a-breadcrumb-item>
    </a-breadcrumb>

    <div class="filter-bar">
      <div class="filter-row">
        <span class="filter-label">售后类型</span>
        <a-radio-group v-model="filter.aftersaleType" type="button" size="small" @change="applyToUrl">
          <a-radio v-for="o in aftersaleOptions" :key="o.label" :value="o.value">{{ o.label }}</a-radio>
        </a-radio-group>
      </div>
      <div class="filter-row">
        <span class="filter-label">海外过关</span>
        <a-radio-group v-model="filter.overseasCustoms" type="button" size="small" @change="applyToUrl">
          <a-radio :value="undefined">不限</a-radio>
          <a-radio :value="true">仅海外直邮</a-radio>
        </a-radio-group>
      </div>
      <div class="filter-row">
        <span class="filter-label">价格区间</span>
        <a-input-number v-model="filter.minPrice" :min="0" placeholder="USDT 最低" hide-button class="price-input" />
        <span class="price-dash">—</span>
        <a-input-number v-model="filter.maxPrice" :min="0" placeholder="USDT 最高" hide-button class="price-input" />
        <a-button size="small" @click="applyToUrl">确定</a-button>
        <a-link role="button" tabindex="0" @click="resetFilters" @keydown.enter="resetFilters" @keydown.space.prevent="resetFilters">重置</a-link>
      </div>
    </div>

    <div class="result-bar">
      <div class="result-title">{{ title }} <span class="muted">· 共 {{ total }} 件</span></div>
      <a-radio-group v-model="filter.sort" type="button" size="small" @change="applyToUrl">
        <a-radio v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</a-radio>
      </a-radio-group>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="list.length" class="shop-grid-5">
        <ProductCard v-for="p in list" :key="p.id" :product="p" />
      </div>
      <EmptyState
        v-else
        :title="loadError || '没有找到符合条件的商品'"
        :description="loadError ? '不会把请求失败误显示为没有商品。' : '尝试调整筛选条件或重置'"
        :action-text="loadError ? '重新加载' : undefined"
        @action="load"
      />
      <div v-if="total > size" class="pagination-bar">
        <a-pagination
          :total="total"
          :current="current"
          :page-size="size"
          show-total
          @change="onPageChange"
        />
      </div>
    </a-spin>
  </div>
</template>

<style scoped>
.list-page {
  padding-top: 16px;
}
.bread {
  margin-bottom: 12px;
}
.filter-bar {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 16px 20px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.filter-label {
  width: 64px;
  color: #86909c;
  font-size: 13px;
}
.price-input {
  width: 120px;
}
.price-dash {
  color: #86909c;
}
.result-bar {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 12px 20px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.result-title {
  font-size: 14px;
  font-weight: 500;
  color: #1d2129;
}
.muted {
  color: #86909c;
  font-weight: 400;
  margin-left: 8px;
}
.pagination-bar {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>
