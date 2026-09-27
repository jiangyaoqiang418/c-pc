<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { formatUsdt } from '@shared/utils/currency';
import { formatDateValue, parseDateValue } from '@/utils/date-range';

const props = defineProps<{
  order: Api.RealOrder.Record;
  logistics?: Api.RealOrder.LogisticsDTO;
}>();

interface TimelineEvent {
  key: string;
  title: string;
  detail?: string;
  location?: string;
  source?: string;
  shippingInfo?: string;
  shippingFees?: string;
  shippedRemark?: string;
  shipVouchers?: string[];
  eta?: string;
  exceptionSummary?: string;
  registeredAt?: string;
  trackTrackingNo?: string;
  occurredAt?: string | number;
  icon?: string;
  major: boolean;
  exceptional?: boolean;
}

const trackLabels: Record<Api.RealOrder.LogisticsStatus, string> = {
  PENDING_SHIPMENT: '待发货',
  SHIPPED: '已发货',
  IN_TRANSIT: '运输中',
  DELIVERING: '派送中',
  SIGNED: '已签收',
  EXCEPTION: '物流异常',
  RETURNED: '已退回'
};

const trackIcons: Partial<Record<Api.RealOrder.LogisticsStatus, string>> = {
  SHIPPED: 'lucide:package-check',
  IN_TRANSIT: 'lucide:truck',
  DELIVERING: 'lucide:map-pin',
  SIGNED: 'lucide:package-check',
  EXCEPTION: 'lucide:circle-alert',
  RETURNED: 'lucide:rotate-ccw'
};

function eventTime(value?: string | number) {
  const timestamp = parseDateValue(value);
  return timestamp !== undefined && Number.isFinite(timestamp) && !Number.isNaN(new Date(timestamp).getTime())
    ? timestamp : undefined;
}

