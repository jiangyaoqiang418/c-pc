<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { Icon } from '@iconify/vue';
import { enums } from '@shared';
import { avatarUrl } from '@shared/utils/image';
import { formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import ProductImageGallery from '@/components/product/product-image-gallery.vue';
import ProductCard from '@/components/product/product-card.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import ReviewStars from '@/components/common/review-stars.vue';
import EmptyState from '@/components/common/empty-state.vue';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import * as productApi from '@/service/api/product';
import { useCartStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const cart = useCartStore();

const product = ref<Api.Product.ProductRecord>();
const reviews = ref<Api.Review.ReviewRecord[]>([]);
const sellerScore = ref<Api.Review.UserScoreSummary>();
const sameShop = ref<Api.Product.ProductRecord[]>([]);
const qty = ref(1);
const loading = ref(false);
const favoriting = ref(false);
const activeTab = ref<'desc' | 'spec' | 'review' | 'sameshop'>('desc');

const id = computed(() => String(route.params.id || ''));
const aftersaleMeta = computed(() => product.value ? enums.AFTERSALE_TYPE_META[product.value.aftersaleType] : undefined);
const canBuy = computed(() => product.value && product.value.status === 'NORMAL' && product.value.shelfStatus === 'on-shelf' && product.value.stock > 0);
const sellerAvatar = computed(() => product.value ? avatarUrl(product.value.sellerId) : '');

async function load() {
  if (!id.value) return;
  loading.value = true;
  try {
    product.value = await productApi.fetchProductDetail(id.value);
    if (product.value) {
      productApi.trackProductBrowse(id.value).catch(() => undefined);
      productApi.trackProductView(id.value).catch(() => undefined);
      reviews.value = [];
      sellerScore.value = undefined;
      sameShop.value = [];
    }
  } catch {
    product.value = undefined;
    reviews.value = [];
    sellerScore.value = undefined;
    sameShop.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);

function addToCart() {
  if (!product.value) return;
  cart.add(product.value.id, qty.value, product.value);
  Message.success('已加入购物车');
}
function buyNow() {
  if (!product.value) return;
  cart.add(product.value.id, qty.value, product.value);
  cart.setAllSelected(false);
  cart.setSelected(product.value.id, true);
  router.push('/checkout');
}
function startPurchase() {
  if (!product.value) return;
  router.push({
    name: 'purchase-create',
    query: { productHint: product.value.title, categoryId: String(product.value.categoryId) }
  });
}

async function favorite() {
  if (!product.value) return;
  favoriting.value = true;
  try {
    await productApi.toggleProductFavorite(product.value.id, { showError: false });
    product.value.favoriteCount = Number(product.value.favoriteCount || 0) + 1;
    Message.success('收藏状态已更新');
  } catch {
    Message.error('收藏失败，服务器暂未完成写入，请稍后重试');
  } finally {
    favoriting.value = false;
  }
}
</script>

<template>
  <div class="detail-page shop-container">
    <template v-if="product">
      <!-- Breadcrumb -->
      <nav class="bread">
        <span @click="router.push('/')">首页</span>
        <Icon icon="lucide:chevron-right" width="12" />
        <span @click="router.push({ name: 'product-list', query: { categoryId: String(product.categoryId) } })">
          {{ product.categoryPath }}
        </span>
        <Icon icon="lucide:chevron-right" width="12" />
        <span class="current">{{ product.title }}</span>
      </nav>

      <!-- Hero: 图库 + 商品信息 -->
      <div class="hero-grid">
        <div class="gallery-wrap" v-motion :initial="{ opacity: 0, x: -20 }" :enter="{ opacity: 1, x: 0, transition: { duration: 500 } }">
          <ProductImageGallery :images="product.images" :fallback-seed="product.id" />
        </div>
        <div class="meta" v-motion :initial="{ opacity: 0, x: 20 }" :enter="{ opacity: 1, x: 0, transition: { duration: 500, delay: 100 } }">
          <div class="brand-label">
            <Icon icon="lucide:folder" width="12" />
            {{ product.categoryPath }}
          </div>
          <h1 class="title">{{ product.title }}</h1>
          <div class="summary">{{ product.summary }}</div>

          <div v-if="sellerScore" class="seller-summary">
            <ReviewStars :score="Number(sellerScore.avgScore)" size="sm" show-score />
            <span class="rev-count">· {{ sellerScore.receivedTotal }} 条评价</span>
            <span class="rev-count">· 好评率 <span class="yb-mono">{{ sellerScore.goodRate }}</span></span>
          </div>

          <!-- 价格块 (USDT 主 / CNY 副 / 汇率 / 税费 ⓘ) -->
          <div class="price-block">
            <div class="price-main">
              <span class="usdt-value">{{ priceSet(product.price).usdt }}</span>
              <span class="tag-live">
                <Icon icon="lucide:zap" width="11" /> USDT
              </span>
            </div>
            <div class="price-sub">
              <span class="approx">≈</span>
              <span class="cny-value yb-mono">{{ priceSet(product.price).cny }}</span>
            </div>
            <div class="price-rate">
              {{ priceSet(product.price).rateLabel }}
            </div>
            <div class="price-detail">
              <div class="pd-item">
                <span class="lbl">运费</span>
                <span class="v yb-mono">{{ formatUsdt(product.shippingFee) }}</span>
              </div>
              <div class="sep"></div>
              <div class="pd-item">
                <span class="lbl">税费</span>
                <span class="v yb-mono">{{ formatUsdt(product.tax) }}</span>
                <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="12" />
              </div>
              <div class="sep"></div>
              <div class="pd-item">
                <span class="lbl">库存</span>
                <span class="v yb-mono">{{ product.stock }} 件</span>
              </div>
            </div>
          </div>

          <div v-if="product.overseasCustoms" class="overseas-warn">
            <Icon icon="lucide:globe" width="16" />
            <div>
              <div class="warn-title">海外直邮商品</div>
              <div class="warn-sub">过关后不可退货退款，请认真挑选</div>
            </div>
          </div>

          <!-- Tags 组 -->
          <div class="tag-group">
            <span v-if="aftersaleMeta" class="tag-pill">
              <Icon icon="lucide:shield-check" width="12" /> {{ aftersaleMeta.label }}
            </span>
            <span class="tag-pill">
              <Icon icon="lucide:package" width="12" /> 库存 {{ product.stock }}
            </span>
            <span class="tag-pill">
              <Icon icon="lucide:trending-up" width="12" /> 销量 {{ product.salesCount || 0 }}
            </span>
            <span class="tag-pill">
              <Icon icon="lucide:bookmark" width="12" /> 收藏 {{ product.favoriteCount || 0 }}
            </span>
          </div>

          <!-- 数量 + 操作 -->
          <div class="qty-row">
            <span class="lbl">数量</span>
            <div class="qty-stepper">
              <button class="stp" :disabled="qty <= 1" @click="qty = Math.max(1, qty - 1)">
                <Icon icon="lucide:minus" width="14" />
              </button>
              <span class="qty-val yb-mono">{{ qty }}</span>
              <button class="stp" :disabled="qty >= product.stock" @click="qty = Math.min(product.stock, qty + 1)">
                <Icon icon="lucide:plus" width="14" />
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="btn primary" :disabled="!canBuy" @click="buyNow">
              <Icon icon="lucide:credit-card" width="16" /> 立即购买
            </button>
            <button class="btn ghost" :disabled="!canBuy" @click="addToCart">
              <Icon icon="lucide:shopping-cart" width="16" /> 加入购物车
            </button>
            <button class="btn outline" @click="startPurchase">
              <Icon icon="lucide:sparkles" width="16" /> 发起求购
            </button>
            <button class="btn ghost" :disabled="favoriting" @click="favorite">
              <Icon icon="lucide:bookmark-plus" width="16" /> 收藏
            </button>
          </div>

          <!-- Seller Profile 大卡 -->
          <div class="seller-card">
            <img :src="sellerAvatar" :alt="product.sellerName" class="seller-avatar" />
            <div class="seller-info">
              <div class="seller-top">
                <span class="seller-name">{{ product.sellerName }}</span>
                <VipBadge level="VIP1" size="sm" />
                <span class="verified"><Icon icon="lucide:badge-check" width="14" /> 认证买手</span>
              </div>
              <div class="seller-stats">
                <span v-if="sellerScore">
                  <Icon icon="lucide:star" width="12" />
                  <span class="yb-mono">{{ sellerScore.avgScore }}</span>
                  · {{ sellerScore.receivedTotal }} 评价
                  · 好评 {{ sellerScore.goodRate }}
                </span>
                <span v-else class="muted">该买手暂无评价</span>
              </div>
            </div>
            <button class="btn ghost sm">
              <Icon icon="lucide:message-square" width="14" /> 联系买手
            </button>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tab-card">
        <div class="tab-bar">
          <button
            v-for="t in [{key:'desc',label:'商品详情'},{key:'spec',label:'规格参数'},{key:'review',label:`用户评价 (${reviews.length})`},{key:'sameshop',label:'同店推荐'}]"
            :key="t.key"
            class="tab"
            :class="{ active: activeTab === t.key }"
            @click="activeTab = t.key as any"
          >{{ t.label }}</button>
        </div>
        <div class="tab-body">
          <div v-if="activeTab === 'desc'" class="desc-block" v-html="product.description || '<p>暂无详情</p>'" />
          <div v-else-if="activeTab === 'spec'" class="spec-list">
            <div class="spec-row"><span class="k">商品编号</span><span class="v yb-mono">{{ product.code }}</span></div>
            <div class="spec-row"><span class="k">所属分类</span><span class="v">{{ product.categoryPath }}</span></div>
            <div class="spec-row"><span class="k">海外过关</span><span class="v">{{ product.overseasCustoms ? '是' : '否' }}</span></div>
            <div class="spec-row"><span class="k">售后类型</span><span class="v">{{ aftersaleMeta?.label || '—' }}</span></div>
            <div class="spec-row"><span class="k">上架时间</span><span class="v">{{ new Date(product.publishedAt || product.createdAt).toLocaleDateString() }}</span></div>
          </div>
          <div v-else-if="activeTab === 'review'">
            <div v-if="reviews.length" class="review-list">
              <div v-for="r in reviews" :key="r.id" class="review-row">
                <img :src="avatarUrl(r.fromUserId)" :alt="r.fromUserName" class="rev-avatar" />
                <div class="rev-body">
                  <div class="rev-head">
                    <span class="rev-user">{{ r.fromUserName }}</span>
                    <ReviewStars :score="r.score" size="sm" />
                    <span class="rev-time yb-mono">{{ new Date(r.createdAt).toLocaleDateString() }}</span>
                  </div>
                  <div class="rev-text">{{ r.content }}</div>
                </div>
              </div>
            </div>
            <EmptyState v-else icon="lucide:message-square" title="暂无评价" description="尚无顾客评价，期待您成为第一位评价者" />
          </div>
          <div v-else-if="activeTab === 'sameshop'">
            <div v-if="sameShop.length" class="same-shop-grid">
              <ProductCard v-for="p in sameShop" :key="p.id" :product="p" />
            </div>
            <EmptyState v-else icon="lucide:store" title="同店暂无其他商品" />
          </div>
        </div>
      </div>
    </template>

    <EmptyState v-else-if="!loading" icon="lucide:package-x" title="商品不存在" action-text="返回首页" @action="router.push('/')" />
  </div>
</template>

<style scoped>
.detail-page {
  padding-top: 20px;
  padding-bottom: 60px;
}

.bread {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--yb-muted);
  margin-bottom: 24px;
}
.bread span {
  cursor: pointer;
  transition: color 0.15s;
}
.bread span:hover { color: var(--yb-ink); }
.bread .current { color: var(--yb-ink); cursor: default; }
.bread .current:hover { color: var(--yb-ink); }

/* ========== Hero grid ========== */
.hero-grid {
  display: grid;
  grid-template-columns: 52% 1fr;
  gap: 40px;
  margin-bottom: 32px;
  align-items: flex-start;
}
.gallery-wrap {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 24px;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.brand-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--yb-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
}
.title {
  font-family: var(--yb-font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.25;
}
.summary {
  font-size: 14px;
  color: var(--yb-muted);
  line-height: 1.6;
  margin: 0;
}
.seller-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--yb-muted);
}
.rev-count { color: var(--yb-muted); }

/* Price */
.price-block {
  background: var(--yb-champagne);
  border-radius: var(--yb-radius-card);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid rgba(184, 147, 90, 0.15);
}
.price-main {
  display: flex;
  align-items: baseline;
  gap: 12px;
  color: var(--yb-ink);
}
.price-main .usdt-value {
  font-family: var(--yb-font-mono);
  font-size: 42px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--yb-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.price-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--yb-font-mono);
  font-size: 15px;
  color: var(--yb-muted);
  margin-top: -4px;
}
.price-sub .approx {
  font-family: var(--yb-font-body);
  color: var(--yb-faint);
}
.price-sub .cny-value {
  color: var(--yb-ink-2);
  font-weight: 600;
}
.price-rate {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  color: var(--yb-faint);
  margin-top: -8px;
  letter-spacing: -0.01em;
}

