<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import ProductCard from '@/components/product/product-card.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchBrandsPage, fetchBrandDetail } from '@/service/api/brand';
import { fetchStorefrontProducts } from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';
import coatImage from '@/assets/images/v47-brand/coat.jpg';

const route = useRoute();
const router = useRouter();
const brands = ref<Api.RealBrand.BrandDTO[]>([]);
const selected = ref<Api.RealBrand.BrandDTO>();
const brandId = computed(() => scalar(route.query.brandId));
const keyword = ref('');
const brandLoading = ref(false);
const brandError = ref('');
const brandTotal = ref(0);
const brandPage = ref(1);
const brandPageSize = ref(20);
const products = ref<Api.RealProduct.Record[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(20);
const total = ref(0);
const brandGuard = createLatestRequestGuard();
const productGuard = createLatestRequestGuard();
const tabs = computed(() => selected.value && !brands.value.some(item => String(item.id) === String(selected.value?.id))
  ? [selected.value, ...brands.value] : brands.value);
function scalar(value: unknown) { return typeof value === 'string' ? value : ''; }
function pageNumber(value: unknown) { const page = Number(scalar(value)); return Number.isSafeInteger(page) && page > 0 ? page : 1; }

async function loadBrands() {
  const isCurrent = brandGuard.begin();
  brandLoading.value = true;
  brandError.value = '';
  brands.value = [];
  brandTotal.value = 0;
  try {
    const page = await fetchBrandsPage({ current: brandPage.value, size: brandPageSize.value, keyword: scalar(route.query.keyword), signal: isCurrent.signal });
    if (!isCurrent()) return;
    brandPageSize.value = page.size;
    const maxPage = Math.max(1, Math.ceil(page.total / page.size));
    if (brandPage.value > maxPage) {
      await router.replace({ query: { ...route.query, brandPage: maxPage > 1 ? String(maxPage) : undefined } });
      return;
    }
    brands.value = page.records;
    brandTotal.value = page.total;
  } catch {
    if (isCurrent()) brandError.value = '品牌目录加载失败，请稍后重试';
  } finally {
    if (isCurrent()) brandLoading.value = false;
  }
}

async function loadProducts() {
  const isCurrent = productGuard.begin();
  loading.value = true;
  loadError.value = '';
  selected.value = undefined;
  products.value = [];
  total.value = 0;
  const id = brandId.value;
  try {
    if (id) {
      const brand = await fetchBrandDetail(id, { signal: isCurrent.signal });
      if (!isCurrent()) return;
      selected.value = brand;
    }
    const page = await fetchStorefrontProducts({ current: current.value, size: pageSize.value, brandId: id || undefined, signal: isCurrent.signal });
    if (!isCurrent()) return;
    pageSize.value = page.size;
    const maxPage = Math.max(1, Math.ceil(page.total / page.size));
    if (current.value > maxPage) {
      await router.replace({ query: { ...route.query, page: maxPage > 1 ? String(maxPage) : undefined } });
      return;
    }
    products.value = page.records;
    total.value = page.total;
  } catch {
    if (isCurrent()) loadError.value = id && !selected.value ? '该品牌已停用或暂时无法访问' : '品牌商品加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function chooseBrand(id?: Api.RealBrand.Id) {
  void router.push({ query: { ...route.query, brandId: id === undefined ? undefined : String(id), page: undefined } });
}
function searchBrands() {
  if (scalar(route.query.keyword) === keyword.value.trim() && brandPage.value === 1) void loadBrands();
  else void router.push({ query: { ...route.query, keyword: keyword.value.trim() || undefined, brandPage: undefined, brandId: undefined, page: undefined } });
}
function changeBrandPage(page: number) { void router.push({ query: { ...route.query, brandPage: page > 1 ? String(page) : undefined } }); }
function changePage(page: number) { void router.push({ query: { ...route.query, page: page > 1 ? String(page) : undefined } }); }
function exploreBrand() { void router.push({ path: '/product/list', query: { brandId: selected.value ? String(selected.value.id) : undefined } }); }

watch([() => route.query.keyword, () => route.query.brandPage], () => {
  keyword.value = scalar(route.query.keyword);
  brandPage.value = pageNumber(route.query.brandPage);
  void loadBrands();
}, { immediate: true });
watch([() => route.query.brandId, () => route.query.page], () => {
  current.value = pageNumber(route.query.page);
  void loadProducts();
}, { immediate: true });
onBeforeUnmount(() => { brandGuard.invalidate(); productGuard.invalidate(); });
</script>

<template>
  <div class="brand-page">
    <form class="brand-search" role="search" @submit.prevent="searchBrands"><input v-model="keyword" class="table-search" type="search" aria-label="搜索品牌名称" placeholder="搜索品牌名称" /><button type="submit" class="outline" :disabled="brandLoading">搜索</button></form>
    <div class="brand-tabs" :aria-busy="brandLoading"><span>探索品牌</span><button type="button" :class="{ active: !brandId }" :aria-pressed="!brandId" @click="chooseBrand()">全部</button><button v-for="item in tabs" :key="item.id" type="button"
      :class="{ active: brandId === String(item.id) }" :aria-pressed="brandId === String(item.id)" @click="chooseBrand(item.id)">{{ item.name }}</button></div>
    <div v-if="brandError" class="brand-feedback" role="alert"><p>{{ brandError }}</p><button type="button" class="outline" @click="loadBrands">重新加载品牌</button></div>
    <BusinessPagination v-if="brandTotal > brandPageSize && !brandLoading && !brandError" :total="brandTotal" :current="brandPage" :page-size="brandPageSize" @change="changeBrandPage" />
    <section class="brand-hero">
      <div><span class="eyebrow">THE BRAND EDIT</span><h1>{{ selected?.name || (brandId ? '品牌精选' : '永不过时的，好品味。') }}</h1>
        <p>以经典格调，书写你的日常。</p><button type="button" class="gold" :disabled="loading || (!!brandId && !selected)" @click="exploreBrand">探索品牌精选 <UmIcon name="arrow" /></button>
      </div><img :src="coatImage" alt="秋日服饰精选" />
    </section>
    <section class="brand-products" :aria-busy="loading" aria-label="品牌精选商品"><div v-if="loading" class="product-grid" aria-label="正在读取品牌商品" role="status"><Skeleton v-for="n in 4" :key="n" class="brand-product-skeleton" /></div><div v-else-if="loadError" class="empty"><UmIcon name="bag" /><h2>{{ loadError }}</h2><button type="button" class="primary" @click="loadProducts">重新加载</button><button v-if="brandId" type="button" class="text-link" @click="chooseBrand()">探索其他品牌</button></div><template v-else-if="brandTotal || selected"><div class="catalog-toolbar"><span>共 <b>{{ total }}</b> 件精选商品</span></div><div v-if="products.length" class="product-grid"><ProductCard v-for="product in products" :key="product.id" :product="product" variant="catalog" /></div><div v-else class="empty"><UmIcon name="search" /><h2>暂时没有找到匹配商品</h2><p>不妨换一个方向，发现新的喜欢。</p><button type="button" class="primary" @click="chooseBrand()">探索其他品牌</button></div><BusinessPagination v-if="total > pageSize" :total="total" :current="current" :page-size="pageSize" @change="changePage" /></template><div v-else-if="!brandLoading && !brandError" class="empty brand-unavailable" role="status"><UmIcon name="bag" /><h2>{{ keyword ? '没有找到相关品牌' : '品牌专区暂未开放' }}</h2><p>{{ keyword ? '换个品牌名称试试。' : '正式品牌发布后将在这里展示。' }}</p><button type="button" class="primary" @click="keyword ? router.push('/brand') : router.push('/product/list')">{{ keyword ? '查看全部品牌' : '探索全部商品' }}<UmIcon name="arrow" /></button></div></section>
  </div>
</template>

<style scoped>
.brand-unavailable { margin-top: 24px; }
.brand-search { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.brand-search input { min-width:0; flex:1; max-width:480px; }
.brand-search button { flex-shrink:0; }
.brand-feedback { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:16px 0; }
.brand-product-skeleton { width:100%; aspect-ratio:3/4; border-radius:9px; }
.brand-products .empty > .text-link { margin-top:12px; }
.brand-tabs { overflow-x: auto; scrollbar-width: none; }
.brand-tabs > button { flex-shrink: 0; }
:root[data-ui-palette="web3-meme"] .brand-hero:after { background:linear-gradient(90deg,#181421 40%,transparent 70%); }
@media (max-width:700px) {
  .brand-hero { height:auto; min-height:295px; }
  .brand-hero h1 { overflow-wrap:anywhere; }
  .brand-tabs { margin-right:-14px; padding-right:14px; }
  :root[data-ui-theme="web3-meme"] .brand-tabs { margin-right:-12px; padding-right:12px; }
  :root[data-ui-palette="web3-meme"] .brand-hero:after { background:linear-gradient(90deg,color-mix(in srgb,#181421 90.196%,transparent),color-mix(in srgb,#181421 25.098%,transparent)); }
}
</style>
