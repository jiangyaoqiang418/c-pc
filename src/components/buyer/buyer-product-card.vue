<script setup lang="ts">
import { computed } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import { enums, formatAmount } from '@shared';
import PriceTag from '@/components/product/price-tag.vue';

interface Props {
  product: Api.Product.ProductRecord;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'toggle-shelf', product: Api.Product.ProductRecord): void;
  (e: 'delete', product: Api.Product.ProductRecord): void;
}>();

const cover = computed(() => props.product.images?.[0]?.url || `https://picsum.photos/seed/${props.product.id}/300/300`);
const aftersaleMeta = computed(() => enums.AFTERSALE_TYPE_META[props.product.aftersaleType]);

const STATUS_META: Record<Api.Product.ProductStatus, { label: string; color: string }> = {
  PENDING_AUDIT: { label: '待审核', color: 'orange' },
  IN_AUDIT: { label: '审核中', color: 'arcoblue' },
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

function toggleShelf() {
  if (props.product.status !== 'NORMAL') {
    Message.warning('仅正常状态商品可上下架');
    return;
  }
  emit('toggle-shelf', props.product);
}

function onDelete() {
  Modal.confirm({
    title: '删除商品？',
    content: `「${props.product.title}」将从商品池删除，已售出订单不受影响`,
    okText: '确认删除',
    okButtonProps: { status: 'danger' },
    onOk: () => emit('delete', props.product)
  });
}
</script>

<template>
  <div class="bp-card">
    <div class="cover-wrap">
      <img :src="cover" :alt="product.title" class="cover" />
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
        <a-button
          v-if="product.status === 'NORMAL'"
          size="small"
          :type="product.shelfStatus === 'on-shelf' ? 'outline' : 'primary'"
          @click="toggleShelf"
        >
          {{ product.shelfStatus === 'on-shelf' ? '下架' : '上架' }}
        </a-button>
        <a-button size="small" disabled>编辑 · Phase 4 增量</a-button>
        <a-button size="small" status="danger" type="outline" @click="onDelete">删除</a-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
