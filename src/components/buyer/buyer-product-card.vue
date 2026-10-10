<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { computed } from 'vue';
import { Message } from '@/lib/feedback';
import { getAftersaleMeta } from '@/service/api/product';
import PriceTag from '@/components/product/price-tag.vue';
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
  <article class="bp-card">
    <div class="cover-wrap"><img :src="cover" :alt="product.title" class="cover" @error="setImageFallback" /><span class="cover-status" :class="product.status">{{ statusMeta.label }}</span></div>
    <div class="body"><h3 class="title" :title="product.title">{{ product.title }}</h3><div class="tags"><span class="shelf-tag" :class="product.shelfStatus">{{ shelfMeta.label }}</span><span>{{ aftersaleMeta.label }}</span></div><p v-if="product.status === 'REJECTED' && product.draftAuditOpinion" class="reject-reason">驳回原因：{{ product.draftAuditOpinion }}</p><div class="meta-row"><PriceTag :price="product.price" size="sm" /><span class="stock">库存 {{ product.stock }}</span></div><div class="stats"><span>销量 {{ product.salesCount ?? '—' }}</span><span>浏览 {{ product.viewCount ?? '—' }}</span><span>收藏 {{ product.favoriteCount ?? '—' }}</span></div>
      <div class="actions"><Tooltip><TooltipTrigger as-child><span class="action-trigger" :tabindex="editDisabledReason ? 0 : undefined" :aria-label="editDisabledReason || undefined"><Button type="button" variant="outline" size="sm" :disabled="!!editDisabledReason" @click="emit('edit', product)">编辑</Button></span></TooltipTrigger><TooltipContent v-if="editDisabledReason">{{ editDisabledReason }}</TooltipContent></Tooltip><Tooltip><TooltipTrigger as-child><span class="action-trigger" :tabindex="priceDisabledReason ? 0 : undefined" :aria-label="priceDisabledReason || undefined"><Button type="button" variant="outline" size="sm" :disabled="!!priceDisabledReason" @click="emit('price', product)">改价</Button></span></TooltipTrigger><TooltipContent v-if="priceDisabledReason">{{ priceDisabledReason }}</TooltipContent></Tooltip>
        <Button v-if="product.status === 'NORMAL'" type="button" :variant="product.shelfStatus === 'on-shelf' ? 'outline' : 'default'" size="sm" :disabled="shelving || deleting || busy" @click="toggleShelf">{{ shelving ? '处理中…' : product.shelfStatus === 'on-shelf' ? '下架' : '上架' }}</Button><Button type="button" variant="ghost" size="sm" class="delete-button" :disabled="deleting || shelving || busy" @click="deleteVisible = true">{{ deleting ? '删除中…' : '删除' }}</Button>
      </div>
    </div>
    <a-modal v-model:visible="deleteVisible" title="确认删除商品？" :ok-loading="deleting" :closable="!deleting" :mask-closable="!deleting" :esc-to-close="!deleting" :on-before-cancel="() => !deleting" @ok="emit('delete', product)"><p class="delete-text">{{ product.status === 'IN_AUDIT' ? '审核中的商品删除后无法恢复，确认删除吗？' : '商品删除后无法恢复，确认删除吗？' }}</p><strong class="delete-product">{{ product.title }}</strong></a-modal>
  </article>
</template>

<style scoped>
.bp-card { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:12px; overflow:hidden; min-width:0; transition:box-shadow 200ms var(--um-ease),transform 200ms var(--um-ease); }.bp-card:hover { transform:translateY(-2px); box-shadow:var(--yb-shadow-2); }.cover-wrap { position:relative; aspect-ratio:4/3; background:var(--yb-fill); overflow:hidden; }.cover { width:100%; height:100%; object-fit:cover; transition:transform 250ms var(--um-ease); }.bp-card:hover .cover { transform:scale(1.03); }.cover-status { position:absolute; top:14px; left:14px; padding:5px 10px; border-radius:5px; font-size:12px; background:var(--yb-primary); color:white; }.cover-status.REJECTED,.cover-status.FROZEN { background:var(--yb-danger); }.cover-status.IN_AUDIT,.cover-status.PENDING_AUDIT { background:var(--yb-gold); }.body { padding:22px; }.title { font-size:17px; font-weight:600; margin:0 0 15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.tags { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }.tags>span { font-size:12px; padding:3px 7px; border-radius:4px; color:var(--yb-muted); background:var(--yb-fill); }.tags>.on-shelf { color:var(--yb-success); background:var(--yb-success-soft); }.meta-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }.stock { font-size:12px; color:var(--yb-muted); flex-shrink:0; }.stats { display:flex; gap:16px; border-top:1px solid var(--yb-hairline); padding-top:16px; margin:18px 0; color:var(--yb-muted); font-size:12px; }.reject-reason { font-size:12px; line-height:1.8; color:var(--yb-danger); background:var(--yb-danger-soft); border-radius:6px; padding:12px; }.actions { display:flex; align-items:center; flex-wrap:wrap; gap:9px; }.action-trigger { display:inline-flex; border-radius:6px; }.action-trigger :deep(button:disabled) { pointer-events:none; }.delete-button { color:var(--yb-danger); }.delete-text { color:var(--yb-muted); font-size:14px; line-height:1.9; }.delete-product { font-size:15px; overflow-wrap:anywhere; }@media(prefers-reduced-motion:reduce) { .bp-card,.cover { transition:none; }.bp-card:hover { transform:none; }.bp-card:hover .cover { transform:none; } }
</style>
