<script setup lang="ts">
import { computed } from 'vue';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
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

</script>

<template>
  <div class="bp-card">
    <div class="cover-wrap">
      <img :src="cover" :alt="product.title" class="cover" @error="setImageFallback" />
      <div v-if="product.status !== 'NORMAL'" class="status-overlay">
        {{ statusMeta.label }}
      </div>
    </div>
    <div class="body">
      <div class="title">{{ product.title }}</div>
      <div class="tags">
        <a-tag :color="statusMeta.color" size="small">{{ statusMeta.label }}</a-tag>
        <a-tag :color="shelfMeta.color" size="small">{{ shelfMeta.label }}</a-tag>
        <a-tag :color="aftersaleMeta.color" size="small">{{ aftersaleMeta.label }}</a-tag>
      </div>
      <div v-if="product.status === 'REJECTED' && product.draftAuditOpinion" class="reject-reason">
        驳回原因：{{ product.draftAuditOpinion }}
      </div>
      <div class="meta-row">
        <PriceTag :price="product.price" size="sm" />
        <span class="stock">库存 {{ product.stock }}</span>
      </div>
      <div class="stats">
        <span>销量 {{ product.salesCount || 0 }}</span>
        <span>浏览 {{ product.viewCount || 0 }}</span>
        <span>收藏 {{ product.favoriteCount || 0 }}</span>
      </div>
      <div class="actions">
        <a-tooltip :content="editDisabledReason" :disabled="!editDisabledReason">
          <span class="action-trigger"><a-button size="small" :disabled="!!editDisabledReason" @click="emit('edit', product)">编辑</a-button></span>
        </a-tooltip>
        <a-tooltip :content="priceDisabledReason" :disabled="!priceDisabledReason">
          <span class="action-trigger"><a-button size="small" :disabled="!!priceDisabledReason" @click="emit('price', product)">改价</a-button></span>
        </a-tooltip>
        <a-button
          v-if="product.status === 'NORMAL'"
          size="small"
          :type="product.shelfStatus === 'on-shelf' ? 'outline' : 'primary'"
          :loading="shelving"
          :disabled="deleting || busy"
          @click="toggleShelf"
        >
          {{ product.shelfStatus === 'on-shelf' ? '下架' : '上架' }}
        </a-button>
        <a-popconfirm
          v-if="product.status === 'IN_AUDIT'"
          content="审核中的商品删除后无法恢复，确认删除吗？"
          type="warning"
          @ok="emit('delete', product)"
        >
          <a-button size="small" status="danger" type="outline" :loading="deleting" :disabled="shelving || busy">删除</a-button>
        </a-popconfirm>
        <a-button v-else size="small" status="danger" type="outline" :loading="deleting" :disabled="shelving || busy" @click="emit('delete', product)">删除</a-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-trigger {
  display: inline-flex;
}
.action-trigger :deep(button:disabled) {
  pointer-events: none;
}
.bp-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  border: 1px solid #f2f3f5;
  overflow: hidden;
  transition: all 0.18s;
}
.bp-card:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
.cover-wrap {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #f7f8fa;
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}
.body {
  padding: 12px 16px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 2.8em;
}
.tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.reject-reason {
  margin-bottom: 8px;
  padding: 8px 10px;
  color: #cb2634;
  font-size: 12px;
  line-height: 1.5;
  background: #fff0f0;
  border-radius: 4px;
}
.stock {
  font-size: 12px;
  color: #86909c;
}
.stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #86909c;
  padding: 6px 0;
  border-top: 1px dashed #f2f3f5;
  margin-bottom: 8px;
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
