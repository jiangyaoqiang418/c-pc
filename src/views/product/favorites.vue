<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as productApi from '@/service/api/product';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const list = ref<Api.RealProduct.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(12);
const loading = ref(false);
const cancelingId = ref<string>();
const cancellationPendingId = ref<string>();
const loadError = ref('');
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = String(userStore.currentUser?.id || '');
  if (!userId) {
    loading.value = false;
    list.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const r = await productApi.fetchMyFavorites({ current: current.value, size: size.value, signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      await load();
      return;
    }
    list.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '收藏列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function cancelFavorite(product: Api.RealProduct.Record) {
  const productId = String(product.id);
  if (cancelingId.value || cancellationPendingId.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancellationPendingId.value = productId;
  confirmationModal = Modal.confirm({
    title: '取消收藏？',
    content: `确认将「${product.title}」移出收藏列表吗？`,
    okText: '确认取消',
    onCancel() {
      if (!isCurrentWrite()) return;
      writeVersion += 1;
      cancellationPendingId.value = undefined;
    },
    async onOk() {
      if (!isCurrentWrite()) return;
      cancelingId.value = productId;
      try {
        await productApi.cancelProductFavorite(product.id);
        if (!isCurrentWrite()) return;
        if (list.value.length === 1 && current.value > 1) current.value -= 1;
        await load();
        if (!isCurrentWrite()) return;
        Message.success('已取消收藏');
      } catch {
        // 请求层已展示错误，保留当前收藏项，避免把取消失败误显示为成功。
      } finally {
        if (operation === writeVersion) {
          cancelingId.value = undefined;
          cancellationPendingId.value = undefined;
        }
      }
    }
  });
}

onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
});
watch(() => userStore.currentUser?.id, () => {
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
  cancelingId.value = undefined;
  cancellationPendingId.value = undefined;
  list.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  void load();
});


</script>

<template>
  <div class="favorites-page shop-container">
    <header class="page-head"><div><span class="eyebrow">SAVED FOR LATER</span><h1>我的收藏 <small v-if="!loading">{{ total }} 件商品</small></h1></div><Button variant="outline" @click="router.push('/product/list')">浏览商品<Icon icon="lucide:arrow-up-right" width="16" /></Button></header>
    <section :aria-busy="loading" aria-label="收藏商品列表">
      <div v-if="loading && !list.length" class="product-grid"><Skeleton v-for="n in 4" :key="n" class="favorite-loading" /></div>
      <div v-else-if="list.length" class="product-grid" :class="{ refreshing: loading }"><div v-for="p in list" :key="p.id" class="favorite-item"><ProductCard :product="p" /><Button class="cancel-button" size="sm" variant="ghost" :disabled="!!cancelingId || !!cancellationPendingId || loading" @click="cancelFavorite(p)"><Icon icon="lucide:heart-off" width="15" />{{ cancelingId === String(p.id) ? '取消中…' : '取消收藏' }}</Button></div></div>
      <EmptyState v-else :title="loadError || '暂无收藏商品'" :description="loadError ? '请稍后重试。' : '在商品详情页点击收藏后会出现在这里'" :action-text="loadError ? '重新加载' : '去浏览商品'" @action="loadError ? load() : router.push('/product/list')" />
    </section>
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading || !!cancellationPendingId" @change="current = $event; load()" />
  </div>
</template>

<style scoped>
.favorites-page { padding-top:32px; padding-bottom:48px; }.page-head { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:28px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { margin:5px 0 0; font-size:28px; font-weight:650; }h1 small { color:var(--yb-muted); font-size:13px; font-weight:400; margin-left:16px; }.product-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:16px; }.favorite-item { min-width:0; }.cancel-button { display:flex; margin:10px auto 0; color:var(--yb-muted); }.cancel-button:hover { color:var(--destructive); }.favorite-loading { height:390px; border-radius:10px; }.refreshing { opacity:.65; }@media(max-width:1200px) { .product-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }@media(max-width:1100px) { .product-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }@media(max-width:800px) { .product-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
