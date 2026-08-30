<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { enums } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import OrderTimeline from '@/components/order/order-timeline.vue';
import OrderActions from '@/components/order/order-actions.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as orderApi from '@/service/api/order';
import * as reviewApi from '@/service/api/review';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const order = ref<Api.RealOrder.Record>();
const permissions = computed(() => getOrderCapabilities(order.value, userStore.currentUser?.id));
const logisticsSection = ref<HTMLElement>();

function viewLogistics() {
  logisticsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const logistics = ref<Api.RealOrder.LogisticsDTO>();
const logisticsError = ref('');
const reviewable = ref(false);
const reviewableError = ref('');
const reviewableLoading = ref(false);
const reviewableGuard = createLatestRequestGuard();
const loading = ref(false);
const loadError = ref('');
const acting = ref(false);
const confirmationOpen = ref(false);
const requestGuard = createLatestRequestGuard();
let actionVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

const id = computed(() => String(route.params.id || ''));

async function loadReviewable() {
  const isCurrent = reviewableGuard.begin();
  const requestedId = order.value?.id;
  const requestedUserId = userStore.currentUser?.id;
  reviewable.value = false;
  reviewableError.value = '';
  reviewableLoading.value = false;
  if (requestedId === undefined || requestedUserId === undefined || !permissions.value.review) return;
  reviewableLoading.value = true;
  try {
    const result = await reviewApi.findReviewableOrderIds([requestedId], { signal: isCurrent.signal });
    if (!isCurrent() || !sameBusinessId(order.value?.id, requestedId) || !sameBusinessId(userStore.currentUser?.id, requestedUserId)) return;
    reviewable.value = result.has(String(requestedId));
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
    void loadReviewable();
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
  confirmationModal?.close();
  requestGuard.invalidate();
  reviewableGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  actionVersion += 1;
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
const carrierMeta = computed(() =>
  order.value?.shippingCarrier ? enums.CARRIER_META[order.value.shippingCarrier] : undefined
);
interface TrackEvent {
  time: string;
  location: string;
  description: string;
}

const trackEvents = computed<TrackEvent[]>(() => {
  return (logistics.value?.tracks || []).map(track => ({
    time: formatTime(track.occurredAt),
    location: track.location || '—',
    description: track.description || track.statusText || track.status
  }));
});

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

async function pay() {
  if (!permissions.value.pay) return;
  if (!order.value || acting.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  const isCurrentAction = () => operation === actionVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(order.value?.id, requestedOrderId);
  acting.value = true;
  try {
    const r = await orderApi.payOrder(requestedOrderId);
    if (!isCurrentAction()) return;
    if (r.ok) { Message.success('支付成功'); await load(); }
    else Message.error(r.message || '支付失败');
  } catch { if (isCurrentAction()) Message.error('支付请求失败，请稍后重试'); }
  finally { if (operation === actionVersion) acting.value = false; }
}

function cancel() {
  if (!permissions.value.cancel) return;
  if (!order.value || acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '取消订单？',
    content: '取消后订单将不可恢复',
    okButtonProps: { status: 'danger' },
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
        const r = await orderApi.cancelOrder(requestedOrderId);
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

function confirm() {
  if (!permissions.value.confirm) return;
  if (!order.value || acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++actionVersion;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '确认收货？',
    content: '请确认您已收到商品并验货无误',
    onCancel() {
      if (operation === actionVersion) confirmationOpen.value = false;
    },
    async onOk() {
      const isCurrentAction = () => operation === actionVersion
        && String(userStore.currentUser?.id) === String(requestedUserId)
        && sameBusinessId(order.value?.id, requestedOrderId);
      if (!isCurrentAction() || !permissions.value.confirm) {
        if (operation === actionVersion) confirmationOpen.value = false;
        return;
      }
      acting.value = true;
      try {
        const r = await orderApi.confirmReceipt(requestedOrderId);
        if (!isCurrentAction()) return;
        if (r.ok) { Message.success('已确认收货'); await load(); }
        else Message.error(r.message || '确认收货失败');
      } catch { if (isCurrentAction()) Message.error('确认收货请求失败，请稍后重试'); }
      finally {
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
  <div class="order-detail-page shop-container">
    <a-spin :loading="loading">
      <template v-if="order">
        <a-alert v-if="reviewableLoading" type="info">正在核对评价资格，不影响查看订单详情。</a-alert>
        <a-alert v-if="reviewableError" type="warning">
          {{ reviewableError }}
          <template #action><a-button :loading="reviewableLoading" @click="loadReviewable">重新核对</a-button></template>
        </a-alert>
        <a-card class="hero-card" :body-style="{ padding: '24px' }">
          <div class="hero-head">
            <OrderStatusTag :status="order.status" size="large" />
            <div class="hero-text">
              <div class="hero-code">订单号：{{ order.code }}</div>
              <div class="hero-meta">创建于 {{ formatTime(order.createdAt) }} · 买手 {{ order.shopperName }}</div>
            </div>
            <OrderActions :order="order" :reviewable="reviewable" variant="detail" @pay="pay" @cancel="cancel" @confirm="confirm" @review="goReview" @aftersale="goAftersale" @cs="contactShopper" @logistics="viewLogistics" />
          </div>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">订单进度</div>
          <a-alert v-if="logisticsError" class="contract-alert" type="error" :closable="false">
            {{ logisticsError }}<template #action><a-button size="mini" @click="load">重新加载</a-button></template>
          </a-alert>
          <OrderTimeline :order="order" />
        </a-card>

        <div id="logistics" ref="logisticsSection"></div>
        <a-card v-if="logistics" class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">物流状态</div>
          <div class="logistics-meta">
            <a-tag v-if="logistics.logisticsStatusText" color="arcoblue">{{ logistics.logisticsStatusText }}</a-tag>
            <span class="muted">{{ logistics.carrierName || logistics.carrier || '承运方待回传' }}</span>
            <span class="muted">运单号 {{ logistics.trackingNo || '—' }}</span>
          </div>
          <a-timeline v-if="trackEvents.length">
            <a-timeline-item v-for="ev in trackEvents" :key="ev.time">
              <div class="track-desc">{{ ev.description }}</div>
              <div class="track-loc">{{ ev.location }}</div>
              <div class="track-time">{{ ev.time }}</div>
            </a-timeline-item>
          </a-timeline>
          <div v-else class="muted">{{ logistics.logisticsStatusText || '暂无物流轨迹' }}</div>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">收货信息</div>
          <a-descriptions :data="[
            { label: '收货人', value: order.receiverName },
            { label: '手机', value: order.receiverPhone },
            { label: '地址', value: order.shippingAddress },
            { label: '邮编', value: order.postalCode || '—' },
            { label: '地址 ID', value: order.addressId ? String(order.addressId) : '—' }
          ]" :column="3" />
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">商品信息</div>
          <div class="goods-row">
            <img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle || '商品图片'" class="cover" @error="setImageFallback" />
            <div class="info">
              <div
                class="title"
                role="link"
                tabindex="0"
                @click="router.push({ name: 'product-detail', params: { id: String(order.productId) } })"
                @keydown.enter="router.push({ name: 'product-detail', params: { id: String(order.productId) } })"
                @keydown.space.prevent="router.push({ name: 'product-detail', params: { id: String(order.productId) } })"
              >
                {{ order.productTitle }}
              </div>
              <div class="tags">
                <a-tag v-if="aftersaleMeta" :color="aftersaleMeta.color" size="small">{{ aftersaleMeta.label }}</a-tag>
                <a-tag v-if="order.overseasCustoms" color="orange" size="small">海外直邮</a-tag>
              </div>
            </div>
            <div class="amount">
              <span class="amount-cny">{{ formatUsdt(order.price) }}</span>
              <span class="amount-usdt">≈ {{ formatCny(order.price) }}</span>
            </div>
          </div>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">金额明细</div>
          <div class="amt-list">
            <div class="amt-row">
              <span class="k">商品金额</span>
              <span class="v"><span class="cny">{{ formatUsdt(order.price) }}</span><span class="usdt">≈ {{ formatCny(order.price) }}</span></span>
            </div>
            <div class="amt-row">
              <span class="k">运费</span>
              <span class="v"><span class="cny">{{ formatUsdt(order.shippingFee) }}</span></span>
            </div>
            <div class="amt-row">
              <span class="k">税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="12" /></span>
              <span class="v"><span class="cny">{{ formatUsdt(order.tax) }}</span></span>
            </div>
            <div class="amt-row total">
              <span class="k">订单总额</span>
              <span class="v"><span class="cny total-big">{{ formatUsdt(order.totalAmount) }}</span><span class="usdt">≈ {{ formatCny(order.totalAmount) }} · {{ priceSet(order.totalAmount).rateLabel }}</span></span>
            </div>
            <div v-if="order.paymentBizNo" class="amt-row">
              <span class="k">支付凭证</span>
              <span class="v yb-mono">{{ order.paymentBizNo }}</span>
            </div>
          </div>
        </a-card>

        <a-card v-if="order.shippingVoucherUrls?.length || order.shippedRemark || order.refundId" class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">履约与退款信息</div>
          <a-descriptions :column="2" :data="[
            { label: '发货备注', value: order.shippedRemark || '—' },
            { label: '退款单号', value: order.refundId ? String(order.refundId) : '—' },
            { label: '退款状态', value: order.refundStatus || '—' },
            { label: '退款金额', value: order.refundAmount ? formatUsdt(order.refundAmount) : '—' }
          ]" />
          <div v-if="order.shippingVoucherUrls?.length" class="voucher-list">
            <span class="voucher-label">发货凭证</span>
            <a-image-preview-group>
              <a-image v-for="url in order.shippingVoucherUrls" :key="url" :src="url" width="88" height="88" fit="cover" />
            </a-image-preview-group>
          </div>
        </a-card>

        <a-card v-if="order.priceHistory?.length" class="step-card" :body-style="{ padding: '20px 24px' }">
          <a-collapse :default-active-key="[]">
            <a-collapse-item :header="`改价历史 (${order.priceHistory.length} 条)`" key="1">
              <a-timeline>
                <a-timeline-item v-for="(h, i) in order.priceHistory" :key="i">
                  <div>{{ h.field }} <span class="yb-mono">{{ formatUsdt(h.before) }}</span> → <span class="yb-mono">{{ formatUsdt(h.after) }}</span></div>
                  <div class="muted small">≈ {{ formatCny(h.before) }} → {{ formatCny(h.after) }}</div>
                  <div class="muted small">{{ h.operator || '系统' }} · {{ formatTime(h.changedAt) }} · {{ h.reason }}</div>
                </a-timeline-item>
              </a-timeline>
            </a-collapse-item>
          </a-collapse>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">三方群 / 客服</div>
          <a-space>
            <a-button type="primary" @click="contactShopper">
              打开三方群 IM
            </a-button>
            <a-button @click="router.push('/im')">联系平台客服</a-button>
          </a-space>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">关键时间</div>
          <a-descriptions :data="[
            { label: '下单', value: formatTime(order.createdAt) },
            { label: '付款', value: formatTime(order.paidAt) },
            { label: '采购完成', value: formatTime(order.procuredAt) },
            { label: '发货', value: formatTime(order.shippedAt) },
            { label: '签收', value: formatTime(order.deliveredAt) },
            { label: '归档', value: formatTime(order.archivedAt) }
          ]" :column="3" />
        </a-card>
      </template>

      <EmptyState v-else-if="!loading" :title="loadError || '订单不存在'" :description="loadError ? '不会展示不完整的订单数据。' : undefined" :action-text="loadError ? '重新加载' : '返回订单列表'" @action="loadError ? load() : router.push('/order')" />
    </a-spin>
  </div>
</template>

<style scoped>
.order-detail-page {
  width: fit-content;
  max-width: calc(100% - 32px);
  margin: 0 auto;
  padding-top: 16px;
}
.hero-card {
  background: linear-gradient(135deg, #fff 0%, #f7faff 100%);
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.hero-head {
  display: flex;
  align-items: center;
  gap: 16px;
}
.hero-text {
  flex: 1;
}
.hero-code {
  font-size: 16px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.hero-meta {
  font-size: 12px;
  color: #86909c;
  margin-top: 4px;
}
.step-card {
  margin-bottom: 12px;
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.contract-alert {
  margin-bottom: 12px;
}
.logistics-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}
.track-desc {
  font-size: 13px;
  color: #1d2129;
  font-weight: 500;
}
.track-loc {
  font-size: 12px;
  color: #4e5969;
}
.track-time {
  font-size: 11px;
  color: #86909c;
}
.voucher-list { margin-top: 16px; display: flex; gap: 12px; align-items: flex-start; }
.voucher-label { color: var(--yb-muted); font-size: 13px; white-space: nowrap; }
.goods-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  align-items: center;
  gap: 16px;
}
.cover {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
}
.title {
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #1d2129;
}
.title:hover {
  color: var(--bw-brand-primary);
}
.title:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
.tags {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}
.amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.amount-cny {
  font-family: var(--yb-font-mono);
  font-size: 18px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-muted);
  margin-top: 2px;
}
.amt-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.amt-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px dashed var(--yb-hairline);
}
.amt-row:last-child { border-bottom: none; }
.amt-row.total {
  border-top: 1px solid var(--yb-hairline);
  border-bottom: none;
  padding-top: 12px;
  margin-top: 4px;
}
.amt-row .k {
  color: var(--yb-muted);
  font-size: 13px;
}
.amt-row .v {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
}
.amt-row .cny {
  color: var(--yb-ink);
  font-family: var(--yb-font-mono);
  font-weight: 600;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.amt-row .usdt {
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  font-size: 11px;
  margin-top: 2px;
}
.total-big {
  font-size: 24px !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em;
}
.muted {
  color: var(--yb-muted);
}
.small {
  font-size: 11px;
}
@media (max-width: 640px) {
  .order-detail-page { width: auto; max-width: none; padding-top: 10px; }
  .hero-head { align-items: flex-start; flex-wrap: wrap; gap: 10px; }
  .hero-text { min-width: 0; flex-basis: calc(100% - 56px); }
  .hero-code, .hero-meta { overflow-wrap: anywhere; }
  .goods-row { grid-template-columns: 64px minmax(0, 1fr); gap: 12px; }
  .cover { width: 64px; height: 64px; }
  .amount { grid-column: 2; align-items: flex-start; }
  .voucher-list { align-items: stretch; flex-direction: column; }
  .total-big { font-size: 20px !important; }
}
</style>
