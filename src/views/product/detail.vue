<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { Icon } from '@iconify/vue';
import { avatarUrl } from '@shared/utils/image';
import { formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import ProductImageGallery from '@/components/product/product-image-gallery.vue';
import ReviewStars from '@/components/common/review-stars.vue';
import EmptyState from '@/components/common/empty-state.vue';
import QuantityStepper from '@/components/common/quantity-stepper.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import ImagePreview from '@/components/common/image-preview.vue';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import RichTextContent from '@/components/common/rich-text-content.vue';
import * as productApi from '@/service/api/product';
import * as reviewApi from '@/service/api/review';
import { useCartStore, useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';
import { createCheckoutIntent } from '@/utils/checkout';
import { resolvePageSize } from '@/service/api/page';
import { setImageFallback } from '@/utils/image-placeholder';

const route = useRoute();
const router = useRouter();
const cart = useCartStore();
const userStore = useUserStore();

const product = ref<Api.RealProduct.Record>();
const reviews = ref<Api.RealReview.ReviewDTO[]>([]);
const reviewPage = ref(1);
const reviewPageSize = ref(20);
const reviewTotal = ref(0);
const reviewLoading = ref(false);
const reviewError = ref('');
const reviewsGuard = createLatestRequestGuard();
const sellerScoreError = ref(false);
const favoriteCountError = ref(false);
const reviewSummary = ref<Api.RealReview.ReviewSummaryDTO>();
const sellerScore = ref<Api.RealReview.SellerRatingDTO>();
const qty = ref(1);
const loading = ref(false);
const loadError = ref('');
const favoriting = ref(false);
const activeTab = ref<'desc' | 'spec' | 'review'>('desc');
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

const id = computed(() => String(route.params.id || ''));
const aftersaleMeta = computed(() => product.value ? productApi.getAftersaleMeta(product.value.aftersaleType) : undefined);
const isOwnProduct = computed(() => userStore.currentUser?.id !== undefined && product.value?.sellerId !== undefined
  && String(userStore.currentUser.id) === String(product.value.sellerId));
const canBuy = computed(() => !loading.value && !isOwnProduct.value && product.value && product.value.status === 'NORMAL' && product.value.shelfStatus === 'on-shelf' && product.value.stock > 0);
const sellerAvatar = computed(() => product.value ? avatarUrl(product.value.sellerId) : '');

async function load() {
  if (!id.value) return;
  reviewsGuard.invalidate();
  reviews.value = [];
  reviewPage.value = 1;
  reviewTotal.value = 0;
  reviewError.value = '';
  reviewLoading.value = false;
  reviewSummary.value = undefined;
  sellerScore.value = undefined;
  sellerScoreError.value = false;
  favoriteCountError.value = false;
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const nextProduct = await productApi.fetchProductDetail(id.value, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    product.value = nextProduct;
    if (product.value) {
      productApi.trackProductBrowse(id.value).catch(() => undefined);
      productApi.trackProductView(id.value).catch(() => undefined);
      void loadReviews(1);
      void reviewApi.fetchReviewSummary(product.value.id, { signal: isCurrent.signal }).then(summary => {
        if (isCurrent()) reviewSummary.value = summary;
      }).catch(() => { /* 不阻塞商品购买；评价列表保留独立读取入口。 */ });
      void reviewApi.fetchSellerRating(product.value.sellerId, { signal: isCurrent.signal }).then(rating => {
        if (isCurrent()) sellerScore.value = rating;
      }).catch(() => { if (isCurrent()) sellerScoreError.value = true; });
    }
  } catch {
    if (!isCurrent()) return;
    product.value = undefined;
    reviews.value = [];
    reviewSummary.value = undefined;
    sellerScore.value = undefined;
    loadError.value = '商品详情加载失败，请检查网络后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadReviews(page: number) {
  const productId = product.value?.id;
  if (productId === undefined) return;
  const isCurrent = reviewsGuard.begin();
  reviewLoading.value = true;
  reviewError.value = '';
  reviewPage.value = page;
  reviews.value = [];
  try {
    let result = await reviewApi.fetchStorefrontReviews({ productId, pageNo: page, pageSize: reviewPageSize.value }, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    reviewPageSize.value = resolvePageSize(result, reviewPageSize.value);
    const lastPage = Math.max(1, Math.ceil(result.total / reviewPageSize.value));
    if (page > lastPage) {
      reviewPage.value = lastPage;
      result = await reviewApi.fetchStorefrontReviews({ productId, pageNo: lastPage, pageSize: reviewPageSize.value }, { signal: isCurrent.signal });
    }
    if (!isCurrent()) return;
    reviews.value = result.records;
    reviewTotal.value = result.total;
  } catch {
    if (isCurrent()) reviewError.value = '评价读取失败，请重新加载';
  } finally {
    if (isCurrent()) reviewLoading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  reviewsGuard.invalidate();
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  writeVersion += 1;
  favoriting.value = false;
  if (String(nextId) !== String(prevId)) {
    qty.value = 1;
    product.value = undefined;
  }
  void load();
});

async function addToCart() {
  if (!product.value || !canBuy.value) return;
  const added = await cart.add(product.value.id, qty.value, product.value);
  if (added === undefined) return;
  if (!added) {
    Message.warning('购买数量超过库存，请检查购物车已有数量');
    return;
  }
  Message.success('已加入购物车');
}
function buyNow() {
  if (!product.value || !canBuy.value) return;
  if (!Number.isSafeInteger(qty.value) || qty.value < 1 || qty.value > product.value.stock) {
    Message.warning('请按当前库存调整购买数量');
    return;
  }
  const contextId = createCheckoutIntent([{ productId: product.value.id, quantity: qty.value }], userStore.currentUser?.id);
  router.push({ path: '/checkout', query: { contextId } });
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
  if (favoriting.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    Message.warning('请先登录后再收藏');
    return;
  }
  const requestedProductId = product.value.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && String(product.value?.id) === String(requestedProductId);
  favoriting.value = true;
  try {
    await productApi.toggleProductFavorite(requestedProductId, { showError: false });
    if (!isCurrentWrite()) return;
    Message.success('收藏状态已更新');
    favoriteCountError.value = true;
    try {
      const latest = await productApi.fetchProductDetail(requestedProductId);
      if (!isCurrentWrite()) return;
      product.value.favoriteCount = latest.favoriteCount;
      favoriteCountError.value = false;
    } catch {
      if (isCurrentWrite()) Message.warning('收藏已成功，数量刷新失败，请重新加载商品查看');
    }
  } catch {
    if (isCurrentWrite()) Message.error('收藏失败，请稍后重试');
  } finally {
    if (operation === writeVersion) favoriting.value = false;
  }
}

const buyDisabledReason = computed(() => {
  if (loading.value) return '商品信息正在刷新，请稍候';
  if (isOwnProduct.value) return '不能购买本人出售的商品';
  if (!product.value || product.value.status !== 'NORMAL') return '当前商品状态不可购买';
  if (product.value.shelfStatus !== 'on-shelf') return '商品已下架';
  if (product.value.stock <= 0) return '商品已售罄';
  return '';
});
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);
const previewIndex = ref(0);
function openPreview(images: string[], index: number) {
  previewImages.value = [...images];
  previewIndex.value = index;
  previewVisible.value = true;
}
function setTab(value: string | number) {
  if (value === 'desc' || value === 'spec' || value === 'review') activeTab.value = value;
}
</script>

<template>
  <div class="detail-page shop-container" :aria-busy="loading">
    <template v-if="product">
      <nav class="bread" aria-label="当前位置">
        <RouterLink to="/">首页</RouterLink><Icon icon="lucide:chevron-right" width="14" />
        <RouterLink :to="{ name: 'product-list', query: { categoryId: String(product.categoryId) } }">{{ product.categoryPath || '商品列表' }}</RouterLink>
        <Icon icon="lucide:chevron-right" width="14" /><span aria-current="page">{{ product.title }}</span>
      </nav>

      <div class="hero-grid">
        <div class="gallery-wrap"><ProductImageGallery :images="product.images" :fallback-seed="product.id" /></div>
        <section class="meta" aria-label="商品信息与购买">
          <span v-if="product.categoryPath" class="brand-label">{{ product.categoryPath }}</span>
          <h1>{{ product.title }}</h1>
          <p v-if="product.summary" class="summary">{{ product.summary }}</p>
          <div v-if="reviewSummary || sellerScore" class="rating-summary">
            <ReviewStars :score="Number(reviewSummary?.averageScore ?? sellerScore?.averageScore)" show-score />
            <span>{{ reviewSummary?.totalCount ?? sellerScore?.totalCount }} 条评价</span>
          </div>

          <div class="price-block">
            <div class="price-main"><strong>{{ priceSet(product.price).usdt }}</strong><span class="currency-label">USDT</span></div>
            <span class="reference-price">≈ {{ priceSet(product.price).cny }}</span>
            <span class="price-rate">{{ priceSet(product.price).rateLabel }}</span>
            <div class="price-detail">
              <span>运费 <b>{{ formatUsdt(product.shippingFee) }}</b></span>
              <span>税费 <b>{{ formatUsdt(product.tax) }}</b><InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="14" /></span>
              <span>库存 <b>{{ product.stock }} 件</b></span>
            </div>
          </div>

          <Alert v-if="product.overseasCustoms" class="overseas-warn">
            <Icon icon="lucide:globe" width="18" /><AlertDescription><strong>海外直邮商品</strong><p>过关后不可退货退款，请认真挑选</p></AlertDescription>
          </Alert>
          <div class="tag-group">
            <span v-if="aftersaleMeta" class="tag-pill"><Icon icon="lucide:shield-check" width="14" />{{ aftersaleMeta.label }}</span>
            <span class="tag-pill"><Icon icon="lucide:trending-up" width="14" />销量 {{ product.salesCount || 0 }}</span>
            <span class="tag-pill"><Icon icon="lucide:bookmark" width="14" />收藏 {{ favoriteCountError ? '待刷新' : (product.favoriteCount || 0) }}</span>
          </div>
          <div class="qty-row"><span>数量</span><QuantityStepper v-model="qty" :max="product.stock" :disabled="!canBuy" label="购买数量" /></div>
          <Alert v-if="isOwnProduct"><Icon icon="lucide:info" width="18" /><AlertDescription>这是您本人出售的商品，不可购买或加入购物车。</AlertDescription></Alert>

          <div class="purchase-actions">
            <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child>
              <span class="action-wrap" :tabindex="!canBuy ? 0 : undefined">
                <Button class="purchase-button" :disabled="!canBuy" @click="buyNow"><Icon icon="lucide:credit-card" width="17" />立即购买</Button>
              </span>
            </TooltipTrigger><TooltipContent v-if="buyDisabledReason">{{ buyDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child>
              <span class="action-wrap" :tabindex="!canBuy || cart.mutating ? 0 : undefined">
                <Button variant="outline" class="purchase-button" :disabled="!canBuy || cart.mutating" @click="addToCart"><Icon :icon="cart.mutating ? 'lucide:loader-circle' : 'lucide:shopping-cart'" :class="{ 'animate-spin': cart.mutating }" width="17" />加入购物车</Button>
              </span>
            </TooltipTrigger><TooltipContent v-if="buyDisabledReason || cart.mutating">{{ buyDisabledReason || '购物车正在同步，请稍候' }}</TooltipContent></Tooltip></TooltipProvider>
          </div>
          <div class="secondary-actions">
            <Button variant="ghost" @click="startPurchase"><Icon icon="lucide:search" width="16" />发起求购</Button>
            <Button variant="ghost" :disabled="favoriting" @click="favorite"><Icon :icon="favoriting ? 'lucide:loader-circle' : 'lucide:heart'" :class="{ 'animate-spin': favoriting }" width="16" />{{ favoriting ? '正在更新' : '收藏商品' }}</Button>
          </div>

          <div class="seller-card">
            <img :src="sellerAvatar" :alt="product.sellerName" />
            <div class="seller-info"><span class="seller-name" :title="product.sellerName">{{ product.sellerName }}</span><span class="seller-label">商品卖家</span>
              <p v-if="sellerScore">买手评分 {{ sellerScore.averageScore }} · {{ sellerScore.totalCount }} 条评价</p>
              <p v-else>{{ sellerScoreError ? '买手评分读取失败' : '该买手暂无评价' }}</p>
            </div>
          </div>
        </section>
      </div>

      <Tabs :model-value="activeTab" @update:model-value="setTab" class="detail-tabs">
        <TabsList class="detail-tab-list">
          <TabsTrigger value="desc" class="detail-tab">商品详情</TabsTrigger>
          <TabsTrigger value="spec" class="detail-tab">规格参数</TabsTrigger>
          <TabsTrigger value="review" class="detail-tab">用户评价 ({{ reviewSummary?.totalCount ?? reviewTotal }})</TabsTrigger>
        </TabsList>
        <TabsContent value="desc" class="tab-body">
          <RichTextContent :content="product.description" />
        </TabsContent>
        <TabsContent value="spec" class="tab-body">
          <dl class="spec-list">
            <div><dt>商品编号</dt><dd>{{ product.code }}</dd></div>
            <div><dt>所属分类</dt><dd>{{ product.categoryPath || '未提供分类名称' }}</dd></div>
            <div><dt>海外过关</dt><dd>{{ product.overseasCustoms ? '是' : '否' }}</dd></div>
            <div><dt>售后类型</dt><dd>{{ aftersaleMeta?.label || '—' }}</dd></div>
            <div><dt>上架时间</dt><dd>{{ formatDateValue(product.publishedAt || product.createdAt, true) }}</dd></div>
          </dl>
        </TabsContent>
        <TabsContent value="review" class="tab-body" :aria-busy="reviewLoading">
          <div v-if="reviewLoading" class="review-skeleton" role="status"><span class="sr-only">正在加载评价</span><Skeleton v-for="index in 3" :key="index" class="h-24 w-full" /></div>
          <EmptyState v-else-if="reviewError" :title="reviewError" action-text="重新加载" @action="loadReviews(reviewPage)" />
          <div v-else-if="reviews.length" class="review-list">
            <article v-for="review in reviews" :key="review.reviewId" class="review-row">
              <img :src="avatarUrl(0)" alt="" class="review-avatar" />
              <div class="review-body">
                <header class="review-head"><span class="review-user">{{ review.anonymous ? '匿名用户' : (review.userName || '匿名用户') }}</span><ReviewStars :score="review.productScore" /><time>{{ formatDateValue(review.createdAt, true) }}</time></header>
                <p class="review-text">{{ review.content }}</p>
                <div v-if="review.images?.length" class="review-images">
                  <button v-for="(image, index) in review.images" :key="`${image}-${index}`" type="button" :aria-label="`查看评价图片 ${index + 1}`" @click="openPreview(review.images!, index)"><img :src="image" alt="评价图片" loading="lazy" @error="setImageFallback" /></button>
                </div>
                <div v-if="review.replyContent" class="review-reply"><strong>买手回复</strong><p>{{ review.replyContent }}</p></div>
              </div>
            </article>
          </div>
          <EmptyState v-else icon="lucide:message-square" title="暂无评价" description="尚无顾客评价，期待您成为第一位评价者" />
          <BusinessPagination v-if="reviewTotal > reviewPageSize" class="review-pagination" :total="reviewTotal" :current="reviewPage" :page-size="reviewPageSize" :loading="reviewLoading" @change="loadReviews" />
        </TabsContent>
      </Tabs>
    </template>
    <div v-else-if="loading" class="detail-skeleton" role="status"><span class="sr-only">正在加载商品详情</span><Skeleton class="aspect-square w-full" /><div><Skeleton class="h-10 w-3/4" /><Skeleton class="mt-6 h-6 w-1/2" /><Skeleton class="mt-8 h-44 w-full" /><Skeleton class="mt-8 h-12 w-full" /></div></div>
    <EmptyState v-else icon="lucide:package-x" :title="loadError || '商品不存在'" :description="loadError ? '请稍后重试。' : undefined" :action-text="loadError ? '重新加载' : '返回首页'" @action="loadError ? load() : router.push('/')" />
    <ImagePreview v-model="previewVisible" :images="previewImages" :start-index="previewIndex" title="评价图片" />
  </div>
</template>

<style scoped>
.detail-page { padding-top: 0; padding-bottom: 56px; }
.bread { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; font-size: 13px; color: var(--yb-muted); }
.bread a:hover { color: var(--yb-primary); }
.bread [aria-current] { min-width: 0; color: var(--yb-ink); overflow-wrap: anywhere; }
.hero-grid, .detail-skeleton { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap:54px; align-items:start; margin-bottom:48px; }
.gallery-wrap { position: relative; z-index: 1; padding:0; background:transparent; border:0; border-radius:6px; }
.meta { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.brand-label { font-size: 12px; letter-spacing: .06em; color: var(--yb-muted); }
.meta h1 { margin: 0; font-size: 32px; line-height: 1.35; font-weight: 600; letter-spacing: -.6px; overflow-wrap: anywhere; }
.summary { color: var(--yb-muted); font-size: 15px; line-height: 1.8; }
.rating-summary { display: flex; align-items: center; gap: 10px; color: var(--yb-muted); font-size: 13px; }
.price-block { display:flex; flex-direction:column; gap:8px; padding:24px; border:0; border-left:3px solid var(--yb-gold); border-radius:4px; background:var(--yb-champagne); }
.price-main { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }
.price-main strong { font-size: 36px; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
.currency-label { color: var(--yb-muted); font-size: 12px; }
.reference-price { color: var(--yb-muted); font-size: 14px; font-variant-numeric: tabular-nums; }
.price-rate { color: var(--yb-muted); font-size: 12px; }
.price-detail { display: flex; flex-wrap: wrap; gap: 16px; padding-top: 16px; margin-top: 8px; border-top: 1px solid var(--yb-hairline); color: var(--yb-muted); font-size: 13px; }
.price-detail span { display: inline-flex; align-items: center; gap: 8px; }
.price-detail b { color: var(--yb-ink); font-weight: 500; }
.overseas-warn { background: var(--yb-champagne); border-color: color-mix(in srgb, var(--yb-gold), transparent 75%); color: var(--yb-ink); }
.overseas-warn strong { font-weight: 600; }.overseas-warn p { margin-top: 4px; color: var(--yb-muted); }
.tag-group { display: flex; flex-wrap: wrap; gap: 10px; }
.tag-pill { display: inline-flex; align-items: center; gap: 6px; color: var(--yb-muted); font-size: 13px; }
.qty-row { display: flex; align-items: flex-start; gap: 24px; font-size: 14px; color: var(--yb-muted); }.qty-row > span { padding-top: 10px; }
.purchase-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.action-wrap { display: block; min-width: 0; }.purchase-button { width: 100%; height: 46px; font-size: 15px; }
.secondary-actions { display: flex; align-items: center; gap: 8px; margin-top: -8px; }
.seller-card { display: flex; align-items: center; gap: 16px; border-top: 1px solid var(--yb-hairline); padding-top: 20px; }
.seller-card > img { width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0; }
.seller-info { flex: 1; min-width: 0; }
.seller-name { display: inline-block; max-width: 200px; vertical-align: middle; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 16px; font-weight: 600; }
.seller-label { margin-left: 8px; font-size: 12px; color: var(--yb-muted); }
.seller-info p { margin-top: 4px; font-size: 13px; color: var(--yb-muted); }
.detail-tabs { background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 12px; }
.detail-tab-list { display: flex; justify-content: flex-start; gap: 16px; height: auto; width: 100%; padding: 0 24px; border-radius: 12px 12px 0 0; border-bottom: 1px solid var(--yb-hairline); background: transparent; }
.detail-tab { height: 56px; padding: 0 12px; border-radius: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--yb-muted); box-shadow: none; font-size: 15px; }
.detail-tab[data-state="active"] { color: var(--yb-primary); border-bottom-color: var(--yb-primary); background: transparent; box-shadow: none; }
.tab-body { margin-top: 0; padding: 28px; }
.spec-list { display: grid; }.spec-list > div { display: flex; gap: 24px; padding: 14px 0; border-bottom: 1px solid var(--yb-hairline); font-size: 14px; }.spec-list > div:last-child { border: 0; }
.spec-list dt { width: 120px; flex-shrink: 0; color: var(--yb-muted); }.spec-list dd { min-width: 0; overflow-wrap: anywhere; }
.review-skeleton { display: grid; gap: 20px; }
.review-row { display: flex; gap: 16px; padding: 24px 0; border-bottom: 1px solid var(--yb-hairline); }.review-row:last-child { border: 0; }
.review-avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; }.review-body { flex: 1; min-width: 0; }
.review-head { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; }.review-user { font-size: 14px; font-weight: 600; }.review-head time { color: var(--yb-muted); font-size: 12px; margin-left: auto; }
.review-text { font-size: 15px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; }.review-images { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.review-images button { border: 1px solid var(--yb-hairline); border-radius: 6px; overflow: hidden; }.review-images img { width: 80px; height: 80px; object-fit: cover; }
.review-reply { margin-top: 16px; padding: 16px; border-radius: 6px; background: var(--yb-fill); font-size: 14px; }.review-reply strong { font-weight: 600; }.review-reply p { margin-top: 8px; color: var(--yb-muted); white-space: pre-wrap; }
.review-pagination { margin-top: 28px; }
@media (max-width: 1100px) { .hero-grid, .detail-skeleton { gap: 28px; }.meta h1 { font-size: 28px; }.price-main strong { font-size: 32px; }.gallery-wrap { padding: 10px; } }
@media (max-width: 900px) { .hero-grid, .detail-skeleton { grid-template-columns: minmax(0, 1fr); }.detail-tab-list { gap: 8px; padding: 0 12px; } }
</style>
