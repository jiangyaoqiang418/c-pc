<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ImagePreview from '@/components/common/image-preview.vue';
import { Message, Modal } from '@/lib/feedback';
import { Textarea } from '@/components/ui/textarea';
import { enums } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import OrderTimeline from '@/components/order/order-timeline.vue';
import OrderActions from '@/components/order/order-actions.vue';
import OrderPaymentSelector from '@/components/order/order-payment-selector.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as orderApi from '@/service/api/order';
import { requestPayPassword } from '@/utils/pay-password';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';
import { fetchLatestWalletPay, validateWalletPay, type WalletPayOrder } from '@/service/api/wallet-pay';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { readPendingCheckout, sumPaymentAmounts } from '@/utils/checkout';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const order = ref<Api.RealOrder.Record>();
const walletPay = ref<WalletPayOrder>();
const walletPayError = ref('');
const walletGroupNo = ref('');
const permissions = computed(() => getOrderCapabilities(order.value, userStore.currentUser?.id));
const logisticsSection = ref<HTMLElement>();
const purchasePreviewOpen = ref(false);
const purchasePreviewIndex = ref(0);
watch([() => route.params.id, () => userStore.currentUser?.id], () => { purchasePreviewOpen.value = false; });

function viewLogistics() {
  logisticsSection.value?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
const logistics = ref<Api.RealOrder.LogisticsDTO>();
const logisticsError = ref('');
const reviewable = ref(false);
const reviewReason = ref('');
const reviewableError = ref('');
const reviewableLoading = ref(false);
const reviewableGuard = createLatestRequestGuard();
const loading = ref(false);
const loadError = ref('');
const acting = ref(false);
const paymentOpen = ref(false);
const confirmationOpen = ref(false);
const requestGuard = createLatestRequestGuard();
let actionVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

const id = computed(() => String(route.params.id || ''));
const hasProduct = computed(() => order.value?.productId !== undefined && order.value?.productId !== null && String(order.value.productId).trim() !== '');

function viewProduct() {
  if (!hasProduct.value || !order.value) return;
  router.push({ name: 'product-detail', params: { id: String(order.value.productId) } });
}

async function loadReviewable(snapshot?: Api.RealOrder.Record) {
  const isCurrent = reviewableGuard.begin();
  const requestedId = order.value?.id;
  const requestedUserId = userStore.currentUser?.id;
  reviewable.value = false;
  reviewReason.value = '';
  reviewableError.value = '';
  reviewableLoading.value = false;
  if (requestedId === undefined || requestedUserId === undefined || !permissions.value.review) return;
  reviewableLoading.value = true;
  try {
    const detail = snapshot || await orderApi.fetchOrderDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || !sameBusinessId(order.value?.id, requestedId) || !sameBusinessId(userStore.currentUser?.id, requestedUserId)) return;
    const eligibility = detail.reviewEligibility;
    if (!eligibility || !sameBusinessId(eligibility.orderId, requestedId) || typeof eligibility.reviewable !== 'boolean') throw new Error('缺少评价资格');
    reviewable.value = eligibility.reviewable;
    reviewReason.value = eligibility.reviewable ? '' : eligibility.reasonText || eligibility.reason || '当前不可评价';
  } catch {
    if (isCurrent()) reviewableError.value = '评价资格读取失败，请重新核对';
  } finally {
    if (isCurrent()) reviewableLoading.value = false;
  }
}

