<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
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
    <div class="page-head">
      <h1 class="page-title">我的收藏</h1>
      <span class="page-sub">已收藏商品会同步到真实收藏接口</span>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="list.length" class="product-grid">
        <div v-for="p in list" :key="p.id" class="favorite-item">
          <ProductCard :product="p" />
          <a-button
            class="cancel-button"
            type="outline"
            status="danger"
            long
            :loading="cancelingId === String(p.id)"
            @click="cancelFavorite(p)"
          >
            取消收藏
          </a-button>
        </div>
      </div>
      <EmptyState
        v-else
        :title="loadError || '暂无收藏商品'"
        :description="loadError ? '不会把请求失败误显示为没有收藏。' : '在商品详情页点击收藏后会出现在这里'"
        :action-text="loadError ? '重新加载' : '去浏览商品'"
        @action="loadError ? load() : router.push('/product/list')"
      />
    </a-spin>

    <div v-if="total > size" class="pagination-bar">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="(p: number) => { current = p; load(); }"
      />
    </div>
  </div>
</template>

<style scoped>
.favorites-page {
  padding-top: 16px;
  padding-bottom: 40px;
}
.page-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--yb-ink);
}
.page-sub {
  color: var(--yb-muted);
  font-size: 12px;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.favorite-item {
  min-width: 0;
}
.cancel-button {
  margin-top: 8px;
}
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}
@media (max-width: 1100px) {
  .product-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
