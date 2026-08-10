<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { enums } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import OrderTimeline from '@/components/order/order-timeline.vue';
import OrderActions from '@/components/order/order-actions.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as orderApi from '@/service/api/order';

const route = useRoute();
const router = useRouter();
const order = ref<Api.Order.OrderRecord>();
const loading = ref(false);

const id = computed(() => String(route.params.id || ''));

async function load() {
  loading.value = true;
  try {
    order.value = await orderApi.fetchOrderDetail(id.value);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);

const aftersaleMeta = computed(() => (order.value ? enums.AFTERSALE_TYPE_META[order.value.aftersaleType] : undefined));
const carrierMeta = computed(() =>
  order.value?.shippingCarrier ? enums.CARRIER_META[order.value.shippingCarrier] : undefined
);
const backendMissingFields = computed(() => {
  if (!order.value) return [];
  const fields: string[] = [];
  if (order.value.shippingAddress === '后端暂未返回收货地址') fields.push('收货地址');
  if (!order.value.trackingNumber) fields.push('物流信息');
  if (!order.value.purchaseScreenshotUrl) fields.push('采购凭证');
  if (!order.value.shippingScreenshotUrl) fields.push('发货凭证');
  return fields;
});

interface TrackEvent {
  time: string;
  location: string;
  description: string;
}

const trackEvents = computed<TrackEvent[]>(() => {
  if (!order.value || !order.value.shippedAt) return [];
  const start = new Date(order.value.shippedAt).getTime();
  const labels: { offsetH: number; location: string; description: string }[] = [
    { offsetH: 0, location: '香港 · 顺丰国际枢纽', description: '快件已发出' },
    { offsetH: 6, location: '香港 · 海关清关中', description: '正在办理出境清关手续' },
    { offsetH: 18, location: '上海 · 浦东国际机场', description: '快件已到达，等待干线运输' },
    { offsetH: 36, location: '北京 · 朝阳分拣中心', description: '快件抵达派送站点' },
    { offsetH: 48, location: '北京 · 朝阳区国贸营业部', description: '快件正在派送中' }
  ];
  const max = order.value.deliveredAt ? new Date(order.value.deliveredAt).getTime() : Date.now();
  return labels
    .filter(l => start + l.offsetH * 3600_000 <= max)
    .map(l => ({
      time: new Date(start + l.offsetH * 3600_000).toLocaleString(),
      location: l.location,
      description: l.description
    }))
    .reverse();
});

async function pay() {
  if (!order.value) return;
  const r = await orderApi.payOrder(order.value.id);
  if (r.ok) {
    Message.success('支付成功');
    load();
  } else {
    Message.error(r.message || '支付失败');
  }
}

function cancel() {
  if (!order.value) return;
  Modal.confirm({
    title: '取消订单？',
    content: '取消后订单将不可恢复',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const r = await orderApi.cancelOrder(order.value!.id);
      if (r.ok) {
        Message.success('订单已取消');
        load();
      }
    }
  });
}

function confirm() {
  if (!order.value) return;
  Modal.confirm({
    title: '确认收货？',
    content: '请确认您已收到商品并验货无误',
    async onOk() {
      const r = await orderApi.confirmReceipt(order.value!.id);
      if (r.ok) {
        Message.success('已确认收货');
        load();
      }
    }
  });
}

function goReview() {
  if (!order.value) return;
  router.push({ name: 'review-write', params: { orderId: String(order.value.id) } });
}

function goAftersale() {
  if (!order.value) return;
  if (order.value.status === 'IN_AFTERSALE') {
    router.push({ name: 'aftersale-list' });
  } else {
    router.push({ name: 'aftersale-create', params: { orderId: String(order.value.id) } });
  }
}
</script>