async function load() {
  reviewableGuard.invalidate();
  reviewableLoading.value = false;
  reviewableError.value = '';
  reviewable.value = false;
  walletPay.value = undefined;
  walletPayError.value = '';
  walletGroupNo.value = '';
  const isCurrent = requestGuard.begin();
  const requestedId = id.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    loading.value = false;
    order.value = undefined;
    logistics.value = undefined;
    reviewable.value = false;
    loadError.value = '';
    logisticsError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  logisticsError.value = '';
  try {
    const nextOrder = await orderApi.fetchOrderDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    order.value = nextOrder;
    if (walletPayEntryEnabled && getOrderCapabilities(nextOrder, requestedUserId).isCustomer) {
      walletGroupNo.value = nextOrder.orderGroupNo || '';
      if (!walletGroupNo.value) {
        try {
          const pending = readPendingCheckout(requestedUserId);
          if (pending?.orderGroupNo && pending.orderIds?.some(orderId => String(orderId) === String(nextOrder.id))) walletGroupNo.value = pending.orderGroupNo;
        } catch { walletPayError.value = '订单未返回组号，且本机结算记录无法读取，请联系平台核对钱包支付'; }
      }
    }
    if (walletGroupNo.value) {
      const group = walletGroupNo.value;
      void fetchLatestWalletPay(group, { signal: isCurrent.signal }).then(result => {
        if (!isCurrent()) return;
        walletPay.value = result ? validateWalletPay(result, group) : undefined;
      }).catch(() => { if (isCurrent()) walletPayError.value = '钱包支付状态读取失败，请刷新后核对'; });
    }
    void loadReviewable(nextOrder);
    try {
      const nextLogistics = await orderApi.fetchOrderLogistics(order.value.id, { signal: isCurrent.signal });
      if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
      logistics.value = nextLogistics;
    } catch {
      if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
      logistics.value = undefined;
      logisticsError.value = '物流信息加载失败，请稍后重试。';
    }
  } catch {
    if (!isCurrent()) return;
    order.value = undefined;
    logistics.value = undefined;
    reviewable.value = false;
    loadError.value = '订单详情加载失败，请检查网络后重试';
  } finally {
    if (isCurrent()) {
      loading.value = false;
      await nextTick();
      if (isCurrent() && route.hash === '#logistics') viewLogistics();
    }
  }
}

onMounted(load);
onBeforeUnmount(() => {
  actionVersion += 1;
  paymentOpen.value = false;
  confirmationModal?.close();
  requestGuard.invalidate();
  reviewableGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  actionVersion += 1;
  paymentOpen.value = false;
  confirmationModal?.close();
  requestGuard.invalidate();
  order.value = undefined;
  logistics.value = undefined;
  reviewable.value = false;
  logisticsError.value = '';
  confirmationOpen.value = false;
  void load();
});

const aftersaleMeta = computed(() => {
  const aftersaleType = order.value?.aftersaleType;
  return aftersaleType ? enums.AFTERSALE_TYPE_META[aftersaleType] : undefined;
});
const currentLogistics = computed(() => order.value && logistics.value && sameBusinessId(order.value.id, logistics.value.orderId) ? logistics.value : undefined);
const purchaseNo = computed(() => currentLogistics.value?.purchaseNo || order.value?.purchaseNo);
const purchaseVouchers = computed(() => {
  if (currentLogistics.value?.purchaseVouchers?.length) return currentLogistics.value.purchaseVouchers;
  if (order.value?.purchaseVouchers?.length) return order.value.purchaseVouchers;
  return order.value?.purchaseScreenshotUrl ? [order.value.purchaseScreenshotUrl] : [];
});
function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function pay() {
  if (!permissions.value.pay || !order.value || acting.value || confirmationOpen.value) return;
  paymentOpen.value = true;
}

