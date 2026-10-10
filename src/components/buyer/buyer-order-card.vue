<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { formatDateValue } from '@/utils/date-range';

interface Props {
  order: Api.RealOrder.DisplayRecord;
}
const props = defineProps<Props>();
defineEmits<{
  (e: 'change-price', order: Api.RealOrder.DisplayRecord): void;
  (e: 'upload-shipping', order: Api.RealOrder.DisplayRecord): void;
  (e: 'manage-logistics', order: Api.RealOrder.DisplayRecord): void;
}>();

const router = useRouter();
const cover = computed(() => props.order.productCover || PRODUCT_IMAGE_PLACEHOLDER);

function goDetail() {
  router.push({ name: 'order-detail', params: { id: String(props.order.id) } });
}
function goIm() {
  router.push({ name: 'im-order-group', params: { orderCode: String(props.order.id) } });
}


</script>

<template>
  <article class="buyer-order-card">
    <header class="head"><span class="code">订单号 {{ order.code }}</span><time>{{ formatDateValue(order.createdAt) }}</time><OrderStatusTag :status="order.status" /></header>
    <div class="body"><button type="button" class="cover-wrap" :aria-label="`打开订单 ${order.code} 的订单详情`" @click="goDetail"><img :src="cover" :alt="order.productTitle" class="cover" @error="setImageFallback" /></button><div class="info"><button type="button" class="title" :title="order.productTitle" @click="goDetail">{{ order.productTitle }}</button><div class="meta-row"><span><Icon icon="lucide:user" width="13" />{{ order.customerName }}</span><span><Icon icon="lucide:map-pin" width="13" />{{ order.receiverName }} · {{ order.receiverPhone }}</span></div><p class="address"><Icon icon="lucide:navigation" width="13" />{{ order.shippingAddress }}</p></div><div class="amount"><span>订单金额</span><strong>{{ formatUsdt(order.totalAmount) }}</strong><small>≈ {{ formatCny(order.totalAmount) }}</small></div></div>
    <footer class="actions"><Button variant="outline" size="sm" @click="goDetail">订单详情</Button><Button variant="outline" size="sm" @click="goIm"><Icon icon="lucide:message-square" width="14" />三方群</Button><Button v-if="order.status === 'PENDING_PAYMENT'" size="sm" @click="$emit('change-price', order)">修改价格</Button><template v-else-if="order.status === 'PROCURING'"><span class="status-note">采购凭证可在填写发货时一并上传</span><Button size="sm" @click="$emit('upload-shipping', order)">填写发货</Button></template><Button v-else-if="order.status === 'PROCURED'" size="sm" @click="$emit('upload-shipping', order)">上传发货</Button><template v-else-if="['IN_TRANSIT', 'AFTERSALE_CONFIRM'].includes(order.status)"><Button variant="outline" size="sm" @click="$emit('manage-logistics', order)">物流管理</Button><span class="status-note"><Icon icon="lucide:truck" width="14" />等待顾客签收</span></template><span v-else-if="order.status === 'COMPLETED'" class="status-note success"><Icon icon="lucide:check-circle-2" width="14" />订单已完成</span></footer>
  </article>
</template>

<style scoped>
.buyer-order-card { padding:24px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:10px; margin-bottom:20px; }.buyer-order-card:last-child { margin-bottom:0; }.head { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-bottom:22px; padding-bottom:16px; border-bottom:1px solid var(--yb-hairline); }.code { font-size:13px; font-weight:500; overflow-wrap:anywhere; }time { font-size:12px; color:var(--yb-muted); margin-right:auto; }.body { display:grid; grid-template-columns:82px minmax(0,1fr) auto; align-items:center; gap:18px; }.cover-wrap { display:block; border:0; padding:0; border-radius:6px; overflow:hidden; background:var(--yb-fill); cursor:pointer; }.cover { width:82px; height:82px; object-fit:cover; display:block; }.cover-wrap:focus-visible,.title:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.info { min-width:0; }.title { display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0; border:0; text-align:left; background:transparent; color:var(--yb-ink); font-size:16px; font-weight:600; cursor:pointer; }.title:hover { color:var(--yb-brand-primary); }.meta-row { display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:12px; }.meta-row>span { display:flex; align-items:center; gap:5px; font-size:12px; color:var(--yb-muted); }.address { display:flex; align-items:start; gap:5px; color:var(--yb-muted); font-size:12px; line-height:1.7; margin:8px 0 0; }.address svg { flex-shrink:0; margin-top:3px; }.amount { text-align:right; white-space:nowrap; }.amount>span { color:var(--yb-muted); font-size:12px; }.amount strong { display:block; margin:7px 0; font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }.amount small { color:var(--yb-muted); font-size:12px; }.actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:12px; margin-top:22px; }.status-note { display:flex; align-items:center; gap:5px; font-size:12px; color:var(--yb-muted); }.success { color:var(--yb-success); }@media(max-width:1100px) { .body { grid-template-columns:70px minmax(0,1fr); }.cover { width:70px; height:70px; }.amount { grid-column:2; text-align:left; display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }.actions { justify-content:flex-start; } }
</style>
