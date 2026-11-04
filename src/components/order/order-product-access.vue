<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import { fetchProductDetail } from '@/service/api/product';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { enums, formatAmount } from '@shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const props = defineProps<{ order: Api.RealOrder.Record; compact?: boolean }>();
const router = useRouter();
const user = useUserStore();
const open = ref(false);
const checking = ref(false);
const unavailable = ref('');
let version = 0;
watch(() => [props.order.id, user.sessionVersion], () => { version++; open.value = false; checking.value = false; unavailable.value = ''; });
onBeforeUnmount(() => { version++; });
async function viewProduct() {
  if (!props.order.productId) { open.value = true; return; }
  if (checking.value) return;
  const current = ++version;
  const productId = String(props.order.productId);
  checking.value = true;
  try {
    await fetchProductDetail(productId, { showError:false });
    if (current === version) await router.push({ name:'product-detail', params:{ id:productId } });
  } catch {
    if (current === version) { unavailable.value = '商品当前无法打开，您仍可查看本订单保存的成交信息。'; open.value = true; }
  } finally { if (current === version) checking.value = false; }
}
</script>

<template>
  <div class="order-product-access" :class="{ compact }">
    <button v-if="!compact" type="button" class="product-cover" :disabled="checking" :aria-label="order.productId ? '查看商品' : '查看成交信息'" @click="viewProduct"><img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle" @error="setImageFallback" /></button>
    <div class="product-copy"><button v-if="!compact" type="button" class="product-title" :disabled="checking" @click="viewProduct">{{ order.productTitle }}</button><p v-if="!compact"><template v-if="order.aftersaleType && enums.AFTERSALE_TYPE_META[order.aftersaleType]">{{ enums.AFTERSALE_TYPE_META[order.aftersaleType].label }} · </template>数量 {{ order.quantity ?? '待核对' }} · {{ formatAmount(order.price) }} USDT<template v-if="order.overseasCustoms"> · 海外直邮</template></p><div class="access-actions"><button v-if="order.productId" type="button" class="text-link" :disabled="checking" @click="viewProduct">{{ checking ? '正在打开…' : '查看商品' }}</button><button type="button" class="text-link" @click="open = true">查看成交信息</button><RouterLink v-if="order.demandId && [String(order.customerId), String(order.shopperId)].includes(String(user.currentUser?.id))" class="text-link" :to="{ name:'purchase-detail', params:{ id:String(order.demandId) } }">查看原求购</RouterLink></div></div>
  </div>
  <Dialog v-model:open="open"><DialogContent class="max-w-xl"><DialogHeader><DialogTitle>成交信息</DialogTitle><DialogDescription>以下为订单保存的信息，成交金额以本订单为准。</DialogDescription></DialogHeader><p v-if="unavailable" role="status">{{ unavailable }}</p><div class="snapshot"><img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle" @error="setImageFallback" /><h3>{{ order.productTitle }}</h3><p>{{ order.orderType === 'DEMAND_FULFILL' ? '求购成交' : '商城商品订单' }} · 数量 {{ order.quantity ?? '待核对' }}</p><p v-for="spec in order.skuSpecs" :key="spec.name">{{ spec.name }}：{{ spec.value }}</p><p>成交单价：{{ formatAmount(order.price) }} USDT</p><p>订单总额：{{ formatAmount(order.totalAmount) }} USDT</p><p v-if="!order.productId" class="muted">该订单没有关联商城商品，评价展示在订单及买手评价中。</p></div></DialogContent></Dialog>
</template>

<style scoped>
.order-product-access{display:flex;gap:16px;align-items:center}.product-cover{width:80px;flex-shrink:0}.product-cover img{width:80px;height:80px;object-fit:contain;border-radius:8px}.product-copy{min-width:0}.product-title{text-align:left;font-weight:600;overflow-wrap:anywhere}.product-copy p{color:var(--muted);font-size:13px;margin:6px 0}.access-actions{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}.snapshot{display:grid;gap:10px;max-height:65vh;overflow:auto}.snapshot img{height:180px;width:100%;object-fit:contain}.snapshot h3{font-weight:600}.muted{color:var(--muted);font-size:13px}.compact{flex-shrink:0}button:focus-visible{outline:2px solid var(--green);outline-offset:3px}
</style>