const events = computed<TimelineEvent[]>(() => {
  const order = props.order;
  const matchingLogistics = props.logistics && String(props.logistics.orderId) === String(order.id) ? props.logistics : undefined;
  const carrier = matchingLogistics?.carrierName || matchingLogistics?.carrier || order.carrierName || order.logisticsCompany;
  const trackingNo = matchingLogistics?.trackingNo || order.trackingNumber;
  const shippingInfo = [carrier, trackingNo ? `运单号 ${trackingNo}` : ''].filter(Boolean).join(' · ');
  const shippingFees = [
    matchingLogistics?.shippingFee != null ? `发货运费 ${formatUsdt(matchingLogistics.shippingFee)}` : '',
    matchingLogistics?.taxFee != null ? `发货税费 ${formatUsdt(matchingLogistics.taxFee)}` : ''
  ].filter(Boolean).join(' · ');
  const shippedRemark = matchingLogistics?.shippedRemark || order.shippedRemark;
  const shipVouchers = matchingLogistics?.shipVouchers?.length
    ? matchingLogistics.shipVouchers
    : order.shippingVoucherUrls?.length ? order.shippingVoucherUrls : order.shippingScreenshotUrl ? [order.shippingScreenshotUrl] : [];
  const hasShippedTrack = matchingLogistics?.tracks?.some(track => track.status === 'SHIPPED');
  const hasTrackAt = (status: Api.RealOrder.LogisticsStatus, value: string | number) => {
    const timestamp = eventTime(value);
    return timestamp !== undefined && matchingLogistics?.tracks?.some(track => track.status === status && eventTime(track.occurredAt) === timestamp);
  };
  const result: TimelineEvent[] = [
    { key: 'created', title: '已下单', detail: '订单已提交', occurredAt: order.createdAt, icon: 'lucide:clipboard-list', major: true }
  ];
  if (order.paidAt) result.push({ key: 'paid', title: '已付款', detail: '订单支付成功', occurredAt: order.paidAt, icon: 'lucide:credit-card', major: true });
  const shippedAt = order.shippedAt || matchingLogistics?.shippedAt;
  if (shippedAt && !hasTrackAt('SHIPPED', shippedAt)) {
    result.push({
      key: 'shipped', title: '已发货', detail: '买手已提交发货信息', occurredAt: shippedAt,
      shippingInfo: hasShippedTrack ? undefined : shippingInfo,
      shippingFees: hasShippedTrack ? undefined : shippingFees,
      shippedRemark: hasShippedTrack ? undefined : shippedRemark,
      shipVouchers: hasShippedTrack ? undefined : shipVouchers,
      icon: 'lucide:package-check', major: true
    });
  }
  const completedAt = order.deliveredAt || matchingLogistics?.completedAt;
  const orderCompleted = ['COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED'].includes(order.status);
  const confirmedTrack = orderCompleted && completedAt && matchingLogistics?.tracks?.find(track => track.status === 'SIGNED' && track.source === 'MANUAL' && /确认收货/.test(track.description || '') && eventTime(track.occurredAt) === eventTime(completedAt));
  if (orderCompleted && completedAt && !confirmedTrack) {
    result.push({ key: 'completed', title: '订单完成', detail: '买家已确认收货', occurredAt: completedAt, icon: 'lucide:circle-check', major: true });
  }
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'IN_AFTERSALE') {
    const title = order.status === 'CANCELLED' ? '已取消' : order.status === 'REFUNDED' ? '退款完成' : '售后中';
    result.push({ key: 'status-' + order.status, title, occurredAt: order.archivedAt, icon: 'lucide:circle-alert', major: true, exceptional: true });
  }

  const currentStages: Partial<Record<Api.Order.OrderStatus, { title: string; icon: string }>> = {
    PROCURING: { title: '采购中', icon: 'lucide:shopping-bag' },
    PROCURED: { title: '已采购', icon: 'lucide:package-check' },
    IN_TRANSIT: { title: '运输中', icon: 'lucide:truck' },
    AFTERSALE_CONFIRM: { title: '待确认收货', icon: 'lucide:package-search' },
    WARRANTY: { title: '质保中', icon: 'lucide:shield-check' },
    ARCHIVED: { title: '已归档', icon: 'lucide:archive' }
  };
  const currentStage = currentStages[order.status];
  if (currentStage && !(order.status === 'IN_TRANSIT' && matchingLogistics?.logisticsStatus)) {
    result.push({ key: 'status-' + order.status, title: currentStage.title, occurredAt: order.status === 'PROCURED' ? order.procuredAt : undefined, icon: currentStage.icon, major: true });
  }

  if (matchingLogistics) {
    const currentStatus = matchingLogistics.logisticsStatus;
    const latestTrack = [...(matchingLogistics.tracks || [])].sort((a, b) => (eventTime(b.occurredAt) ?? -1) - (eventTime(a.occurredAt) ?? -1))[0];
    const statusRepresented = latestTrack?.status === currentStatus || (currentStatus === 'SHIPPED' && result.some(event => event.key === 'shipped'));
    if (currentStatus && !statusRepresented) {
      result.push({ key: 'status-logistics', title: matchingLogistics.logisticsStatusText || trackLabels[currentStatus], detail: '当前物流状态', exceptionSummary: matchingLogistics.logisticsException || undefined, icon: trackIcons[currentStatus] || 'lucide:package', major: true, exceptional: currentStatus === 'EXCEPTION' });
    }
    const tracks = [...(matchingLogistics.tracks || [])].sort((a, b) => (eventTime(a.occurredAt) ?? -1) - (eventTime(b.occurredAt) ?? -1));
    const shippedTrackIndex = tracks.findIndex(track => track.status === 'SHIPPED');
    tracks.forEach((track, index) => {
      const major = index === 0 || tracks[index - 1]?.status !== track.status;
      const label = track.statusText?.trim() || trackLabels[track.status] || '物流更新';
      const description = track.description?.trim();
      const occurredAt = eventTime(track.occurredAt);
      const createdAt = eventTime(track.createdAt);
      const showShipmentDetails = index === shippedTrackIndex || (shippedTrackIndex < 0 && !shippedAt && index === 0);
      result.push({
        key: 'track-' + String(track.trackId),
        title: track === confirmedTrack ? '买家确认收货 · 订单完成' : major ? label : description || label,
        detail: track !== confirmedTrack && major && description && description !== label ? description : undefined,
        location: track.location?.trim() || undefined,
        source: track.sourceText || (track.source === 'CARRIER_SYNC' ? '承运商同步' : track.source === 'MANUAL' ? '人工登记' : undefined),
        shippingInfo: showShipmentDetails ? shippingInfo : undefined,
        shippingFees: showShipmentDetails ? shippingFees : undefined,
        shippedRemark: showShipmentDetails ? shippedRemark : undefined,
        shipVouchers: showShipmentDetails ? shipVouchers : undefined,
        exceptionSummary: (track.exceptionNode || track.status === 'EXCEPTION') && matchingLogistics.logisticsException ? matchingLogistics.logisticsException : undefined,
        registeredAt: occurredAt !== undefined && createdAt !== undefined && Math.abs(createdAt - occurredAt) >= 60_000 ? `${track.source === 'CARRIER_SYNC' ? '同步' : '登记'}于 ${formatDateValue(createdAt)}` : undefined,
        trackTrackingNo: track.trackingNo && track.trackingNo !== trackingNo ? `当时运单号 ${track.trackingNo}` : undefined,
        occurredAt: track.occurredAt,
        icon: trackIcons[track.status] || 'lucide:package',
        major: major || track === confirmedTrack,
        exceptional: track.status === 'EXCEPTION' || track.exceptionNode === true
      });
    });
    if (!shippedAt && !tracks.length && (shippingInfo || shippingFees || shippedRemark || shipVouchers.length)) {
      result.push({ key: 'shipment-info', title: '发货资料', shippingInfo, shippingFees, shippedRemark, shipVouchers, icon: 'lucide:package', major: true });
    }
    if (matchingLogistics.logisticsException && !result.some(event => event.exceptionSummary)) {
      result.push({ key: 'status-logistics-exception', title: '物流异常记录', exceptionSummary: matchingLogistics.logisticsException, icon: 'lucide:circle-alert', major: true, exceptional: true });
    }
  }

  result.sort((a, b) => {
    const aTime = eventTime(a.occurredAt);
    const bTime = eventTime(b.occurredAt);
    if (aTime === undefined && bTime === undefined) return 0;
    if (aTime === undefined) return a.key.startsWith('status-') ? -1 : 1;
    if (bTime === undefined) return b.key.startsWith('status-') ? 1 : -1;
    return bTime - aTime;
  });
  const eta = eventTime(matchingLogistics?.eta || order.eta);
  const completed = ['COMPLETED', 'WARRANTY', 'IN_AFTERSALE', 'ARCHIVED', 'REFUNDED', 'CANCELLED'].includes(order.status);
  if (eta !== undefined && eta > Date.now() && !completed && !matchingLogistics?.completedAt && matchingLogistics?.logisticsStatus !== 'SIGNED') {
    const latestLogisticsEvent = result.find(event => event.key.startsWith('track-') || event.key === 'shipped' || event.key === 'status-logistics' || event.key === 'status-IN_TRANSIT');
    if (latestLogisticsEvent) latestLogisticsEvent.eta = formatDateValue(eta);
  }
  return result;
});

