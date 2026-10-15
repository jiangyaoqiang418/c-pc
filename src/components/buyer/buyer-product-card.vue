<script setup lang="ts">
import { ref } from 'vue';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { computed } from 'vue';
import { Message } from '@/lib/feedback';
import { getAftersaleMeta } from '@/service/api/product';
import UmIcon from '@/components/common/um-icon.vue';
import { formatUsdt } from '@shared/utils/currency';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

interface Props {
  product: Api.RealProduct.DisplayRecord;
  shelving?: boolean;
  deleting?: boolean;
  busy?: boolean;
}
const props = withDefaults(defineProps<Props>(), { shelving: false, deleting: false });
const emit = defineEmits<{
  (e: 'toggle-shelf', product: Api.RealProduct.DisplayRecord): void;
  (e: 'delete', product: Api.RealProduct.DisplayRecord): void;
  (e: 'edit', product: Api.RealProduct.DisplayRecord): void;
  (e: 'price', product: Api.RealProduct.DisplayRecord): void;
}>();

const cover = computed(() => props.product.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER);
const aftersaleMeta = computed(() => getAftersaleMeta(props.product.aftersaleType));

const STATUS_META: Record<Api.Product.ProductStatus, { label: string; color: string }> = {
  PENDING_AUDIT: { label: '待审核', color: 'orange' },
  IN_AUDIT: { label: '审核中', color: 'arcoblue' },
  REJECTED: { label: '审核驳回', color: 'red' },
  NORMAL: { label: '正常', color: 'green' },
  FROZEN: { label: '已冻结', color: 'red' },
  DELETED: { label: '已删除', color: 'gray' }
};
const statusMeta = computed(() => STATUS_META[props.product.status]);

const SHELF_LABEL: Record<Api.Product.ShelfStatus, { label: string; color: string }> = {
  'on-shelf': { label: '在售', color: 'green' },
  'off-shelf': { label: '已下架', color: 'gray' }
};
const shelfMeta = computed(() => SHELF_LABEL[props.product.shelfStatus]);
const rawStatus = computed(() => 'rawStatus' in props.product ? props.product.rawStatus : undefined);
const busyReason = computed(() => props.busy || props.shelving || props.deleting ? '商品操作处理中，请稍后重试' : '');
const editDisabledReason = computed(() => {
  if (busyReason.value) return busyReason.value;
  if (rawStatus.value === 'OFF_SHELF' || rawStatus.value === 'REJECTED') return '';
  if (rawStatus.value === 'ON_SALE') return '请先下架商品再编辑';
  return '仅已下架或审核驳回的商品可编辑';
});
const priceDisabledReason = computed(() => {
  if (busyReason.value) return busyReason.value;
  if (rawStatus.value === 'ON_SALE' || rawStatus.value === 'OFF_SHELF') return '';
  if (rawStatus.value === 'REJECTED') return '审核驳回的商品请通过编辑修改价格并重新提交审核';
  return '仅在售或已下架的商品可快捷改价';
});

function toggleShelf() {
  if (props.shelving || props.deleting) return;
  if (props.product.status !== 'NORMAL') {
    Message.warning('仅正常状态商品可上下架');
    return;
  }
  emit('toggle-shelf', props.product);
}


const deleteVisible = ref(false);
</script>

<template>
  <article class="buyer-product">
    <div class="buyer-product-image"><img :src="cover" :alt="product.title" @error="setImageFallback" /><span class="buyer-status" :class="rawStatus || product.status">{{ product.status === 'NORMAL' ? shelfMeta.label : statusMeta.label }}</span></div>
    <div class="buyer-product-body"><small>{{ product.categoryPath }} · {{ aftersaleMeta.label }}</small><h3 :title="product.title">{{ product.title }}</h3><div class="buyer-product-price"><b>{{ formatUsdt(product.price).replace(/^U /, '') }} <small>USDT</small></b><span>库存 {{ product.stock }}</span></div><div class="buyer-product-stats"><span>销量 {{ product.salesCount ?? '—' }}</span><span>浏览 {{ product.viewCount ?? '—' }}</span><span>收藏 {{ product.favoriteCount ?? '—' }}</span></div><p v-if="product.status === 'REJECTED' && product.draftAuditOpinion" class="buyer-rejection">驳回原因：{{ product.draftAuditOpinion }}</p><p v-else class="buyer-inline-hint">{{ rawStatus === 'ON_SALE' ? '编辑前需先下架，快捷改价立即生效。' : ['IN_AUDIT','PENDING_AUDIT'].includes(product.status) ? '审核期间商品保持下架。' : product.status === 'FROZEN' ? '商品已冻结，详情请联系平台。' : '修改后需要重新提交平台审核。' }}</p>
      <div class="buyer-product-actions"><Tooltip><TooltipTrigger as-child><span class="action-trigger" :tabindex="editDisabledReason ? 0 : undefined" :aria-label="editDisabledReason || undefined"><button type="button" :disabled="!!editDisabledReason" @click="emit('edit', product)">编辑</button></span></TooltipTrigger><TooltipContent v-if="editDisabledReason">{{ editDisabledReason }}</TooltipContent></Tooltip><Tooltip><TooltipTrigger as-child><span class="action-trigger" :tabindex="priceDisabledReason ? 0 : undefined" :aria-label="priceDisabledReason || undefined"><button type="button" :disabled="!!priceDisabledReason" @click="emit('price', product)">改价</button></span></TooltipTrigger><TooltipContent v-if="priceDisabledReason">{{ priceDisabledReason }}</TooltipContent></Tooltip><button v-if="product.status === 'NORMAL'" type="button" class="accent" :disabled="shelving || deleting || busy" @click="toggleShelf">{{ shelving ? '处理中…' : product.shelfStatus === 'on-shelf' ? '下架' : '上架' }}</button><button type="button" class="danger-text" :disabled="deleting || shelving || busy" :aria-label="'删除 ' + product.title" @click="deleteVisible = true"><UmIcon :name="deleting ? 'clock' : 'trash'" /></button></div>
    </div>
    <a-modal content-class="buyer-dialog" v-model:visible="deleteVisible" title="确认删除商品？" :ok-loading="deleting" :closable="!deleting" :mask-closable="!deleting" :esc-to-close="!deleting" :on-before-cancel="() => !deleting" @ok="emit('delete', product)"><p class="delete-text">{{ product.status === 'IN_AUDIT' ? '审核中的商品删除后无法恢复，确认删除吗？' : '商品删除后无法恢复，确认删除吗？' }}</p><strong class="delete-product">{{ product.title }}</strong></a-modal>
  </article>
</template>

<style scoped>
.action-trigger { display:flex; }
.action-trigger:focus-visible { outline:3px solid var(--gold); outline-offset:3px; }
.action-trigger > button { width:100%; }
.delete-text { color:var(--muted); line-height:1.9; }
.delete-product { overflow-wrap:anywhere; }
</style>