.tag-live {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  background: var(--yb-ink);
  color: var(--yb-gold);
  border-radius: var(--yb-radius-pill);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  align-self: center;
  margin-left: 4px;
}
.price-detail {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(184, 147, 90, 0.2);
  font-size: 12px;
  color: var(--yb-ink-2);
}
.pd-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.pd-item .lbl {
  color: var(--yb-muted);
}
.pd-item .v {
  color: var(--yb-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.price-detail .sep {
  width: 1px;
  height: 12px;
  background: rgba(184, 147, 90, 0.28);
}

/* Overseas warn */
.overseas-warn {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  background: var(--yb-danger-soft);
  color: var(--yb-danger);
  border-radius: var(--yb-radius-md);
  border-left: 3px solid var(--yb-danger);
}
.warn-title {
  font-size: 13px;
  font-weight: 600;
}
.warn-sub {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 2px;
}

/* Tag group */
.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  background: var(--yb-bg);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  color: var(--yb-ink-2);
  font-weight: 500;
}

/* Qty */
.qty-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.qty-row .lbl {
  font-size: 12px;
  color: var(--yb-muted);
}
.qty-stepper {
  display: inline-flex;
  align-items: center;
  background: var(--yb-bg);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-pill);
  overflow: hidden;
}
.stp {
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  color: var(--yb-ink);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.stp:hover:not(:disabled) { background: var(--yb-hairline); }
.stp:disabled { opacity: 0.4; cursor: not-allowed; }
.qty-val {
  min-width: 44px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--yb-ink);
}

