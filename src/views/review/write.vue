<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { formatAmount, orderApi, reviewApi } from '@shared';
import ReviewForm from '@/components/review/review-form.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const orderId = computed(() => Number(route.params.orderId));
const order = ref<Api.Order.OrderRecord>();
const loading = ref(false);
const submitting = ref(false);

async function load() {
  loading.value = true;
  try {
    order.value = await orderApi.fetchOrderDetail(orderId.value);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function onSubmit(f: { score: number; content: string; tags: string[]; photoUrls: string[] }) {
  if (!order.value || !userStore.currentUser) return;
  Modal.confirm({
    title: '确认提交评价？',
    content: '评价提交后不可修改；好评 +1 积分，差评 -1 积分',
    async onOk() {
      submitting.value = true;
      try {
        const r = await reviewApi.submitReviewMock({
          orderId: order.value!.id,
          fromUserId: userStore.currentUser!.id,
          score: f.score as Api.Review.Score,
          content: f.content,
          tags: f.tags,
          photoUrls: f.photoUrls
        });
        if (r.ok) {
          const pointHint = f.score >= 4 ? '+1' : f.score <= 2 ? '-1' : '0';
          Message.success(`评价成功 · 积分 ${pointHint}`);
          router.push('/review');
        } else {
          Message.error(r.message || '提交失败');
        }
      } finally {
        submitting.value = false;
      }
    }
  });
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
            <img :src="order.productCover || `https://picsum.photos/seed/${order.productId}/80/80`" class="cover" />
            <div class="info">
              <div class="title">{{ order.productTitle }}</div>
              <div class="meta">买手 {{ order.shopperName }} · 总额 U {{ formatAmount(order.totalAmount) }}</div>
            </div>
          </div>
        </a-card>

        <ReviewForm :submitting="submitting" @submit="onSubmit" />
      </template>

      <EmptyState v-else-if="!loading" title="订单不存在" action-text="返回订单" @action="router.push('/order')" />
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
</style>
