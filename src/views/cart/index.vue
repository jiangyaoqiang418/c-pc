<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { enums } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import EmptyState from '@/components/common/empty-state.vue';
import PriceTag from '@/components/product/price-tag.vue';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import { useCartStore } from '@/stores';

const router = useRouter();
const cart = useCartStore();

const items = computed(() => cart.enrichedItems);

function setAll(checked: boolean) {
  cart.setAllSelected(checked);
}

function remove(productId: string | number) {
  Modal.confirm({
    title: '从购物车移除？',
    content: '该商品将从购物车删除',
    async onOk() {
      cart.remove(productId);
      Message.success('已移除');
    }
  });
}

function clearInvalid() {
  items.value.filter(i => !i.available).forEach(i => cart.remove(i.productId));
  Message.success('已清理失效商品');
}

function goCheckout() {
  if (cart.selectedQty === 0) {
    Message.warning('请先勾选至少一件可购商品');
    return;
  }
  router.push('/checkout');
}

onMounted(() => {
  cart.refresh();
});
</script>

<template>
  <div class="cart-page shop-container">
    <h1 class="page-title">购物车</h1>

    <template v-if="items.length">
      <a-card class="cart-card" :body-style="{ padding: 0 }">
        <div class="head-row">
          <div class="col-check">
            <a-checkbox :model-value="cart.allSelected" @change="(v) => setAll(!!v)">全选</a-checkbox>
          </div>
          <div class="col-product">商品</div>
          <div class="col-price">单价</div>
          <div class="col-qty">数量</div>
          <div class="col-sub">小计</div>
          <div class="col-op">操作</div>
        </div>
        <div
          v-for="item in items"
          :key="item.productId"
          class="data-row"
          :class="{ invalid: !item.available }"
        >
          <div class="col-check">
            <a-checkbox
              :model-value="item.selected"
              :disabled="!item.available"
              @change="(v) => cart.setSelected(item.productId, !!v)"
            />
          </div>
          <div class="col-product">
            <img v-if="item.product" :src="item.product.images?.[0]?.url || `https://picsum.photos/seed/${item.productId}/80/80`" class="cover" />
            <div class="product-info">
              <div class="product-title">{{ item.product?.title || '商品已删除' }}</div>
              <div class="product-tags">
                <a-tag v-if="item.product" :color="enums.AFTERSALE_TYPE_META[item.product.aftersaleType].color" size="small">
                  {{ enums.AFTERSALE_TYPE_META[item.product.aftersaleType].label }}
                </a-tag>
                <a-tag v-if="item.product?.overseasCustoms" color="orange" size="small">海外直邮</a-tag>
                <span class="seller">{{ item.product?.sellerName || '—' }}</span>
                <a-tag v-if="!item.available" color="red" size="small">已失效</a-tag>
              </div>
            </div>
          </div>
          <div class="col-price">
            <PriceTag :price="item.product?.price || '0'" size="sm" />
          </div>
          <div class="col-qty">
            <a-input-number
              :model-value="item.qty"
              :min="1"
              :max="item.product?.stock || 1"
              size="small"
              class="qty-input"
              :disabled="!item.available"
              @change="(v) => cart.update(item.productId, Number(v) || 1)"
            />
          </div>
          <div class="col-sub">
            <span class="sub-price">{{ formatUsdt(item.subtotal) }}</span>
            <span class="sub-usdt">≈ {{ formatCny(item.subtotal) }}</span>
          </div>
          <div class="col-op">
            <a-button type="text" status="danger" size="small" @click="remove(item.productId)">删除</a-button>
          </div>
        </div>
      </a-card>

      <div class="summary-card">
        <div class="summary-left">
          <a-button type="text" size="small" @click="clearInvalid">清理失效商品</a-button>
          <span class="muted small">已选 {{ cart.selectedQty }} 件 / 共 {{ cart.totalQty }} 件</span>
        </div>
        <div class="summary-right">
          <div class="summary-row">
            <span class="lbl">商品合计</span>
            <span class="summary-val">
              <span class="v-cny">{{ formatUsdt(cart.subTotal) }}</span>
              <span class="v-usdt">≈ {{ formatCny(cart.subTotal) }}</span>
            </span>
          </div>
          <div class="summary-row">
            <span class="lbl">运费</span>
            <span class="summary-val">
              <span class="v-cny">{{ formatUsdt(cart.shippingFeeTotal) }}</span>
            </span>
          </div>
          <div class="summary-row">
            <span class="lbl">税费<InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="12" /></span>
            <span class="summary-val">
              <span class="v-cny">{{ formatUsdt(cart.taxTotal) }}</span>
            </span>
          </div>
          <div class="summary-row total">
            <span class="lbl">应付总额</span>
            <span class="total-amount-block">
              <span class="total-cny">{{ formatUsdt(cart.grandTotal) }}</span>
              <span class="total-usdt">≈ {{ formatCny(cart.grandTotal) }} · {{ priceSet(cart.grandTotal).rateLabel }}</span>
            </span>
          </div>
          <a-button type="primary" size="large" :disabled="cart.selectedQty === 0" @click="goCheckout">
            去结算 ({{ cart.selectedQty }})
          </a-button>
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      title="购物车空空如也"
      description="去首页发现喜欢的商品吧"
      action-text="去逛逛"
      @action="router.push('/')"
    />
  </div>
