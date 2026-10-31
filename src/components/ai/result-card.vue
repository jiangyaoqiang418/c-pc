<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

const props = defineProps<{ card: Api.Ai.CardData }>();
defineEmits<{ login: [] }>();
const titles: Record<string, string> = { products: '商品查询', product: '商品查询', order: '订单查询', balance: '钱包余额', recharge: '充值记录', withdraw: '转出记录', order_pay: '订单钱包直付' };
const kind = computed(() => props.card.kind ?? '');
const isProduct = computed(() => kind.value === 'products' || kind.value === 'product');
const supported = computed(() => Object.hasOwn(titles, kind.value));
const title = computed(() => supported.value ? titles[kind.value] : '查询结果');
const rows = computed(() => (props.card.rows ?? []).slice(0, 100));
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
  if (isProduct.value) return [['运费', text(row.shipping_fee)], ['税费', text(row.tax_fee)], ['售后类型', label(row.after_sale_type, displayAftersaleTypes, '售后信息暂不可用')], ['更新时间', timestamp(row.updated_at)]];
  if (props.card.kind === 'order') return [['订单号', text(row.order_no)], ['数量', count(row.quantity)], ['成交单价', text(row.unit_price)], ['成交总额', text(row.total_amount)], ['订单状态', label(row.status, displayOrderStatuses)], ['物流状态', label(row.logistics_status, logisticsStatuses)], ['更新时间', timestamp(row.updated_at)]];
  return [['资产', text(row.asset ?? row.currency)], ['网络', text(row.chain)], ['金额', text(row.amount)], ['状态', recordStatus(row.status)], ['交易哈希', text(row.tx_hash)], ['更新时间', timestamp(row.updated_at)]];
}
function recordTitle(row: Record<string, unknown>, index: number) {
  if (isProduct.value) return text(row.title);
  if (props.card.kind === 'order') return text(row.product_title);
  if (props.card.kind === 'balance') return `${text(row.currency)} 余额`;
  return `${title.value} ${index + 1}`;
}
</script>

<template>
  <section class="ai-result-card" :aria-label="title">
    <header><strong>{{ title }}</strong><small v-if="card.queried_at !== undefined">查询于 {{ timestamp(card.queried_at) }}</small></header>
    <p v-if="card.code === 'LOGIN_REQUIRED'" class="card-note">登录后可查询本人的订单与钱包信息。<button type="button" class="text-link" @click="$emit('login')">前往登录</button></p>
    <p v-else-if="card.code === 'NO_VISIBLE_RECORD'" class="card-note">暂无可展示的记录。</p>
    <p v-else-if="card.code !== 'OK' || !supported" class="card-note">本次查询结果暂不可展示，请调整问题后重新查询。</p>
    <template v-else>
      <p v-if="!rows.length" class="card-note">暂无可展示的记录。</p>
      <article v-for="(row, index) in rows" :key="index" class="result-record">
        <h3><RouterLink v-if="isProduct && typeof row.id === 'string' && row.id.trim()" :to="{ name: 'product-detail', params: { id: row.id } }">{{ recordTitle(row, index) }} →</RouterLink><template v-else>{{ recordTitle(row, index) }}</template></h3>
        <template v-if="card.kind === 'balance'">
          <p class="balance-total">总余额 <strong>{{ text(row.total) }}</strong> {{ text(row.currency) }}</p>
          <dl><template v-for="field in balanceFields(row)" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
        </template>
        <template v-else>
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
          <p v-if="card.kind === 'recharge'" class="card-note">仅已确认到账的充值单代表到账，交易哈希不代表余额已增加。</p>
          <p v-else-if="card.kind === 'withdraw'" class="card-note">仅状态为“已完成”时表示已到账，其他状态请查看转出记录。</p>
          <p v-else-if="card.kind === 'order_pay'" class="card-note">支付结果请以原订单状态为准。</p>
        </template>
      </article>
      <p v-if="card.has_more === true || (card.rows?.length ?? 0) > 100" class="card-note">还有更多记录，可继续提问缩小查询范围。</p>
    </template>
  </section>
</template>

<style scoped>
.ai-result-card { min-width:0; padding:15px; border:1px solid var(--line); border-radius:8px; background:var(--paper); font-size:12px; line-height:1.7; }
header { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px 14px; padding-bottom:9px; border-bottom:1px solid var(--line); }
header small,.card-note,dt { color:var(--muted); }
.result-record { padding:12px 0; }
.result-record + .result-record { border-top:1px solid var(--line); }
h3 { margin:0 0 8px; font-size:14px; line-height:1.6; overflow-wrap:anywhere; white-space:pre-wrap; }
dl { display:grid; grid-template-columns:minmax(76px,.35fr) minmax(0,1fr); gap:5px 12px; margin:6px 0; }
dt,dd { margin:0; }
dd { overflow-wrap:anywhere; white-space:pre-wrap; }
.card-note { margin:8px 0 0; font-size:11px; }
.text-link { margin-left:10px; }
.balance-total { margin:8px 0; }
.balance-total strong { font-size:18px; color:var(--green); overflow-wrap:anywhere; }
.sku-result { margin-top:9px; padding:9px 12px; border-left:2px solid var(--line); }
.sku-result b { font-weight:500; white-space:pre-wrap; overflow-wrap:anywhere; }
@media(max-width:640px) {
  .ai-result-card { padding:12px; font-size:11px; }
  h3 { font-size:12px; }
  dl { grid-template-columns:78px minmax(0,1fr); gap:5px 9px; }
  header small,.card-note { font-size:10px; }
}
</style>