const rows = computed(() => {
  let previousDate = '';
  return events.value.map(event => {
    const timestamp = eventTime(event.occurredAt);
    const date = timestamp === undefined ? undefined : new Date(timestamp);
    const dateKey = date
      ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
      : '';
    const showDate = !!dateKey && dateKey !== previousDate;
    if (dateKey) previousDate = dateKey;
    return {
      ...event,
      date: showDate && date ? dateKey + '/周' + '日一二三四五六'[date.getDay()] : '',
      datetime: date?.toISOString(),
      time: date
        ? [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':')
        : '—'
    };
  });
});
</script>

<template>
  <ol class="order-timeline" aria-label="订单进度">
    <li v-for="(event, index) in rows" :key="event.key" class="event" :class="{ 'event--latest': index === 0, 'event--exception': event.exceptional }">
      <div class="stamp">
        <span class="date">{{ event.date }}</span>
        <time class="time" :datetime="event.datetime">{{ event.time }}</time>
      </div>
      <div class="rail">
        <span v-if="event.major" class="node node--major"><Icon :icon="event.icon || 'lucide:package'" width="16" /></span>
        <span v-else class="node node--minor" />
      </div>
      <div class="content">
        <div class="event-title" :class="{ 'event-title--major': event.major }">{{ event.title }}</div>
        <div v-if="event.detail" class="event-detail">{{ event.detail }}</div>
        <div v-if="event.location || event.source || event.shippingInfo" class="event-meta">{{ [event.location, event.source, event.shippingInfo].filter(Boolean).join(' · ') }}</div>
        <div v-if="event.trackTrackingNo || event.registeredAt" class="event-meta">{{ [event.trackTrackingNo, event.registeredAt].filter(Boolean).join(' · ') }}</div>
        <div v-if="event.shippingFees" class="event-meta">{{ event.shippingFees }}</div>
        <div v-if="event.shippedRemark" class="event-detail">发货备注：{{ event.shippedRemark }}</div>
        <div v-if="event.eta" class="event-meta">预计送达：{{ event.eta }}</div>
        <div v-if="event.exceptionSummary" class="event-exception">物流异常：{{ event.exceptionSummary }}</div>
        <div v-if="event.shipVouchers?.length" class="event-vouchers">
          <span class="event-meta">发货凭证</span>
          <a-image-preview-group>
            <a-image v-for="url in event.shipVouchers" :key="url" :src="url" width="72" height="72" fit="cover" />
          </a-image-preview-group>
        </div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.order-timeline { margin: 0; padding: 4px 0 0; list-style: none; }
