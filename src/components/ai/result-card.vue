<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { enums } from '@shared';

const props = defineProps<{ card: Api.Ai.CardData }>();
defineEmits<{ login: [] }>();
const titles: Record<string, string> = { products: '商品查询', product: '商品查询', order: '订单查询', balance: '钱包余额', recharge: '充值记录', withdraw: '转出记录', order_pay: '订单钱包直付' };
const kind = computed(() => props.card.kind ?? '');
const isProduct = computed(() => kind.value === 'products' || kind.value === 'product');
const supported = computed(() => Object.hasOwn(titles, kind.value));
const title = computed(() => supported.value ? titles[kind.value] : '查询结果');
const rows = computed(() => (props.card.rows ?? []).slice(0, 100));
const icons: Record<string, string> = { products: 'shopping-bag', product: 'shopping-bag', order: 'package', balance: 'wallet', recharge: 'arrow-down-left', withdraw: 'arrow-up-right', order_pay: 'credit-card' };
const cardIcon = computed(() => `lucide:${icons[kind.value] || 'clipboard-list'}`);
const isBusiness = computed(() => supported.value && !isProduct.value);
const text = (value: unknown) => typeof value === 'string' ? value : '暂不可用';
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : text(value);
const orderStatuses: Record<Api.RealOrder.OrderStatus, string> = {
  CREATED: '待付款', PAID: '已付款', SHIPPED: '已发货', AFTERSALE_CONFIRM: '售后确认',
  REFUND_REVIEW: '退款审核中', REFUNDED: '已退款', COMPLETED: '已完成', CANCELED: '已取消'
};
const logisticsStatuses: Record<Api.RealOrder.LogisticsStatus, string> = {
  PENDING_SHIPMENT: '待发货', SHIPPED: '已发货', IN_TRANSIT: '运输中', DELIVERING: '派送中',
  SIGNED: '已签收', EXCEPTION: '物流异常', RETURNED: '已退回'
};
const withdrawalStatuses = { REVIEWING: '审核中', APPROVED: '已通过', SUCCESS: '已完成', REJECTED: '已驳回' };
const rechargeStatuses = { PENDING: '待确认', CONFIRMED: '已确认', CANCELED: '已取消' };
const aftersaleTypes = { NONE: '无售后', SEVEN_DAY_NO_REASON: '7 天无理由', SHOP_WARRANTY: '店铺保修', NATIONAL_WARRANTY: '全国联保' };
const displayOrderStatuses = { ...Object.fromEntries(Object.entries(enums.ORDER_STATUS_META).map(([key, meta]) => [key, meta.label])), ...orderStatuses };
const displayAftersaleTypes = { ...Object.fromEntries(Object.entries(enums.AFTERSALE_TYPE_META).map(([key, meta]) => [key, meta.label])), ...aftersaleTypes };
function label(value: unknown, labels: Record<string, string>, fallback = '状态暂不可用') {
  if (typeof value !== 'string') return fallback;
  return Object.hasOwn(labels, value) ? labels[value] : /[\u4e00-\u9fff]/.test(value) ? value : fallback;
}
function recordStatus(value: unknown) {
  if (kind.value === 'order') return label(value, displayOrderStatuses);
  const labels = kind.value === 'withdraw' ? withdrawalStatuses
    : kind.value === 'recharge' ? rechargeStatuses : orderStatuses;
  return label(value, labels);
}
function timestamp(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return '暂不可用';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂不可用' : date.toLocaleString('zh-CN', { hour12: false });
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function skus(row: Record<string, unknown>) {
  return Array.isArray(row.skus) ? row.skus.filter(object).slice(0, 100) : [];
}
function specs(value: unknown) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join(' / ') || '规格暂不可用';
  if (object(value)) return Object.entries(value).filter(([, item]) => typeof item === 'string').map(([key, item]) => `${key}：${item}`).join(' / ') || '规格暂不可用';
  return '规格暂不可用';
}
const buckets = [
  ['AVAILABLE', 'available', '可用余额'], ['NON_WITHDRAWABLE', 'non_withdrawable', '不可转出余额'],
  ['FINANCE_LOCKED', 'finance_locked', '理财锁定'], ['ORDER_FROZEN', 'order_frozen', '订单冻结'],
  ['RISK_FROZEN', 'risk_frozen', '风控冻结'], ['DEPOSIT_AVAILABLE', 'deposit_available', '保证金可用']
] as const;
function balanceFields(row: Record<string, unknown>) {
  const distribution = Array.isArray(row.distribution) ? row.distribution.filter(object) : [];
  return buckets.map(([type, field, label]) => ({ label, value: text(distribution.find(item => item.type === type)?.amount ?? row[field]) }));
}
function fields(row: Record<string, unknown>) {
  return [['运费', text(row.shipping_fee)], ['税费', text(row.tax_fee)], ['售后类型', label(row.after_sale_type, displayAftersaleTypes, '售后信息暂不可用')], ['更新时间', timestamp(row.updated_at)]];
}
function businessFields(row: Record<string, unknown>) {
  if (kind.value === 'order') return [['订单号', text(row.order_no)], ['数量', count(row.quantity)], ['成交单价', text(row.unit_price)], ['物流状态', label(row.logistics_status, logisticsStatuses)]];
  return [['资产', text(row.asset ?? row.currency)], ['网络', text(row.chain)], ['交易哈希', text(row.tx_hash)]];
}
function statusTone(row: Record<string, unknown>) {
  const status = row.status;
  if (typeof status !== 'string') return 'neutral';
  if (kind.value === 'recharge') return status === 'CONFIRMED' ? 'success' : status === 'PENDING' ? 'pending' : 'neutral';
  if (kind.value === 'withdraw') return status === 'SUCCESS' ? 'success' : status === 'REJECTED' ? 'danger' : ['REVIEWING', 'APPROVED'].includes(status) ? 'pending' : 'neutral';
  return ['COMPLETED', 'PAID', 'SHIPPED'].includes(status) ? 'success' : ['CREATED', 'AFTERSALE_CONFIRM', 'REFUND_REVIEW'].includes(status) ? 'pending' : 'neutral';
}
function recordTitle(row: Record<string, unknown>, index: number) {
  if (isProduct.value) return text(row.title);
  if (props.card.kind === 'order') return text(row.product_title);
  if (props.card.kind === 'balance') return `${text(row.currency)} 余额`;
  return `${title.value} ${index + 1}`;
}
</script>

