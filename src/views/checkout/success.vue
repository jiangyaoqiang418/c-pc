<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatAmount } from '@shared';
import ProductCard from '@/components/product/product-card.vue';
import * as realProductApi from '@/service/api/product';
import * as realOrderApi from '@/service/api/order';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const order = ref<Api.RealOrder.Record>();
const recommends = ref<Api.RealProduct.Record[]>([]);
const loading = ref(false);
const errorMessage = ref('');

const orderId = computed(() => String(route.params.orderId || ''));
const requestGuard = createLatestRequestGuard();
const paymentConfirmed = computed(() => !!order.value
  && ['PROCURING', 'IN_TRANSIT', 'COMPLETED', 'IN_AFTERSALE'].includes(order.value.status));
const resultTitle = computed(() => {
  if (paymentConfirmed.value) return '支付成功';
  if (order.value?.status === 'PENDING_PAYMENT') return '订单尚未付款';
  if (order.value?.status === 'CANCELLED') return '订单已取消';
  if (order.value?.status === 'REFUNDED') return '订单已退款';
  return '请查看订单实际状态';
});

async function load() {
  const isCurrent = requestGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  order.value = undefined;
  recommends.value = [];
  errorMessage.value = '';
  if (requestedUserId === undefined) {
    loading.value = false;
    return;
  }
  if (!orderId.value) {
    errorMessage.value = '缺少订单编号';
    return;
  }
  loading.value = true;
  // 推荐是独立区域，慢请求或失败不能延迟已取得的付款结果。
  void realProductApi.fetchHomeRecommendations(4, { signal: isCurrent.signal }).then(result => {
    if (isCurrent() && String(userStore.currentUser?.id) === String(requestedUserId)) recommends.value = result;
  }).catch(() => { /* 推荐失败不影响订单结果。 */ });
  try {
    const result = await realOrderApi.fetchOrderDetail(orderId.value, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    order.value = result;
  } catch (error) {
    if (isCurrent() && String(userStore.currentUser?.id) === String(requestedUserId)) {
      errorMessage.value = error instanceof Error ? error.message : '订单信息读取失败';
    }
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(requestGuard.invalidate);
watch([orderId, () => userStore.currentUser?.id], () => {
  requestGuard.invalidate();
  void load();
});
</script>

<template>
  <div class="success-page">
    <a-spin :loading="loading">
      <a-result
        v-if="order"
        :status="paymentConfirmed ? 'success' : 'info'"
        :title="resultTitle"
        :subtitle="`订单号 ${order.code} · 金额 U ${formatAmount(order.totalAmount)}`"
      >
        <template #extra>
          <a-space>
            <a-button type="primary" @click="router.push({ name: 'order-detail', params: { id: String(orderId) } })">
              查看订单
            </a-button>
            <a-button @click="router.push('/')">继续购物</a-button>
          </a-space>
        </template>
      </a-result>

      <a-result
        v-else-if="errorMessage"
        status="error"
        title="订单加载失败"
        :subtitle="errorMessage"
      >
        <template #extra>
          <a-space>
            <a-button type="primary" @click="router.push({ name: 'order-list' })">查看我的订单</a-button>
            <a-button @click="router.push('/')">继续购物</a-button>
          </a-space>
        </template>
      </a-result>

      <div v-if="recommends.length" class="recommend-block">
        <div class="rec-title">您可能也喜欢</div>
        <div class="shop-grid-4">
          <ProductCard v-for="p in recommends" :key="p.id" :product="p" />
        </div>
      </div>
    </a-spin>
  </div>
</template>

<style scoped>
.success-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px 16px;
}
.recommend-block {
  margin-top: 32px;
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 20px 24px;
}
.rec-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1d2129;
}
</style>
