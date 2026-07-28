<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { productApi } from '@shared';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const router = useRouter();
const route = useRoute();

const filter = reactive({
  keyword: '',
  categoryId: undefined as number | undefined,
  aftersaleType: undefined as Api.Product.AftersaleType | undefined,
  overseasCustoms: undefined as boolean | undefined,
  minPrice: undefined as number | undefined,
  maxPrice: undefined as number | undefined,
  sort: 'sales' as 'sales' | 'price-asc' | 'price-desc' | 'newest' | 'reviews'
});

const list = ref<Api.Product.ProductRecord[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);

const sortOptions = [
  { value: 'sales', label: '综合销量' },
  { value: 'newest', label: '最新上架' },
  { value: 'price-asc', label: '价格升序' },
  { value: 'price-desc', label: '价格降序' },
  { value: 'reviews', label: '收藏多' }
];

const aftersaleOptions = [
  { value: undefined, label: '不限' },
  { value: '7day-no-reason', label: '7 天无理由' },
  { value: 'shop-warranty', label: '店铺保修' },
  { value: 'national-warranty', label: '全国联保' },
  { value: 'none', label: '无售后' }
];

function syncFromQuery() {
  filter.keyword = (route.query.keyword as string) || '';
  filter.categoryId = route.query.categoryId ? Number(route.query.categoryId) : undefined;
  filter.aftersaleType = (route.query.aftersaleType as Api.Product.AftersaleType) || undefined;
  filter.overseasCustoms = route.query.overseas === '1' ? true : undefined;
  filter.minPrice = route.query.minPrice ? Number(route.query.minPrice) : undefined;
  filter.maxPrice = route.query.maxPrice ? Number(route.query.maxPrice) : undefined;
  filter.sort = (route.query.sort as typeof filter.sort) || 'sales';
  current.value = route.query.page ? Number(route.query.page) : 1;
}

async function load() {
  loading.value = true;
  try {
    const r = await productApi.fetchProductList({
      current: current.value,
      size: size.value,
      keyword: filter.keyword || undefined,
      categoryId: filter.categoryId,
      aftersaleType: filter.aftersaleType,
      overseasCustoms: filter.overseasCustoms,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      sort: filter.sort
    });
    list.value = r.records;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}

function applyToUrl() {
  router.push({
    name: 'product-list',
    query: {
      keyword: filter.keyword || undefined,
      categoryId: filter.categoryId ? String(filter.categoryId) : undefined,
      aftersaleType: filter.aftersaleType,
      overseas: filter.overseasCustoms ? '1' : undefined,
      minPrice: filter.minPrice ? String(filter.minPrice) : undefined,
      maxPrice: filter.maxPrice ? String(filter.maxPrice) : undefined,
      sort: filter.sort,
      page: current.value === 1 ? undefined : String(current.value)
    }
  });
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
  applyToUrl();
}
</script>

<template>
  <div class="list-page shop-container">
    <a-breadcrumb class="bread">
      <a-breadcrumb-item @click="router.push('/')">首页</a-breadcrumb-item>
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
        <a-input-number v-model="filter.minPrice" :min="0" placeholder="¥ 最低" hide-button class="price-input" />
        <span class="price-dash">—</span>
        <a-input-number v-model="filter.maxPrice" :min="0" placeholder="¥ 最高" hide-button class="price-input" />
        <a-button size="small" @click="applyToUrl">确定</a-button>
        <a-link @click="resetFilters">重置</a-link>
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
      <EmptyState v-else title="没有找到符合条件的商品" description="尝试调整筛选条件或重置" />
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
