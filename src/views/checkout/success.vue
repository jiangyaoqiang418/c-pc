<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatAmount } from '@shared';
import ProductCard from '@/components/product/product-card.vue';
import * as realProductApi from '@/service/api/product';
import * as realOrderApi from '@/service/api/order';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { isGroupPaymentComplete, validateGroupPayResult } from '@/utils/checkout';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const order = ref<Api.RealOrder.Record>();
const recommends = ref<Api.RealProduct.Record[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const groupResult = ref<Api.RealOrder.OrderGroupPayResult>();
const detailsExpanded = ref(false);
const orderGroupNo = computed(() => typeof route.query.orderGroupNo === 'string' ? route.query.orderGroupNo : '');

const orderId = computed(() => String(route.params.orderId || ''));
const requestGuard = createLatestRequestGuard();
const paymentConfirmed = computed(() => !!order.value
  && (!orderGroupNo.value || (!!groupResult.value && isGroupPaymentComplete(groupResult.value, groupResult.value.items.map(item => item.orderId))))
  && ['PROCURING', 'IN_TRANSIT', 'COMPLETED', 'IN_AFTERSALE'].includes(order.value.status));
const resultTitle = computed(() => {
  if (paymentConfirmed.value) return '支付成功';
  if (orderGroupNo.value) return '订单组付款待核对';
  if (order.value?.status === 'PENDING_PAYMENT') return '订单尚未付款';
  if (order.value?.status === 'CANCELLED') return '订单已取消';
  if (order.value?.status === 'REFUNDED') return '订单已退款';
  return '请查看订单实际状态';
});
const resultDescription = computed(() => {
  if (paymentConfirmed.value) return '付款已确认，可前往订单详情查看后续进度。';
  if (order.value?.status === 'CANCELLED') return '订单已取消，请在订单详情核对处理记录。';
  if (order.value?.status === 'REFUNDED') return '订单已退款，可在订单详情及钱包流水核对资金记录。';
  return '请核对订单的实际付款状态，避免重复付款。';
});
const displayAmount = computed(() => paymentConfirmed.value && groupResult.value
  ? groupResult.value.paidAmount : order.value?.totalAmount);
const paymentStatusLabels: Record<Api.RealOrder.OrderStatus, string> = {
  CREATED: '待付款', PAID: '已付款', SHIPPED: '已发货', REFUND_REVIEW: '售后处理中',
  REFUNDED: '已退款', COMPLETED: '已完成', CANCELED: '已取消'
};

async function load() {
  const isCurrent = requestGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  order.value = undefined;
  groupResult.value = undefined;
  detailsExpanded.value = false;
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
    if (String(result.customerId) !== String(requestedUserId)) throw new Error('订单不属于当前账号');
    if (orderGroupNo.value) {
      const group = await realOrderApi.fetchOrderGroupPayResult(orderGroupNo.value, { signal: isCurrent.signal });
      if (!isCurrent()) return;
      const checked = validateGroupPayResult(group, orderGroupNo.value, group?.items?.map(item => item.orderId) || []);
      if (!checked.items.some(item => String(item.orderId) === orderId.value)) throw new Error('订单与付款组不匹配');
      const details = await Promise.all(checked.items.map(item => realOrderApi.fetchOrderDetail(item.orderId, { signal: isCurrent.signal })));
      if (!isCurrent()) return;
      if (details.some((detail, index) => String(detail.id) !== String(checked.items[index].orderId) || String(detail.customerId) !== String(requestedUserId))) throw new Error('订单组归属未确认');
      groupResult.value = checked;
      detailsExpanded.value = !isGroupPaymentComplete(checked, checked.items.map(item => item.orderId));
    }
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
watch([orderId, orderGroupNo, () => userStore.currentUser?.id], () => {
  requestGuard.invalidate();
  void load();
});
</script>

<template>
  <div class="success-page">
    <a-spin :loading="loading">
      <a-result
        v-if="order"
        class="payment-result"
        :status="paymentConfirmed ? 'success' : 'info'"
        :title="resultTitle"
        :subtitle="resultDescription"
      >
        <template #extra>
          <div class="payment-summary">
            <span class="amount-label">{{ paymentConfirmed ? '已付金额' : '订单金额' }}</span>
            <div class="payment-amount">{{ formatAmount(displayAmount) }}<span>USDT</span></div>
            <div v-if="groupResult" class="group-summary">
              <span>共 {{ groupResult.totalCount }} 笔订单</span><span>已付 {{ groupResult.paidCount }} 笔</span>
              <span v-if="!paymentConfirmed" class="unpaid-amount">待付 {{ formatAmount(groupResult.unpaidAmount) }} USDT</span>
            </div>
            <div v-if="!groupResult || groupResult.totalCount === 1" class="order-reference">订单号 <span>{{ order.code }}</span></div>
          </div>
          <a-space class="result-actions" :size="12">
            <a-button type="primary" size="large" @click="router.push({ name: 'order-detail', params: { id: String(orderId) } })">
              查看订单
            </a-button>
            <a-button size="large" @click="router.push('/')">继续购物</a-button>
          </a-space>
          <div v-if="groupResult" class="payment-details">
            <button type="button" class="details-toggle" :aria-expanded="detailsExpanded" aria-controls="payment-details-content" @click="detailsExpanded = !detailsExpanded">
              {{ detailsExpanded ? '收起付款明细' : '查看付款明细' }}<span aria-hidden="true">{{ detailsExpanded ? '⌃' : '⌄' }}</span>
            </button>
            <div v-if="detailsExpanded" id="payment-details-content" class="details-content">
              <div class="group-reference">订单组 <span>{{ groupResult.orderGroupNo }}</span></div>
              <div v-for="item in groupResult.items" :key="String(item.orderId)" class="payment-item">
                <div class="item-heading"><span class="item-order">订单 {{ item.orderNo || item.orderId }}</span><span class="item-status" :class="{ 'item-status--paid': item.success && ['PAID', 'SHIPPED', 'COMPLETED'].includes(item.status) }">{{ paymentStatusLabels[item.status] || '状态待核对' }}</span></div>
                <div class="item-amount">{{ formatAmount(item.amount) }} USDT</div>
                <p v-if="item.message" class="item-message">{{ item.message }}</p>
              </div>
            </div>
          </div>
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
.payment-result { padding: 32px 40px 24px; border: 1px solid var(--yb-hairline); border-radius: var(--bw-card-radius); background: #fff; }
.payment-result :deep(.arco-result-icon) { margin-bottom: 16px; }
.payment-result :deep(.arco-result-title) { font-size: 26px; font-weight: 600; line-height: 1.4; }
.payment-result :deep(.arco-result-subtitle) { margin-top: 8px; color: var(--yb-muted); line-height: 1.6; }
.payment-result :deep(.arco-result-extra) { width: 100%; margin-top: 24px; }
.payment-summary { text-align: center; }
.amount-label { color: var(--yb-muted); font-size: 13px; }
.payment-amount { display: flex; justify-content: center; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-top: 4px; color: var(--yb-ink); font-size: 32px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.payment-amount span { font-size: 14px; font-weight: 500; }
.group-summary { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; color: var(--yb-muted); font-size: 13px; }
.unpaid-amount { color: #b35d00; }
.order-reference { margin-top: 10px; color: var(--yb-muted); font-size: 13px; overflow-wrap: anywhere; }
.order-reference span { margin-left: 6px; color: var(--yb-muted); font-variant-numeric: tabular-nums; }
.result-actions { margin-top: 24px; }
.result-actions :deep(.arco-btn) { min-width: 120px; }
.payment-details { max-width: 620px; margin: 20px auto 0; border-top: 1px solid var(--yb-hairline); }
.details-toggle { display: inline-flex; justify-content: center; align-items: center; gap: 8px; min-height: 44px; border: 0; background: transparent; color: var(--yb-muted); font: inherit; font-size: 13px; cursor: pointer; }
.details-toggle:hover { color: var(--yb-ink); }
.details-toggle:focus-visible { outline: 2px solid var(--yb-brand-primary); outline-offset: 2px; }
.details-content { padding: 16px 20px; border-radius: 12px; background: var(--yb-fill); text-align: left; }
.group-reference { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--yb-muted); font-size: 12px; overflow-wrap: anywhere; }
.payment-item + .payment-item { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--yb-hairline); }
.item-heading { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.item-order { min-width: 0; overflow-wrap: anywhere; color: var(--yb-ink-2); }
.item-status { color: var(--yb-muted); }
.item-status--paid { color: #00854a; }
.item-amount { margin-top: 8px; color: var(--yb-ink); font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
.item-message { margin: 8px 0 0; color: var(--yb-muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-width: 640px) { .payment-result { padding: 24px 16px 16px; }.payment-amount { font-size: 28px; }.details-content { padding: 12px; } }
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
  color: var(--yb-ink);
}
</style>