<template>
  <section class="ai-result-card" :class="{ 'business-card': isBusiness }" :aria-label="title">
    <header class="card-heading"><span class="card-heading-title"><span class="card-symbol"><Icon :icon="cardIcon" aria-hidden="true" /></span><strong>{{ title }}</strong></span><small v-if="card.queried_at !== undefined">查询于 {{ timestamp(card.queried_at) }}</small></header>
    <p v-if="card.code === 'LOGIN_REQUIRED'" class="card-note">登录后可查询本人的订单与钱包信息。<button type="button" class="text-link" @click="$emit('login')">前往登录</button></p>
    <p v-else-if="card.code === 'NO_VISIBLE_RECORD'" class="card-note">暂无可展示的记录。</p>
    <p v-else-if="card.code !== 'OK' || !supported" class="card-note">本次查询结果暂不可展示，请调整问题后重新查询。</p>
    <template v-else>
      <p v-if="!rows.length" class="card-note">暂无可展示的记录。</p>
      <article v-for="(row, index) in rows" :key="index" class="result-record" :class="{ 'business-record': isBusiness }">
        <div class="record-heading"><h3><RouterLink v-if="isProduct && typeof row.id === 'string' && row.id.trim()" :to="{ name: 'product-detail', params: { id: row.id } }">{{ recordTitle(row, index) }} →</RouterLink><template v-else>{{ recordTitle(row, index) }}</template></h3><span v-if="isBusiness && card.kind !== 'balance'" class="status-badge" :class="statusTone(row)"><i aria-hidden="true" />{{ recordStatus(row.status) }}</span></div>
        <template v-if="card.kind === 'balance'">
          <div class="amount-overview"><span class="amount-caption">总余额</span><p class="amount-value"><strong>{{ text(row.total) }}</strong><span>{{ text(row.currency) }}</span></p></div>
          <dl class="balance-grid"><div v-for="(field, fieldIndex) in balanceFields(row)" :key="field.label" class="balance-cell" :class="{ 'balance-available': fieldIndex === 0 }"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div></dl>
        </template>
        <template v-else-if="isProduct">
          <dl><template v-for="[label, value] in fields(row)" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></template></dl>
          <template v-if="isProduct">
            <dl v-if="row.has_sku === false"><dt>价格</dt><dd>{{ text(row.price) }}</dd><dt>库存</dt><dd>{{ count(row.stock) }}</dd></dl>
            <template v-else-if="row.has_sku === true">
              <p v-if="!skus(row).length" class="card-note">规格信息暂不可用。</p>
              <div v-for="(sku, skuIndex) in skus(row)" :key="skuIndex" class="sku-result">
                <b>{{ specs(sku.specs) }}</b><dl><dt>价格</dt><dd>{{ text(sku.price) }}</dd><dt>库存</dt><dd>{{ count(sku.stock) }}</dd></dl>
              </div>
              <p v-if="row.sku_has_more === true || (Array.isArray(row.skus) && row.skus.length > 100)" class="card-note">还有更多规格，可继续提问缩小范围。</p>
            </template>
          </template>
        </template>
        <template v-else>
          <div class="amount-overview"><span class="amount-caption">{{ card.kind === 'order' ? '成交总额' : '金额' }}</span><p class="amount-value"><strong>{{ text(card.kind === 'order' ? row.total_amount : row.amount) }}</strong><span v-if="card.kind !== 'order' || typeof row.currency === 'string'">{{ card.kind === 'order' ? row.currency : text(row.asset ?? row.currency) }}</span></p></div>
          <dl class="record-details"><div v-for="[name, value] in businessFields(row)" :key="name" :class="{ 'detail-wide': name === '订单号' || name === '交易哈希' }"><dt>{{ name }}</dt><dd :class="{ 'identifier': name === '订单号' || name === '交易哈希' }">{{ value }}</dd></div></dl>
          <div class="record-updated"><Icon icon="lucide:clock-3" aria-hidden="true" /><span>更新于 {{ timestamp(row.updated_at) }}</span></div>
          <p v-if="card.kind === 'recharge'" class="card-note record-note"><Icon icon="lucide:info" aria-hidden="true" /><span>仅已确认到账的充值单代表到账，交易哈希不代表余额已增加。</span></p>
          <p v-else-if="card.kind === 'withdraw'" class="card-note record-note"><Icon icon="lucide:info" aria-hidden="true" /><span>仅状态为“已完成”时表示已到账，其他状态请查看转出记录。</span></p>
          <p v-else-if="card.kind === 'order_pay'" class="card-note record-note"><Icon icon="lucide:info" aria-hidden="true" /><span>支付结果请以原订单状态为准。</span></p>
        </template>
      </article>
      <p v-if="card.has_more === true || (card.rows?.length ?? 0) > 100" class="card-note">还有更多记录，可继续提问缩小查询范围。</p>
    </template>
  </section>
