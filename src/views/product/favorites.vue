<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import UmIcon from '@/components/common/um-icon.vue';
import V47CatalogPagination from '@/components/product/v47-catalog-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import ProductCard from '@/components/product/product-card.vue';
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
  <div class="favorites-page">
    <nav class="breadcrumb" aria-label="当前位置"><RouterLink to="/">首页</RouterLink><UmIcon name="chevron" /><span aria-current="page">我的收藏</span></nav>
    <div class="page-heading compact"><h1>我的收藏</h1><span class="heading-meta">{{ loading ? '正在加载…' : loadError ? '读取失败' : `${total} 件商品` }}</span></div>
    <div class="catalog-layout"><section class="catalog-content" :aria-busy="loading" aria-label="收藏商品列表">
      <span v-if="loading" class="catalog-sr-only" role="status">正在加载收藏</span>
      <div v-if="loading && !list.length" class="product-grid"><div v-for="index in 4" :key="index" class="favorite-skeleton"><Skeleton class="aspect-square w-full rounded-[9px]" /><div class="skeleton-info"><Skeleton class="h-4 w-3/4" /><Skeleton class="h-4 w-1/2" /><Skeleton class="mt-3 h-6 w-2/5" /></div></div></div>
      <div v-else-if="list.length" class="product-grid" :class="{ refreshing: loading }"><ProductCard v-for="product in list" :key="product.id" :product="product" :saved="true" :favorite-handler="() => cancelFavorite(product)" :favorite-disabled="!!cancelingId || !!cancellationPendingId || loading" /></div>
      <div v-else class="empty"><UmIcon name="heart" /><h2>{{ loadError || '还没有收藏的好物' }}</h2><p>{{ loadError ? '请稍后重试。' : '不妨换一个方向，发现新的喜欢。' }}</p><button type="button" class="primary" @click="loadError ? load() : router.push('/product/list')">{{ loadError ? '重新加载' : '去逛逛' }}</button></div>
      <V47CatalogPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading || !!cancellationPendingId" @change="current = $event; load()" />
    </section></div>
  </div>
</template>

<style scoped>
.favorite-skeleton { overflow:hidden; border:1px solid var(--line); background:var(--paper); border-radius:13px; padding:8px 8px 0; }
.skeleton-info { padding:12px 5px 13px; display:grid; gap:6px; }
.refreshing { opacity:.55; }
</style>
