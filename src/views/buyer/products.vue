<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@iconify/vue';
import CategoryPicker from '@/components/common/category-picker.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import BuyerProductCard from '@/components/buyer/buyer-product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as productApi from '@/service/api/product';
import * as realBuyerApi from '@/service/api/buyer';
import { fetchRealCategoryTree } from '@/service/api/category';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  status?: Api.Product.ProductStatus;
  shelf?: Api.Product.ShelfStatus;
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'on-shelf', label: '在售', status: 'NORMAL', shelf: 'on-shelf' },
  { key: 'pending', label: '待审核', status: 'PENDING_AUDIT' },
  { key: 'in-audit', label: '审核中', status: 'IN_AUDIT' },
  { key: 'rejected', label: '审核驳回', status: 'REJECTED' },
  { key: 'off-shelf', label: '已下架', status: 'NORMAL', shelf: 'off-shelf' },
  { key: 'frozen', label: '已冻结', status: 'FROZEN' }
];

const activeKey = ref('all');
const products = ref<Api.RealProduct.Record[]>([]);
const loading = ref(false);
const loadError = ref('');
const keyword = ref('');
const categoryId = ref<string | number>();
const focusedProductId = ref<string>();
const categoryOptions = ref<Array<{ value: string | number; label: string; children?: any[] }>>([]);
const categoryLoading = ref(false);
const current = ref(1);
const size = ref(12);
const total = ref(0);
const shelvingId = ref<string | number>();
const deletingId = ref<string | number>();
const priceProduct = ref<Api.RealProduct.Record>();
const priceVisible = ref(false);
const newPrice = ref('');
const priceSaving = ref(false);
const requestGuard = createLatestRequestGuard();
const categoryGuard = createLatestRequestGuard();
let writeVersion = 0;
let syncingQuery = false;