</template>

<style scoped>
.cart-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1d2129;
}
.cart-card {
  margin-bottom: 16px;
}
.head-row,
.data-row {
  display: grid;
  grid-template-columns: 60px 1fr 120px 140px 140px 80px;
  align-items: center;
  padding: 12px 16px;
}
.head-row {
  background: #f7f8fa;
  font-size: 13px;
  color: #4e5969;
  font-weight: 500;
  border-bottom: 1px solid #f2f3f5;
}
.data-row {
  border-bottom: 1px solid #f7f8fa;
}
.data-row.invalid {
  opacity: 0.55;
}
.col-product {
  display: flex;
  gap: 12px;
  align-items: center;
}
.cover {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  object-fit: cover;
  background: #f7f8fa;
}
.product-info {
  flex: 1;
  min-width: 0;
}
.product-title {
  font-size: 13px;
  font-weight: 500;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.product-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.seller {
  font-size: 11px;
  color: #86909c;
}
.qty-input {
  width: 100px;
}
.sub-price {
  display: block;
  color: var(--yb-ink);
  font-weight: 700;
  font-size: 15px;
  font-family: var(--yb-font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.sub-usdt {
  display: block;
  font-size: 11px;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  margin-top: 2px;
}
.summary-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 16px 24px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 32px;
  align-items: center;
}
.summary-left {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}
.summary-right {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(250px, 1.35fr) auto;
  align-items: center;
  gap: 16px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--yb-ink-2);
  text-align: right;
  min-width: 0;
  padding: 4px 0;
}
.summary-val {
  min-width: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
}
.v-cny {
  color: var(--yb-ink);
  font-family: var(--yb-font-mono);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.v-usdt {
  font-size: 11px;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  margin-top: 1px;
}
.summary-row.total {
  padding-top: 10px;
  border-top: 1px solid var(--yb-hairline);
  margin-top: 6px;
}
.total-amount-block {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
}
.total-cny {
  font-family: var(--yb-font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.total-usdt {
  font-size: 11px;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  margin-top: 2px;
  white-space: nowrap;
}
.lbl {
  color: #86909c;
  margin-right: 8px;
  white-space: nowrap;
}
.muted {
  color: #86909c;
}
.small {
  font-size: 12px;
}

@media (max-width: 1180px) {
  .summary-card {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .summary-right {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-right > .arco-btn {
    grid-column: 1 / -1;
    justify-self: end;
  }
}
</style>
