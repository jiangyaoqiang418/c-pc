<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as orderApi from '@/service/api/order';
import * as reviewApi from '@/service/api/review';
import ReviewForm from '@/components/review/review-form.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const orderId = computed(() => String(route.params.orderId));
const order = ref<Api.Order.OrderRecord>();
const loading = ref(false);
const submitting = ref(false);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    order.value = await orderApi.fetchOrderDetail(orderId.value);
  } catch {
    order.value = undefined;
    loadError.value = '订单信息加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function onSubmit(f: { productScore: number; sellerScore: number; content: string; tags: string[]; photoUrls: string[] }) {
  if (!order.value || !userStore.currentUser) return;
  Modal.confirm({
    title: '确认提交评价？',
    content: '评价提交后不可修改，请确认评分和内容。',
    async onOk() {
      submitting.value = true;
      try {
        await reviewApi.submitReview({
          orderId: order.value!.id,
          productScore: f.productScore,
          sellerScore: f.sellerScore,
          content: f.content.trim() || undefined,
          images: f.photoUrls,
          anonymous: false
        });
        Message.success('评价提交成功');
        router.push('/review');
      } catch {
        Message.error('提交失败，请稍后重试');
      } finally {
        submitting.value = false;
      }
    }
  });
}

function handleEmptyAction() {
  if (loadError.value) {
    load();
    return;
  }
  router.push('/order');
}
</script>

<template>
  <div class="review-write-page shop-container">
    <a-spin :loading="loading">
      <template v-if="order">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item @click="router.push('/order')">我的订单</a-breadcrumb-item>
          <a-breadcrumb-item @click="router.push({ name: 'order-detail', params: { id: String(order.id) } })">
            {{ order.code }}
          </a-breadcrumb-item>
          <a-breadcrumb-item>写评价</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="order-card" :body-style="{ padding: '14px 20px' }" :bordered="false">
          <div class="order-row">
            <img :src="order.productCover || `https://picsum.photos/seed/${order.productId}/80/80`" :alt="order.productTitle || '商品图片'" class="cover" />
            <div class="info">
              <div class="title">{{ order.productTitle }}</div>
              <div class="meta">买手 {{ order.shopperName }} · 总额 U {{ formatAmount(order.totalAmount) }}</div>
            </div>
          </div>
        </a-card>

        <ReviewForm :submitting="submitting" @submit="onSubmit" />
      </template>

      <EmptyState
        v-else-if="!loading"
        :title="loadError ? '订单加载失败' : '订单不存在'"
        :description="loadError || undefined"
        :action-text="loadError ? '重新加载' : '返回订单'"
        @action="handleEmptyAction"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.review-write-page {
  padding-top: 16px;
  max-width: 860px;
  margin: 0 auto;
}
.bread {
  margin-bottom: 12px;
}
.order-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.order-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
.cover {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  object-fit: cover;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 4px;
}
.meta {
  font-size: 12px;
  color: #86909c;
}
@media (max-width: 640px) {
  .review-write-page { margin: 0; }
  .order-row { align-items: flex-start; }
  .info { min-width: 0; }
  .title { overflow-wrap: anywhere; }
  .meta { line-height: 1.6; }
}
</style>
