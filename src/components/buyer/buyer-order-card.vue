<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import { enums } from '@shared';
import { formatCny, formatUsdt } from '@shared/utils/currency';
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
  <article class="buyer-order paper">
    <header><span>{{ order.code }}<small>{{ formatDateValue(order.createdAt) }}</small></span><span class="buyer-status" :class="order.status">{{ enums.ORDER_STATUS_META[order.status]?.label || '状态待核对' }}</span></header>
    <div class="buyer-order-body"><button type="button" class="buyer-order-product" :aria-label="'打开订单 ' + order.code + ' 的详情'" @click="goDetail"><img :src="cover" :alt="order.productTitle" @error="setImageFallback" /><span><b>{{ order.productTitle }}</b><small>{{ order.customerName }} · {{ order.receiverName }} {{ order.receiverPhone }}</small><small>{{ order.shippingAddress }}</small></span></button><div><small>订单收入</small><strong>{{ formatUsdt(order.totalAmount).replace(/^U /, '') }} <em>USDT</em></strong><small>≈ {{ formatCny(order.totalAmount) }}</small></div></div>
    <footer><small>{{ order.status === 'PROCURING' ? '采购凭证可在发货时一并上传' : order.status === 'COMPLETED' ? '订单已完成' : order.status === 'IN_TRANSIT' ? '等待顾客签收' : '订单状态以平台返回为准' }}</small><div><button type="button" class="outline" @click="goDetail">详情</button><button type="button" class="outline" @click="goIm">三方群</button><button v-if="order.status === 'PENDING_PAYMENT'" type="button" class="primary" @click="$emit('change-price', order)">修改价格</button><button v-else-if="['PROCURING','PROCURED'].includes(order.status)" type="button" class="primary" @click="$emit('upload-shipping', order)">填写发货</button><button v-else-if="['IN_TRANSIT','AFTERSALE_CONFIRM'].includes(order.status)" type="button" class="primary" @click="$emit('manage-logistics', order)">物流管理</button></div></footer>
  </article>
</template>

<style scoped>
.buyer-order-product { min-width:0; text-align:left; }
.buyer-order-product > span { min-width:0; }
.buyer-order-product b,.buyer-order-product small,header > span:first-child { overflow-wrap:anywhere; }
</style>