function syncFromQuery() {
  syncingQuery = true;
  const value = (key: string) => {
    const raw = route.query[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  activeKey.value = TABS.some(tab => tab.key === value('tab')) ? value('tab')! : 'all';
  keyword.value = value('keyword') || '';
  categoryId.value = value('categoryId') || undefined;
  focusedProductId.value = value('productId') || undefined;
  const page = Number(value('page'));
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  syncingQuery = false;
  const rawTab = route.query.tab;
  return rawTab !== undefined && (Array.isArray(rawTab) || !TABS.some(tab => tab.key === rawTab));
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  const query = { ...route.query, tab: activeKey.value === 'all' ? undefined : activeKey.value,
    keyword: keyword.value.trim() || undefined, categoryId: categoryId.value === undefined || categoryId.value === '' ? undefined : String(categoryId.value),
    productId: focusedProductId.value, page: current.value > 1 ? String(current.value) : undefined };
  void (replace ? router.replace({ query }) : router.push({ query })).then(() => {
    if (route.fullPath === before) void load();
  });
}

function mapCategoryOptions(nodes: Api.RealCategory.CategoryNodeDTO[]): Array<{ value: string | number; label: string; children?: any[] }> {
  return nodes.map(node => ({
    value: node.id,
    label: node.name,
    children: node.children?.length ? mapCategoryOptions(node.children) : undefined
  }));
}

async function load() {
  const isCurrent = requestGuard.begin();
  if (!userStore.currentUser) {
    loading.value = false;
    products.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await productApi.fetchMyProducts({
      current: current.value,
      size: size.value,
      keyword: keyword.value.trim() || undefined,
      categoryId: categoryId.value === '' ? undefined : categoryId.value,
      status: tab?.status,
      shelf: tab?.shelf,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      // 仅回退一次到后端报告的最后有效页，避免超大页码造成空列表或重复请求。
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    let records = r.records;
    if (focusedProductId.value && !records.some(item => String(item.id) === focusedProductId.value)) {
      try {
        const focused = await productApi.fetchSellerProductDetail(focusedProductId.value, { signal: isCurrent.signal });
        if (!isCurrent()) return;
        records = [focused, ...records].slice(0, size.value);
      } catch {
        if (!isCurrent()) return;
        Message.warning('已进入商品管理，但暂时无法定位通知对应商品');
      }
    }
    products.value = records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    products.value = [];
    total.value = 0;
    loadError.value = '商品列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadCategories() {
  const isCurrent = categoryGuard.begin();
  categoryLoading.value = true;
  try {
    const next = await fetchRealCategoryTree({ signal: isCurrent.signal, onlyWithProduct: false });
    if (isCurrent()) categoryOptions.value = mapCategoryOptions(next);
  } catch {
    if (!isCurrent()) return;
    categoryOptions.value = [];
    Message.warning('商品分类加载失败，可先按名称查询商品');
  } finally {
    if (isCurrent()) categoryLoading.value = false;
  }
}

function queryProducts() {
  focusedProductId.value = undefined;
  current.value = 1;
  syncQuery();
}

function resetFilters() {
  focusedProductId.value = undefined;
  keyword.value = '';
  categoryId.value = undefined;
  queryProducts();
}

onMounted(() => {
  const hasInvalidQuery = syncFromQuery();
  void loadCategories();
  if (hasInvalidQuery) syncQuery(true);
  else void load();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
  categoryGuard.invalidate();
});
watch(activeKey, () => {
  if (syncingQuery) return;
  focusedProductId.value = undefined;
  current.value = 1;
  syncQuery();
}, { flush: 'sync' });
watch(() => route.fullPath, () => {
  if (syncFromQuery()) {
    syncQuery(true);
    return;
  }
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  requestGuard.invalidate();
  shelvingId.value = undefined;
  deletingId.value = undefined;
  priceVisible.value = false;
  priceProduct.value = undefined;
  priceSaving.value = false;
  products.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  syncQuery(true);
});

async function toggleShelf(p: Api.RealProduct.Record) {
  if (priceSaving.value || shelvingId.value !== undefined || deletingId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const productId = p.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  const nextOnShelf = p.shelfStatus !== 'on-shelf';
  shelvingId.value = productId;
  try {
    if (nextOnShelf) {
      const depositSummary = await realBuyerApi.fetchBuyerDepositSummary({ showError: false });
      if (!isCurrentWrite()) return;
      if (!depositSummary.listable) {
        Message.warning('当前保证金不足，暂不能上架，请先处理保证金');
        void router.push('/buyer/deposit');
        return;
      }
    }
    await productApi.toggleProductShelf(productId, nextOnShelf);
    if (!isCurrentWrite()) return;
    Message.success(nextOnShelf ? '已上架' : '已下架');
    await load();
  } catch (error) {
    if (isCurrentWrite()) Message.error(error instanceof Error ? error.message : nextOnShelf ? '上架失败，请稍后重试' : '下架失败，请稍后重试');
  } finally {
    if (operation === writeVersion) shelvingId.value = undefined;
  }
}

async function deleteProduct(p: Api.RealProduct.Record) {
  if (priceSaving.value || deletingId.value !== undefined || shelvingId.value !== undefined) return;
  if (p.shelfStatus === 'on-shelf') {
    Message.warning('请先下架商品后再删除');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const productId = p.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  deletingId.value = productId;
  try {
    await productApi.deleteProduct(productId);
    if (!isCurrentWrite()) return;
    Message.success('商品已删除');
    await load();
  } catch {
    // 请求层已展示后端业务提示。
  } finally {
    if (operation === writeVersion) deletingId.value = undefined;
  }
}

function openPrice(p: Api.RealProduct.Record) {
  if (priceSaving.value || shelvingId.value !== undefined || deletingId.value !== undefined) return;
  if (p.rawStatus !== 'ON_SALE' && p.rawStatus !== 'OFF_SHELF') return;
  priceProduct.value = p;
  newPrice.value = String(p.price);
  priceVisible.value = true;
}

async function savePrice() {
  const p = priceProduct.value;
  const userId = userStore.currentUser?.id;
  if (!p || userId === undefined || priceSaving.value) return;
  const value = newPrice.value.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(value) || !/[1-9]/.test(value)) {
    Message.warning('请输入大于 0 的价格，最多 8 位小数');
    return;
  }
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  priceSaving.value = true;
  try {
    await productApi.changeProductPrice(p.id, value);
    if (!isCurrent()) return;
    priceVisible.value = false;
    Message.success('价格已更新');
    await load();
  } catch {
    // 请求层展示后端错误，保留输入供用户修正。
  } finally {
    if (isCurrent()) priceSaving.value = false;
  }
}



</script>

<template>
  <div class="bp-page shop-container">
    <header class="page-head"><div><span class="eyebrow">UMAOMAO / PRODUCTS</span><h1>商品管理</h1><p>认真完善每一件商品，让好物被看见。</p></div><div class="head-actions"><Button variant="outline" size="sm" @click="router.push('/buyer/categories/apply')">分类申请</Button><Button variant="outline" size="sm" @click="router.push('/buyer/flash-sales')">秒杀报名</Button><Button @click="router.push('/buyer/products/create')"><Icon icon="lucide:plus" />发布商品</Button></div></header>
    <Tabs v-model="activeKey"><TabsList class="product-tabs"><TabsTrigger v-for="tab in TABS" :key="tab.key" :value="tab.key">{{ tab.label }}</TabsTrigger></TabsList></Tabs>
    <form class="filter-card" @submit.prevent="queryProducts"><Input v-model="keyword" aria-label="搜索商品名称" placeholder="搜索商品名称" /><CategoryPicker v-model="categoryId" :options="categoryOptions" :loading="categoryLoading" /><Button type="submit" :disabled="loading">查询</Button><Button type="button" variant="outline" @click="resetFilters">重置</Button></form>
    <div v-if="products.length" class="grid"><BuyerProductCard v-for="product in products" :key="product.id" :class="{ 'focused-product': focusedProductId && String(product.id) === focusedProductId }" :product="product" :shelving="shelvingId === product.id" :deleting="deletingId === product.id" :busy="priceSaving || shelvingId !== undefined || deletingId !== undefined" @edit="router.push({ name: 'buyer-product-edit', params: { id: String(product.id) } })" @price="openPrice(product)" @toggle-shelf="toggleShelf" @delete="deleteProduct" /></div>
    <div v-else-if="loading" class="grid" aria-busy="true" aria-label="正在读取商品列表"><Skeleton v-for="n in 6" :key="n" class="product-skeleton" /></div>
    <EmptyState v-else :title="loadError ? '商品列表加载失败' : '该状态下没有商品'" :description="loadError || '点击右上角「发布商品」开始售卖'" :action-text="loadError ? '重新加载' : '发布商品'" @action="loadError ? load() : router.push('/buyer/products/create')" />
    <a-modal v-model:visible="priceVisible" title="快捷改价" :footer="false" :closable="!priceSaving" :mask-closable="!priceSaving" :esc-to-close="!priceSaving"><form class="price-form" @submit.prevent="savePrice"><p class="product-name">{{ priceProduct?.title }}</p><Label for="quick-product-price">售价（USDT）<span>*</span></Label><Input id="quick-product-price" v-model="newPrice" inputmode="decimal" :disabled="priceSaving" placeholder="请输入新的商品售价" /><p class="hint">改价立即生效，已下单订单的价格不受影响。最多 8 位小数。</p><div class="modal-actions"><Button type="button" variant="outline" :disabled="priceSaving" @click="priceVisible = false">取消</Button><Button type="submit" :disabled="priceSaving">{{ priceSaving ? '正在提交…' : '确认改价' }}</Button></div></form></a-modal>
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="(page: number) => { current = page; syncQuery(); }" />
  </div>
</template>

<style scoped>
.bp-page .product-tabs { background: transparent; border-radius: 0; border-bottom: 1px solid var(--yb-hairline); padding: 0; gap: 18px; }
.bp-page .product-tabs :deep(button) { background: transparent; box-shadow: none; border-radius: 0; border-bottom: 3px solid transparent; padding: 12px 14px; font-size: 14px; }
.bp-page .product-tabs :deep(button[data-state='active']) { border-bottom-color: var(--yb-gold); color: var(--yb-brand-primary); }
.bp-page .filter-card { grid-template-columns: minmax(180px,1fr) 160px auto auto; background: transparent; border: 0; padding: 0; }
@media (min-width: 701px) and (max-width: 1150px) { .bp-page .grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
.bp-page { display:grid; gap:24px; }.page-head { display:flex; justify-content:space-between; align-items:center; gap:20px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.page-head h1 { font-size:28px; margin:8px 0; font-weight:650; }.page-head p { font-size:13px; color:var(--yb-muted); margin:0; }.head-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:10px; }.product-tabs { display:flex; width:100%; justify-content:flex-start; overflow-x:auto; height:auto; padding:6px; gap:4px; }.product-tabs :deep(button) { flex-shrink:0; padding:10px 13px; }.filter-card { display:grid; grid-template-columns:minmax(140px,1fr) minmax(160px,1fr) auto auto; gap:12px; padding:20px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:10px; }.grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }.focused-product { outline:2px solid var(--yb-primary); outline-offset:3px; }.product-skeleton { height:490px; }.price-form { display:grid; gap:12px; }.price-form label>span { color:var(--yb-danger); }.product-name { margin:0 0 10px; font-size:16px; font-weight:600; overflow-wrap:anywhere; }.hint { color:var(--yb-muted); font-size:12px; line-height:1.8; margin:0; }.modal-actions { display:flex; justify-content:flex-end; gap:16px; margin-top:12px; }@media(max-width:1150px) { .page-head { flex-wrap:wrap; }.head-actions { justify-content:flex-start; }.filter-card { grid-template-columns:minmax(140px,1fr) minmax(160px,1fr); } }@media(max-width:700px) { .grid { grid-template-columns:1fr; } }
</style>