/* Actions */
.actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 14px 22px;
  border-radius: var(--yb-radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  flex: 1;
  justify-content: center;
}
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: var(--yb-brand-pink-2);
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(250, 36, 60, 0.28);
}
.btn.ghost {
  background: var(--yb-surface);
  color: var(--yb-ink);
  border-color: var(--yb-hairline-2);
}
.btn.ghost:hover:not(:disabled) {
  border-color: var(--yb-ink);
}
.btn.outline {
  background: transparent;
  color: var(--yb-primary);
  border-color: var(--yb-primary);
}
.btn.outline:hover {
  background: var(--yb-primary-soft);
}
.btn.sm {
  padding: 8px 14px;
  font-size: 12px;
  flex: none;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Seller card */
.seller-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  margin-top: 8px;
}
.seller-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--yb-champagne);
  border: 2px solid var(--yb-surface);
  box-shadow: var(--yb-shadow-1);
  flex-shrink: 0;
}
.seller-info { flex: 1; min-width: 0; }
.seller-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seller-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--yb-ink);
}
.verified {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--yb-success);
  padding: 2px 8px;
  background: var(--yb-success-soft);
  border-radius: var(--yb-radius-pill);
  font-weight: 500;
}
.seller-stats {
  font-size: 12px;
  color: var(--yb-muted);
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.seller-stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.muted { color: var(--yb-muted); }

/* ========== Tabs ========== */
.tab-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  overflow: hidden;
}
.tab-bar {
  display: flex;
  gap: 4px;
  padding: 16px 24px 0;
  border-bottom: 1px solid var(--yb-hairline);
  position: sticky;
  top: 64px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  z-index: 5;
}
.tab {
  padding: 14px 20px;
  background: transparent;
  border: none;
  color: var(--yb-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  margin-bottom: -1px;
}
.tab:hover { color: var(--yb-ink); }
.tab.active {
  color: var(--yb-ink);
  border-bottom-color: var(--yb-ink);
  font-weight: 700;
}
.tab-body {
  padding: 28px 32px;
}
.desc-block {
  font-size: 14px;
  color: var(--yb-ink-2);
  line-height: 1.75;
  white-space: pre-wrap;
}
.spec-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.spec-row {
  display: flex;
  padding: 14px 0;
  border-bottom: 1px solid var(--yb-hairline);
  font-size: 13px;
}
.spec-row:last-child { border-bottom: none; }
.spec-row .k {
  width: 120px;
  color: var(--yb-muted);
}
.spec-row .v {
  flex: 1;
  color: var(--yb-ink);
  font-weight: 500;
}

/* Review list */
.review-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.review-row {
  display: flex;
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid var(--yb-hairline);
}
.review-row:last-child { border-bottom: none; }
.rev-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--yb-champagne);
  flex-shrink: 0;
}
.rev-body { flex: 1; }
.rev-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.rev-user {
  font-size: 13px;
  font-weight: 600;
  color: var(--yb-ink);
}
.rev-time {
  font-size: 11px;
  color: var(--yb-faint);
}
.rev-text {
  font-size: 13px;
  color: var(--yb-ink-2);
  line-height: 1.6;
}

.same-shop-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .hero-grid { grid-template-columns: 1fr; }
  .same-shop-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
