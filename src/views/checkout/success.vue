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

async function load() {
  const isCurrent = requestGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  order.value = undefined;
  recommends.value = [];
  errorMessage.value = '';
  if (requestedUserId === undefined) return;
  if (!orderId.value) {
    errorMessage.value = '缺少订单编号';
    return;
  }
  loading.value = true;
  try {
    const [orderResult, recommendResult] = await Promise.allSettled([
      realOrderApi.fetchOrderDetail(orderId.value, { signal: isCurrent.signal }),
      realProductApi.fetchHomeRecommendations(4, { signal: isCurrent.signal })
    ]);
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    if (orderResult.status === 'fulfilled') {
      order.value = orderResult.value;
    } else {
      errorMessage.value = orderResult.reason instanceof Error ? orderResult.reason.message : '订单信息读取失败';
    }
    if (recommendResult.status === 'fulfilled') recommends.value = recommendResult.value;
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
        status="success"
        :title="'支付成功'"
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