.event { display: grid; grid-template-columns: 230px 36px minmax(0, 1fr); min-height: 68px; }
.stamp { display: grid; grid-template-columns: 136px 1fr; align-content: start; gap: 10px; padding-top: 5px; color: #4e5969; font-size: 13px; white-space: nowrap; }
.date { text-align: right; }
.time { font-variant-numeric: tabular-nums; }
.rail { position: relative; display: flex; justify-content: center; align-items: flex-start; }
.rail::before { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: #e5e6eb; content: ''; transform: translateX(-50%); }
.event:first-child .rail::before { top: 17px; }
.event:last-child .rail::before { bottom: calc(100% - 17px); }
.node { position: relative; z-index: 1; flex: none; }
.node--major { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #e5e6eb; color: #86909c; }
.node--minor { width: 8px; height: 8px; margin-top: 10px; border: 2px solid #fff; border-radius: 50%; background: #b9bdc5; box-sizing: content-box; }
.event--latest .node--major { background: var(--bw-brand-primary); color: #fff; }
.event--exception .node--major { background: #f53f3f; color: #fff; }
.content { min-width: 0; padding: 4px 0 22px 24px; }
.event-title { color: #4e5969; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.event-title--major { color: #1d2129; font-weight: 600; }
.event-detail { margin-top: 3px; color: #4e5969; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.event-meta { margin-top: 3px; color: #86909c; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.event-exception { margin-top: 3px; color: #f53f3f; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.event-vouchers { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
@media (max-width: 720px) {
  .event { grid-template-columns: 92px 30px minmax(0, 1fr); }
  .stamp { display: flex; flex-direction: column; gap: 2px; padding-top: 2px; font-size: 11px; }
  .date { text-align: left; white-space: normal; }
  .content { padding-left: 12px; }
}
</style>