</template>

<style scoped>
.ai-result-card { min-width:0; padding:15px; border:1px solid var(--line); border-radius:8px; background:var(--paper); font-size:12px; line-height:1.7; }
.card-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 14px; padding-bottom:12px; border-bottom:1px solid var(--line); }
.card-heading-title { display:flex; align-items:center; gap:9px; font-size:14px; }
.card-symbol { display:grid; place-items:center; width:32px; height:32px; flex-shrink:0; border-radius:9px; background:var(--soft); color:var(--green); }
.card-symbol svg { width:17px; height:17px; }
.card-heading small,.card-note,dt { color:var(--muted); }
.result-record { padding:12px 0; }
.result-record + .result-record { border-top:1px solid var(--line); }
h3 { margin:0 0 8px; font-size:14px; line-height:1.6; overflow-wrap:anywhere; white-space:pre-wrap; }
dl { display:grid; grid-template-columns:minmax(76px,.35fr) minmax(0,1fr); gap:5px 12px; margin:6px 0; }
dt,dd { margin:0; }
dd { overflow-wrap:anywhere; white-space:pre-wrap; }
.card-note { margin:8px 0 0; font-size:11px; }
.text-link { margin-left:10px; }
.record-heading { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; }
.record-heading h3 { flex:1; min-width:0; }
.business-card { padding:16px; border-radius:14px; font-size:13px; }
.business-record { margin-top:14px; padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
.business-record + .business-record { border-top:1px solid var(--line); }
.business-record h3 { margin:0; font-size:14px; font-weight:600; }
.status-badge { display:inline-flex; align-items:center; gap:6px; max-width:100%; padding:3px 9px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:var(--soft); font-size:11px; line-height:1.6; overflow-wrap:anywhere; }
.status-badge i { width:5px; height:5px; border-radius:50%; background:currentColor; flex-shrink:0; }
.status-badge.success { color:var(--green); border-color:color-mix(in srgb,var(--green) 24%,var(--line)); background:color-mix(in srgb,var(--green) 7%,var(--paper)); }
.status-badge.pending { color:var(--yb-warning,var(--ink)); border-color:color-mix(in srgb,var(--yb-warning,var(--ink)) 24%,var(--line)); background:var(--yb-warning-soft,var(--soft)); }
.status-badge.danger { color:var(--yb-danger,var(--ink)); border-color:color-mix(in srgb,var(--yb-danger,var(--ink)) 24%,var(--line)); background:var(--yb-danger-soft,var(--soft)); }
.amount-overview { padding:18px 0 16px; }
.amount-caption { color:var(--muted); font-size:12px; }
.amount-value { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 8px; margin:3px 0 0; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.amount-value strong { min-width:0; max-width:100%; color:var(--ink); font-size:28px; line-height:1.3; font-weight:650; letter-spacing:-.03em; }
.amount-value > span { color:var(--muted); font-size:12px; }
.balance-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,148px),1fr)); gap:8px; margin:0; }
.balance-cell { min-width:0; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--soft); }
.balance-cell dt { font-size:12px; }
.balance-cell dd { margin-top:5px; color:var(--ink); font-size:14px; font-weight:600; font-variant-numeric:tabular-nums; }
.balance-available { background:color-mix(in srgb,var(--green) 6%,var(--paper)); border-color:color-mix(in srgb,var(--green) 28%,var(--line)); }
.balance-available dd { color:var(--green); }
.record-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 16px; padding-top:14px; margin:0; border-top:1px solid var(--line); }
.record-details > div { min-width:0; }
.record-details .detail-wide { grid-column:1/-1; }
.record-details dt { font-size:11px; }
.record-details dd { margin-top:3px; color:var(--ink); font-size:13px; font-variant-numeric:tabular-nums; }
.record-details .identifier { font-family:var(--font-mono,'JetBrains Mono',monospace); font-size:12px; }
.record-updated { display:flex; align-items:center; gap:5px; margin-top:14px; color:var(--muted); font-size:11px; }
.record-updated svg { width:12px; height:12px; flex-shrink:0; }
.record-note { display:flex; align-items:flex-start; gap:7px; padding:10px; border-radius:7px; background:var(--soft); line-height:1.65; }
.record-note svg { width:14px; height:14px; flex-shrink:0; margin-top:2px; }
.sku-result { margin-top:9px; padding:9px 12px; border-left:2px solid var(--line); }
.sku-result b { font-weight:500; white-space:pre-wrap; overflow-wrap:anywhere; }
@media(max-width:640px) {
  .ai-result-card { padding:12px; font-size:11px; }
  h3 { font-size:12px; }
  dl { grid-template-columns:78px minmax(0,1fr); gap:5px 9px; }
  .card-heading small { font-size:11px; }
  .business-card { padding:12px; font-size:12px; }
  .business-record { padding:12px; }
  .business-record h3 { font-size:13px; }
  .amount-value strong { font-size:24px; }
  .business-card .card-note { font-size:11px; }
}
</style>
