<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatAmount, orderApi, productApi } from '@shared';
import ProductCard from '@/components/product/product-card.vue';

const route = useRoute();
const router = useRouter();
const order = ref<Api.Order.OrderRecord>();
const recommends = ref<Api.Product.ProductRecord[]>([]);
const loading = ref(false);

const orderId = computed(() => Number(route.params.orderId));

onMounted(async () => {
  loading.value = true;
  try {
    order.value = await orderApi.fetchOrderDetail(orderId.value);
    const r = await productApi.fetchHomeRecommends();
    recommends.value = r.hot.slice(0, 4);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="success-page">
    <a-spin :loading="loading">
      <a-result
        status="success"
        :title="'支付成功'"
        :subtitle="order ? `订单号 ${order.code} · 金额 U ${formatAmount(order.totalAmount)}` : ''"
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

      <div class="recommend-block">
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