async function payBalance() {
  if (!permissions.value.pay) return;
  if (!order.value || acting.value) return;
  if (walletPayEntryEnabled && walletPayError.value) { Message.warning(walletPayError.value); return; }
  if (walletPayEntryEnabled && walletGroupNo.value) {
    const group = walletGroupNo.value;
    const userId = userStore.currentUser?.id;
    const orderId = order.value.id;
    try {
      const latest = await fetchLatestWalletPay(group);
      if (String(userStore.currentUser?.id) !== String(userId) || !sameBusinessId(order.value?.id, orderId) || walletGroupNo.value !== group) return;
      walletPay.value = latest ? validateWalletPay(latest, group) : undefined;
      if (walletPay.value && ['PENDING', 'SUBMITTED'].includes(walletPay.value.status)) {
        Message.warning('该订单组已有钱包支付单，请先核对原支付进度，勿重复付款');
        await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
        return;
      }
    } catch { Message.warning('无法核对钱包支付状态，暂不可重复付款'); return; }
  }
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  const requestedAmount = String(order.value.totalAmount);
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  const isCurrentAction = () => operation === actionVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(order.value?.id, requestedOrderId);
  acting.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrentAction()) return;
    const r = await orderApi.withOrderPayment(requestedUserId, [requestedOrderId], undefined, async payment => {
      const latestOrder = await orderApi.fetchOrderDetail(requestedOrderId);
      if (!getOrderCapabilities(latestOrder, requestedUserId).pay
        || sumPaymentAmounts([latestOrder.totalAmount]) !== sumPaymentAmounts([requestedAmount])) {
        throw new Error('订单状态或金额已变化，请刷新后重新核对');
      }
      if (latestOrder.orderGroupNo) {
        const latestPay = await fetchLatestWalletPay(latestOrder.orderGroupNo);
        if (latestPay && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(validateWalletPay(latestPay, latestOrder.orderGroupNo).status)) {
          throw new Error('该订单组已有链上支付单，请先核对支付进度，勿重复付款');
        }
      }
      return payment.payOrder(requestedOrderId, String(latestOrder.totalAmount), payPassword, { showError: false });
    });
    if (!isCurrentAction()) return;
    if (r.ok) { Message.success('支付成功'); await load(); }
    else Message.error(r.message || '支付失败');
  } catch (error) {
    if (isCurrentAction()) {
      Message.error(error instanceof Error ? error.message : '支付结果未确认，请核对订单');
      await load();
    }
  }
  finally { if (operation === actionVersion) acting.value = false; }
}

