<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  <div class="success-page" :aria-busy="loading">
    <div v-if="loading" class="payment-result result-loading" role="status"><Skeleton class="result-icon-skeleton" /><Skeleton class="result-title-skeleton" /><Skeleton class="result-content-skeleton" /><span class="sr-only">正在核对付款结果</span></div>
    <section v-else-if="order" class="payment-result">
      <div class="result-icon" :class="{ confirmed: paymentConfirmed }"><Icon :icon="paymentConfirmed ? 'lucide:check' : 'lucide:circle-help'" width="32" /></div>
      <h1>{{ resultTitle }}</h1><p class="result-description">{{ resultDescription }}</p>
      <div class="payment-summary"><span class="amount-label">{{ paymentConfirmed ? '已付金额' : '订单金额' }}</span><div class="payment-amount">{{ formatAmount(displayAmount) }}<span>USDT</span></div><div v-if="groupResult" class="group-summary"><span>共 {{ groupResult.totalCount }} 笔订单</span><span>已付 {{ groupResult.paidCount }} 笔</span><span v-if="!paymentConfirmed" class="unpaid-amount">待付 {{ formatAmount(groupResult.unpaidAmount) }} USDT</span></div><div v-if="!groupResult || groupResult.totalCount === 1" class="order-reference">订单号 <span>{{ order.code }}</span></div></div>
      <div class="result-actions"><Button size="lg" @click="router.push({ name: 'order-detail', params: { id: String(orderId) } })">查看订单 <Icon icon="lucide:arrow-right" width="16" /></Button><Button variant="outline" size="lg" @click="router.push('/')">继续购物</Button></div>
      <div v-if="groupResult" class="payment-details">
        <button type="button" class="details-toggle" :aria-expanded="detailsExpanded" aria-controls="payment-details-content" @click="detailsExpanded = !detailsExpanded">{{ detailsExpanded ? '收起付款明细' : '查看付款明细' }}<Icon icon="lucide:chevron-down" width="16" :class="{ expanded: detailsExpanded }" /></button>
        <Transition name="details"><div v-if="detailsExpanded" id="payment-details-content" class="details-content"><div class="group-reference">订单组 <span>{{ groupResult.orderGroupNo }}</span></div><div v-for="item in groupResult.items" :key="String(item.orderId)" class="payment-item"><div class="item-heading"><RouterLink :to="{ name: 'order-detail', params: { id: String(item.orderId) } }" class="item-order">订单 {{ item.orderNo || item.orderId }}</RouterLink><span class="item-status" :class="{ 'item-status--paid': item.success && ['PAID', 'SHIPPED', 'COMPLETED'].includes(item.status) }">{{ paymentStatusLabels[item.status] || '状态待核对' }}</span></div><div class="item-amount">{{ formatAmount(item.amount) }} USDT</div><p v-if="item.message" class="item-message">{{ item.message }}</p></div></div></Transition>
      </div>
    </section>
    <section v-else-if="errorMessage" class="payment-result">
      <div class="result-icon failed"><Icon icon="lucide:circle-alert" width="32" /></div><h1>订单加载失败</h1><p class="result-description">{{ errorMessage }}</p><div class="result-actions"><Button :disabled="loading" @click="load">重新核对付款结果</Button><Button variant="outline" @click="router.push({ name: 'order-list' })">查看我的订单</Button><Button variant="ghost" @click="router.push('/')">继续购物</Button></div>
    </section>
    <section v-if="recommends.length" class="recommend-block"><h2>您可能也喜欢</h2><div class="shop-grid-4"><ProductCard v-for="product in recommends" :key="product.id" :product="product" /></div></section>
  </div>
</template>

<style scoped>
.success-page { width: min(1100px, calc(100% - 64px)); margin: 0 auto; padding: 32px 0 48px; }
.payment-result { padding: 40px; border: 1px solid var(--yb-hairline); border-radius: 12px; background: var(--yb-surface); text-align: center; }
.result-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; color: var(--yb-primary); background: var(--yb-primary-soft); margin: 0 auto 20px; }
.result-icon.confirmed { color: white; background: var(--yb-primary); }
.result-icon.failed { color: var(--yb-danger); background: color-mix(in srgb, var(--yb-danger) 8%, var(--yb-surface)); }
h1 { font-size: 28px; font-weight: 650; margin: 0; }
.result-description { margin: 8px 0 24px; color: var(--yb-muted); font-size: 14px; overflow-wrap: anywhere; }
.amount-label { color: var(--yb-muted); font-size: 13px; }
.payment-amount { display: flex; justify-content: center; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-top: 4px; font-size: 36px; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.payment-amount span { font-size: 14px; font-weight: 500; }
.group-summary { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; color: var(--yb-muted); font-size: 13px; }
.unpaid-amount { color: var(--yb-danger); }
.order-reference { margin-top: 10px; color: var(--yb-muted); font-size: 13px; overflow-wrap: anywhere; }
.order-reference span { margin-left: 6px; font-variant-numeric: tabular-nums; }
.result-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.result-actions button { min-width: 120px; }
.payment-details { max-width: 680px; margin: 24px auto 0; border-top: 1px solid var(--yb-hairline); }
.details-toggle { display: inline-flex; justify-content: center; align-items: center; gap: 8px; min-height: 48px; color: var(--yb-muted); font-size: 14px; }
.details-toggle:hover { color: var(--yb-primary); }
.details-toggle svg { transition: transform 200ms var(--um-ease); }
.details-toggle svg.expanded { transform: rotate(180deg); }
.details-content { padding: 20px; border-radius: 8px; background: var(--yb-fill); text-align: left; }
.group-reference { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--yb-muted); font-size: 12px; overflow-wrap: anywhere; }
.payment-item + .payment-item { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--yb-hairline); }
.item-heading { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; font-size: 14px; }
.item-order { min-width: 0; overflow-wrap: anywhere; color: var(--yb-primary); }
.item-status { color: var(--yb-muted); }
.item-status--paid { color: var(--yb-primary); }
.item-amount { margin-top: 8px; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.item-message { margin: 8px 0 0; color: var(--yb-muted); font-size: 13px; overflow-wrap: anywhere; }
.recommend-block { margin-top: 32px; border: 1px solid var(--yb-hairline); border-radius: 12px; background: var(--yb-surface); padding: 24px; }
.recommend-block h2 { font-size: 24px; font-weight: 650; margin: 0 0 20px; }
.result-loading { display: grid; justify-items: center; gap: 20px; }
.result-icon-skeleton { width: 64px; height: 64px; border-radius: 50%; }
.result-title-skeleton { width: 200px; height: 32px; }
.result-content-skeleton { width: min(440px, 100%); height: 160px; }
.details-enter-active { transition: opacity 200ms var(--um-ease); }
.details-enter-from { opacity: 0; }
@media (max-width: 640px) { .payment-result { padding: 24px; } .payment-amount { font-size: 28px; } }
@media (prefers-reduced-motion: reduce) { .details-enter-active, .details-toggle svg { transition: none; } }
</style>