<template>
  <div class="order-detail-page shop-container">
    <a-spin :loading="loading">
      <template v-if="order">
        <a-card class="hero-card" :body-style="{ padding: '24px' }">
          <div class="hero-head">
            <OrderStatusTag :status="order.status" size="large" />
            <div class="hero-text">
              <div class="hero-code">订单号：{{ order.code }}</div>
              <div class="hero-meta">创建于 {{ new Date(order.createdAt).toLocaleString() }} · 买手 {{ order.shopperName }}</div>
            </div>
            <OrderActions :order="order" variant="detail" @pay="pay" @cancel="cancel" @confirm="confirm" @review="goReview" @aftersale="goAftersale" />
          </div>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">订单进度</div>
          <a-alert
            v-if="backendMissingFields.length"
            class="contract-alert"
            type="warning"
            :show-icon="false"
          >
            后端当前未返回：{{ backendMissingFields.join('、') }}，页面已按默认值降级展示。
          </a-alert>
          <OrderTimeline :order="order" />
        </a-card>

        <a-card v-if="trackEvents.length" class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">物流轨迹</div>
          <div class="logistics-meta">
            <a-tag v-if="carrierMeta" :color="carrierMeta.color">{{ carrierMeta.label }}</a-tag>
            <span class="muted">运单号 {{ order.trackingNumber }}</span>
          </div>
          <a-timeline>
            <a-timeline-item v-for="ev in trackEvents" :key="ev.time">
              <div class="track-desc">{{ ev.description }}</div>
              <div class="track-loc">{{ ev.location }}</div>
              <div class="track-time">{{ ev.time }}</div>
            </a-timeline-item>
          </a-timeline>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">收货信息</div>
          <a-descriptions :data="[
            { label: '收货人', value: order.receiverName },
            { label: '手机', value: order.receiverPhone },
            { label: '地址', value: order.shippingAddress }
          ]" :column="3" />
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">商品信息</div>
          <div class="goods-row">
            <img :src="order.productCover || `https://picsum.photos/seed/${order.productId}/120/120`" class="cover" />
            <div class="info">
              <div class="title" @click="router.push({ name: 'product-detail', params: { id: String(order.productId) } })">
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
          </div>
        </a-card>

        <a-card v-if="order.priceHistory?.length" class="step-card" :body-style="{ padding: '20px 24px' }">
          <a-collapse :default-active-key="[]">
            <a-collapse-item :header="`改价历史 (${order.priceHistory.length} 条)`" key="1">
              <a-timeline>
                <a-timeline-item v-for="(h, i) in order.priceHistory" :key="i">
                  <div>{{ h.field }} <span class="yb-mono">{{ formatUsdt(h.before) }}</span> → <span class="yb-mono">{{ formatUsdt(h.after) }}</span></div>
                  <div class="muted small">≈ {{ formatCny(h.before) }} → {{ formatCny(h.after) }}</div>
                  <div class="muted small">{{ h.operator || '系统' }} · {{ new Date(h.changedAt).toLocaleString() }} · {{ h.reason }}</div>
                </a-timeline-item>
              </a-timeline>
            </a-collapse-item>
          </a-collapse>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">三方群 / 客服</div>
          <a-space>
            <a-button type="primary" @click="router.push({ name: 'im-order-group', params: { orderCode: order.code } })">
              打开三方群 IM
            </a-button>
            <a-button @click="router.push('/im')">联系平台客服</a-button>
          </a-space>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
          <div class="section-title">关键时间</div>
          <a-descriptions :data="[
            { label: '下单', value: new Date(order.createdAt).toLocaleString() },
            { label: '付款', value: order.paidAt ? new Date(order.paidAt).toLocaleString() : '—' },
            { label: '采购完成', value: order.procuredAt ? new Date(order.procuredAt).toLocaleString() : '—' },
            { label: '发货', value: order.shippedAt ? new Date(order.shippedAt).toLocaleString() : '—' },
            { label: '签收', value: order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : '—' },
            { label: '归档', value: order.archivedAt ? new Date(order.archivedAt).toLocaleString() : '—' }
          ]" :column="3" />
        </a-card>
      </template>

      <EmptyState v-else-if="!loading" title="订单不存在" action-text="返回订单列表" @action="router.push('/order')" />
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
</style>