function cancel() {
  if (!permissions.value.cancel) return;
  if (!order.value || acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  const reason = ref('');
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '取消订单？',
    content: () => h(Textarea, {
      modelValue: reason.value,
      'onUpdate:modelValue': (value: string) => { reason.value = value; },
      placeholder: '请输入取消原因（必填）',
      autoSize: { minRows: 3, maxRows: 5 }
    }),
    okText: '确认取消',
    okButtonProps: { status: 'danger' },
    onBeforeOk() {
      if (reason.value.trim()) return true;
      Message.warning('请填写取消原因');
      return false;
    },
    onCancel() {
      if (operation === actionVersion) confirmationOpen.value = false;
    },
    async onOk() {
      const isCurrentAction = () => operation === actionVersion
        && String(userStore.currentUser?.id) === String(requestedUserId)
        && sameBusinessId(order.value?.id, requestedOrderId);
      if (!isCurrentAction() || !permissions.value.cancel) {
        if (operation === actionVersion) confirmationOpen.value = false;
        return;
      }
      acting.value = true;
      try {
        const r = await orderApi.cancelOrder(requestedOrderId, reason.value.trim());
        if (!isCurrentAction()) return;
        if (r.ok) { Message.success('订单已取消'); await load(); }
        else Message.error(r.message || '取消订单失败');
      } catch { if (isCurrentAction()) Message.error('取消订单请求失败，请稍后重试'); }
      finally {
        if (operation === actionVersion) {
          acting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}

async function confirm() {
  if (!permissions.value.confirm) return;
  if (!order.value || acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  const isCurrentAction = () => operation === actionVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(order.value?.id, requestedOrderId);
  confirmationOpen.value = true;
  acting.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath, '确认收货');
    if (!payPassword || !isCurrentAction() || !permissions.value.confirm) return;
    const r = await orderApi.confirmReceipt(requestedOrderId, requestedUserId, payPassword);
    if (!isCurrentAction()) return;
    if (r.ok) { Message.success('已确认收货'); await load(); }
    else Message.error(r.message || '确认收货失败');
  } catch (error) {
    if (isCurrentAction()) {
      Message.error(error instanceof Error ? error.message : '确认收货失败');
      await load();
    }
  } finally {
    if (operation === actionVersion) {
      acting.value = false;
      confirmationOpen.value = false;
    }
  }
}

function extendReceipt() {
  if (!permissions.value.extendReceipt || !order.value || acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  const isCurrentAction = () => operation === actionVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(order.value?.id, requestedOrderId);
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '延长收货？',
    content: '确认后自动收货时间将顺延 5 天，每笔订单最多可延长 5 次。',
    okText: '确认延长',
    onCancel() {
      if (operation === actionVersion) confirmationOpen.value = false;
    },
    async onOk() {
      if (!isCurrentAction() || !permissions.value.extendReceipt) {
        if (operation === actionVersion) confirmationOpen.value = false;
        return;
      }
      acting.value = true;
      try {
        const result = await orderApi.extendReceipt(requestedOrderId, requestedUserId);
        if (!isCurrentAction()) return;
        Message.success(result.recovered ? '已核对到延长收货结果' : '已延长收货 5 天');
        await load();
      } catch (error) {
        if (isCurrentAction()) {
          Message.error(error instanceof Error ? error.message : '延长收货结果未确认，请核对订单');
          await load();
        }
      } finally {
        if (operation === actionVersion) {
          acting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}

function goReview() {
  if (!permissions.value.review || !reviewable.value) return;
  if (!order.value) return;
  router.push({ name: 'review-write', params: { orderId: String(order.value.id) } });
}

function goAftersale() {
  if (!permissions.value.refund && !permissions.value.viewAftersale) return;
  if (!order.value) return;
  if (order.value.status === 'IN_AFTERSALE') {
    router.push({ name: 'aftersale-list' });
  } else {
    router.push({ name: 'aftersale-create', params: { orderId: String(order.value.id) } });
  }
}

function contactShopper() {
  if (!order.value) return;
  router.push({ name: 'im-order-group', params: { orderCode: String(order.value.id) } });
}
</script>

<template>
  <div class="order-detail-page shop-container" :aria-busy="loading">
    <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/order">我的订单</RouterLink><span>/</span><span>订单详情</span></nav>
    <div v-if="loading && !order" class="detail-skeletons"><Skeleton class="hero-skeleton" /><Skeleton class="timeline-skeleton" /></div>
    <template v-else-if="order">
      <Alert v-if="walletPayError" class="notice"><AlertDescription>{{ walletPayError }}</AlertDescription></Alert>
      <Alert v-if="walletPay && ['PENDING', 'SUBMITTED', 'CLOSED'].includes(walletPay.status)" class="notice"><AlertDescription>钱包支付单 {{ walletPay.payNo }}：{{ walletPay.statusText || walletPay.status }}。{{ walletPay.status === 'SUBMITTED' ? '等待平台确认，请勿重复转账。' : '请核对支付进度。' }}</AlertDescription><Button variant="outline" size="sm" @click="router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: walletPay.orderGroupNo } })">查看钱包支付</Button></Alert>
      <Alert v-if="reviewableLoading" class="notice"><AlertDescription>正在核对评价资格，不影响查看订单详情。</AlertDescription></Alert>
      <Alert v-if="reviewReason && !reviewableLoading && !reviewableError" class="notice"><AlertDescription>{{ reviewReason }}</AlertDescription></Alert>
      <Alert v-if="reviewableError" class="notice"><AlertDescription>{{ reviewableError }}</AlertDescription><Button variant="outline" size="sm" :disabled="reviewableLoading" @click="loadReviewable()">重新核对</Button></Alert>
      <section class="hero-card panel"><div class="hero-heading"><div><p class="eyebrow">ORDER DETAILS</p><h1>订单 {{ order.code }}</h1><p class="hero-meta">创建于 {{ formatTime(order.createdAt) }} · 买手 {{ order.shopperName }}</p></div><OrderStatusTag :status="order.status" size="large" /></div><div v-if="permissions.confirm && order.autoConfirmAt" class="receive-meta"><Icon icon="lucide:clock" width="15" />预计自动收货：{{ formatTime(order.autoConfirmAt) }}<span v-if="order.receiveExtendCount != null">已延长 {{ order.receiveExtendCount }} 次</span></div><OrderActions :order="order" :reviewable="reviewable" :busy="acting || confirmationOpen || loading" variant="detail" @pay="pay" @cancel="cancel" @confirm="confirm" @extend-receipt="extendReceipt" @review="goReview" @aftersale="goAftersale" @cs="contactShopper" @logistics="viewLogistics" /></section>
      <div class="detail-layout">
        <div class="main-panels">
          <section id="logistics" ref="logisticsSection" class="panel"><h2>订单进度</h2><Alert v-if="logisticsError" variant="destructive" class="notice"><AlertDescription>{{ logisticsError }}</AlertDescription><Button variant="outline" size="sm" :disabled="loading" @click="load">重新加载</Button></Alert><OrderTimeline :order="order" :logistics="currentLogistics" /></section>
          <section v-if="purchaseNo || purchaseVouchers.length" class="panel"><h2>采购信息</h2><p v-if="purchaseNo" class="muted">采购单号 {{ purchaseNo }}</p><div v-if="purchaseVouchers.length" class="voucher-list"><span class="voucher-label">采购凭证</span><button v-for="(url, index) in purchaseVouchers" :key="url" type="button" class="voucher-button" :aria-label="`查看采购凭证 ${index + 1}`" @click="purchasePreviewIndex = index; purchasePreviewOpen = true"><img :src="url" alt="采购凭证" @error="setImageFallback" /><Icon icon="lucide:expand" width="14" /></button></div></section>
          <section class="panel"><h2>商品信息</h2><div class="goods-row"><img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle || '商品图片'" class="cover" @error="setImageFallback" /><div class="goods-info"><button v-if="hasProduct" type="button" class="goods-title linked" @click="viewProduct">{{ order.productTitle }}</button><span v-else class="goods-title">{{ order.productTitle }}</span><div class="tags"><span v-if="aftersaleMeta" class="tag">{{ aftersaleMeta.label }}</span><span v-if="order.overseasCustoms" class="tag overseas">海外直邮</span></div></div><div class="goods-amount"><strong>{{ formatUsdt(order.price) }}</strong><small>≈ {{ formatCny(order.price) }}</small></div></div></section>
          <section class="panel"><h2>收货信息</h2><dl class="info-grid"><div><dt>收货人</dt><dd>{{ order.receiverName }}</dd></div><div><dt>手机</dt><dd>{{ order.receiverPhone }}</dd></div><div class="wide"><dt>地址</dt><dd>{{ order.shippingAddress }}</dd></div><div><dt>邮编</dt><dd>{{ order.postalCode || '—' }}</dd></div><div><dt>地址 ID</dt><dd>{{ order.addressId != null ? String(order.addressId) : '—' }}</dd></div></dl></section>
          <section v-if="order.refundId || order.refundStatus || order.refundAmount" class="panel"><h2>退款信息</h2><dl class="info-grid"><div><dt>退款单号</dt><dd>{{ order.refundId != null ? String(order.refundId) : '—' }}</dd></div><div><dt>退款状态</dt><dd>{{ order.refundStatus || '—' }}</dd></div><div><dt>退款金额</dt><dd>{{ order.refundAmount != null ? formatUsdt(order.refundAmount) : '—' }}</dd></div></dl></section>
          <section v-if="order.priceHistory?.length" class="panel"><details class="price-history"><summary>改价历史（{{ order.priceHistory.length }} 条）<Icon icon="lucide:chevron-down" width="18" /></summary><ol><li v-for="(history, index) in order.priceHistory" :key="index"><div>{{ history.field }} <strong>{{ formatUsdt(history.before) }}</strong> → <strong>{{ formatUsdt(history.after) }}</strong></div><p>≈ {{ formatCny(history.before) }} → {{ formatCny(history.after) }}</p><p>{{ history.operator || '系统' }} · {{ formatTime(history.changedAt) }} · {{ history.reason }}</p></li></ol></details></section>
          <section class="panel"><h2>关键时间</h2><dl class="info-grid"><div><dt>下单</dt><dd>{{ formatTime(order.createdAt) }}</dd></div><div><dt>付款</dt><dd>{{ formatTime(order.paidAt) }}</dd></div><div><dt>采购完成</dt><dd>{{ formatTime(order.procuredAt) }}</dd></div><div><dt>发货</dt><dd>{{ formatTime(order.shippedAt) }}</dd></div><div><dt>签收</dt><dd>{{ formatTime(order.deliveredAt) }}</dd></div><div><dt>归档</dt><dd>{{ formatTime(order.archivedAt) }}</dd></div></dl></section>
        </div>
        <aside class="side-panels">
          <section class="panel amount-panel"><h2>金额明细</h2><dl class="amount-list"><div><dt>商品金额</dt><dd>{{ formatUsdt(order.price) }}<small>≈ {{ formatCny(order.price) }}</small></dd></div><div><dt>运费</dt><dd>{{ formatUsdt(order.shippingFee) }}</dd></div><div><dt>税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="13" /></dt><dd>{{ formatUsdt(order.tax) }}</dd></div></dl><div class="total-block"><span>订单总额</span><strong>{{ formatUsdt(order.totalAmount) }}</strong><small>≈ {{ formatCny(order.totalAmount) }}</small><p>{{ priceSet(order.totalAmount).rateLabel }}</p></div><div v-if="order.paymentBizNo" class="payment-reference"><span>支付凭证</span><p>{{ order.paymentBizNo }}</p></div></section>
          <section class="panel support-panel"><h2>订单沟通</h2><p>通过订单三方群沟通，或联系平台客服。</p><Button class="support-button" @click="contactShopper"><Icon icon="lucide:messages-square" width="16" />打开三方群 IM</Button><Button variant="outline" class="support-button" @click="router.push('/im')">联系平台客服</Button></section>
        </aside>
      </div>
      <ImagePreview v-model="purchasePreviewOpen" :images="purchaseVouchers" :start-index="purchasePreviewIndex" title="采购凭证" />
    </template>
    <EmptyState v-else :title="loadError || '订单不存在'" :description="loadError ? '不会展示不完整的订单数据。' : undefined" :action-text="loadError ? '重新加载' : '返回订单列表'" @action="loadError ? load() : router.push('/order')" />
    <OrderPaymentSelector v-if="order" v-model:visible="paymentOpen" :order="order" @balance="payBalance" />
  </div>
</template>

<style scoped>
.order-detail-page { padding-top: 24px; }
.breadcrumb { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 13px; color: var(--yb-muted); }
.breadcrumb a:hover { color: var(--yb-primary); }
.panel { border: 1px solid var(--yb-hairline); border-radius: 12px; background: var(--yb-surface); padding: 24px; min-width: 0; }
.hero-card { margin-bottom: 24px; background: linear-gradient(120deg, var(--yb-surface), var(--yb-primary-soft)); }
.hero-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.eyebrow { color: var(--yb-gold); font-size: 12px; font-weight: 600; letter-spacing: .12em; margin: 0 0 6px; }
h1 { font-size: 24px; font-weight: 650; margin: 0; overflow-wrap: anywhere; }
.hero-meta { font-size: 13px; color: var(--yb-muted); margin: 8px 0 0; }
.receive-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; color: var(--yb-muted); font-size: 13px; margin-bottom: 16px; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 24px; align-items: start; }
.main-panels, .side-panels { display: grid; gap: 24px; min-width: 0; }
.side-panels { position: sticky; top: 24px; }
h2 { font-size: 20px; font-weight: 650; margin: 0 0 20px; }
.notice { margin-bottom: 16px; }
.notice button { margin-top: 12px; }
#logistics { scroll-margin-top: 24px; }
.voucher-list { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.voucher-label { color: var(--yb-muted); font-size: 13px; width: 100%; }
.voucher-button { position: relative; border: 1px solid var(--yb-hairline); border-radius: 8px; overflow: hidden; width: 88px; height: 88px; }
.voucher-button img { width: 100%; height: 100%; object-fit: cover; transition: transform 200ms; }
.voucher-button svg { position: absolute; bottom: 5px; right: 5px; color: white; background: rgb(0 0 0 / 45%); border-radius: 3px; padding: 2px; width: 20px; height: 20px; }
.voucher-button:hover img { transform: scale(1.03); }
.muted { color: var(--yb-muted); font-size: 14px; }
.goods-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; align-items: center; gap: 20px; }
.cover { width: 88px; height: 88px; object-fit: contain; border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-fill); }
.goods-title { display: block; text-align: left; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.goods-title.linked:hover { color: var(--yb-primary); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag { padding: 2px 6px; font-size: 12px; background: var(--yb-fill); color: var(--yb-primary); border-radius: 4px; }
.tag.overseas { background: var(--yb-champagne); color: var(--yb-gold); }
.goods-amount { display: grid; gap: 4px; text-align: right; font-variant-numeric: tabular-nums; }
.goods-amount strong { font-size: 20px; font-weight: 650; }
.goods-amount small { font-size: 12px; color: var(--yb-muted); }
.info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 0; }
.info-grid dt { font-size: 13px; color: var(--yb-muted); margin-bottom: 6px; }
.info-grid dd { font-size: 14px; margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.info-grid .wide { grid-column: 1 / -1; }
.price-history summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 16px; font-weight: 600; list-style: none; }
.price-history summary::-webkit-details-marker { display: none; }
.price-history summary svg { transition: transform 200ms; }
.price-history[open] summary svg { transform: rotate(180deg); }
.price-history ol { list-style: none; padding: 0; margin: 20px 0 0; }
.price-history li { padding: 12px 0; border-top: 1px solid var(--yb-hairline); font-size: 14px; }
.price-history li p { margin: 5px 0 0; font-size: 12px; color: var(--yb-muted); }
.amount-list { display: grid; gap: 18px; margin: 0; }
.amount-list > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.amount-list dt { display: inline-flex; align-items: center; gap: 4px; color: var(--yb-muted); font-size: 14px; }
.amount-list dd { margin: 0; font-size: 14px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.amount-list dd small, .total-block small { display: block; font-size: 12px; font-weight: 400; color: var(--yb-muted); }
.total-block { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--yb-hairline); display: grid; gap: 5px; }
.total-block > span { font-size: 14px; }
.total-block strong { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
.total-block p { font-size: 12px; color: var(--yb-muted); margin: 8px 0 0; }
.payment-reference { border-top: 1px solid var(--yb-hairline); padding-top: 16px; margin-top: 16px; font-size: 12px; color: var(--yb-muted); }
.payment-reference p { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; margin: 6px 0 0; }
.support-panel p { font-size: 13px; color: var(--yb-muted); }
.support-button { width: 100%; margin-top: 12px; }
.detail-skeletons { display: grid; gap: 24px; }
.hero-skeleton { height: 190px; }
.timeline-skeleton { height: 500px; }
@media (max-width: 1100px) { .detail-layout { grid-template-columns: minmax(0, 1fr) 290px; gap: 16px; } .panel { padding: 20px; } .main-panels, .side-panels { gap: 16px; } }
@media (max-width: 800px) { .detail-layout { grid-template-columns: 1fr; } .side-panels { position: static; } }
@media (prefers-reduced-motion: reduce) { .voucher-button img, .price-history summary svg { transition: none; } }
</style>
