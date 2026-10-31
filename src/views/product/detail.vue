<script setup lang="ts">
import ProductParameters from '@/components/product/product-parameters.vue';
import ProductDescription from '@/components/product/product-description.vue';
function preventImageAction(event: Event) { if (event.target instanceof HTMLImageElement) event.preventDefault(); }
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { FocusScope } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import UmIcon from '@/components/common/um-icon.vue';
import ProductCard from '@/components/product/product-card.vue';
import V47DetailGallery from '@/components/product/v47-detail-gallery.vue';
import V47DetailContent from '@/components/product/v47-detail-content.vue';
import V47DetailReviews from '@/components/product/v47-detail-reviews.vue';
import V47DetailShare from '@/components/product/v47-detail-share.vue';
import V47DetailPreview from '@/components/product/v47-detail-preview.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import * as productApi from '@/service/api/product';
import * as reviewApi from '@/service/api/review';
import { useCartStore, useUserStore } from '@/stores';
import { useProductFavoritesStore } from '@/stores/product-favorites';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';
import { createCheckoutIntent, formatPaymentAmount } from '@/utils/checkout';
import { resolvePageSize } from '@/service/api/page';
import { setImageFallback } from '@/utils/image-placeholder';
import { productRequiresSku, resolveProductPurchase, skuCanPurchase, skuMatchesSelection } from '@/utils/product-sku';

const route = useRoute();
const router = useRouter();
const cart = useCartStore();
const userStore = useUserStore();
const favorites = useProductFavoritesStore();

const product = ref<Api.RealProduct.Record>();
const sellerInitial = computed(() => Array.from(product.value?.sellerName || 'U')[0]);
const reviews = ref<Api.RealReview.ReviewDTO[]>([]);
const reviewPage = ref(1);
const reviewPageSize = ref(20);
const reviewTotal = ref(0);
const reviewLoading = ref(false);
const reviewError = ref('');
const reviewsGuard = createLatestRequestGuard();
const summaryGuard = createLatestRequestGuard();
const sellerRatingGuard = createLatestRequestGuard();
const qualificationGuard = createLatestRequestGuard();
const sellerQualification = ref<Api.RealProduct.SellerQualification>();
const sellerQualificationError = ref(false);
const reviewSummaryLoading = ref(false);
const reviewSummaryError = ref('');
const sellerScoreLoading = ref(false);
const sellerScoreError = ref(false);
const favoriteCountError = ref(false);
const reviewSummary = ref<Api.RealReview.ReviewSummaryDTO>();
const sellerScore = ref<Api.RealReview.SellerRatingDTO>();
const qty = ref(1);
const selectedSpecs = ref<Record<string, string>>({});
const selectedSku = computed(() => {
  const current = product.value;
  if (!current || !productRequiresSku(current) || !current.specGroups?.length
    || current.specGroups.some(group => !selectedSpecs.value[group.name])) return undefined;
  return current.skus?.find(sku => skuMatchesSelection(sku, selectedSpecs.value));
});
const purchase = computed(() => product.value ? resolveProductPurchase(product.value, selectedSku.value?.id) : undefined);
const selectedPrice = computed(() => purchase.value?.unitPrice ?? product.value?.price);
const selectedStock = computed(() => purchase.value?.stock ?? 0);
const selectedSpecText = computed(() => product.value?.specGroups?.map(group => selectedSpecs.value[group.name]).filter(Boolean).join(' / ') || '当前商品');
const galleryImages = computed(() => {
  const images = product.value?.images ?? [];
  const image = selectedSku.value?.image;
  return image ? [{ url: image, name: '所选规格', type: 'image' as const, sort: 0 }, ...images.filter(item => item.url !== image)] : images;
});
function optionAvailable(groupIndex: number, option: string) {
  const groups = product.value?.specGroups ?? [];
  const selection: Record<string, string> = { [groups[groupIndex].name]: option };
  for (const group of groups.slice(0, groupIndex)) if (selectedSpecs.value[group.name]) selection[group.name] = selectedSpecs.value[group.name];
  return product.value?.skus?.some(sku => skuCanPurchase(sku) && skuMatchesSelection(sku, selection)) === true;
}
function selectSpec(groupIndex: number, option: string) {
  if (!optionAvailable(groupIndex, option)) return;
  const groups = product.value?.specGroups ?? [];
  const next = { ...selectedSpecs.value, [groups[groupIndex].name]: option };
  // 上游规格改变时清理不再存在的后续组合，保留真实可购买的选择。
  const prefix: Record<string, string> = {};
  for (const group of groups) {
    if (!next[group.name]) continue;
    const candidate = { ...prefix, [group.name]: next[group.name] };
    if (product.value?.skus?.some(sku => skuCanPurchase(sku) && skuMatchesSelection(sku, candidate))) prefix[group.name] = next[group.name];
  }
  selectedSpecs.value = prefix;
  qty.value = Math.max(1, Math.min(qty.value, selectedStock.value || 1));
}
const mobileSpecs = ref(false);
const mobileSpecTrigger = ref<HTMLButtonElement>();
const mobileSpecClose = ref<HTMLButtonElement>();
let specViewport: MediaQueryList | undefined;
function openMobileSpecs() {
  if (!specViewport?.matches) return;
  mobileSpecs.value = true;
  void nextTick(() => { if (mobileSpecs.value) mobileSpecClose.value?.focus({ preventScroll:true }); });
}
function closeMobileSpecs(restoreFocus = true) {
  mobileSpecs.value = false;
  if (restoreFocus) void nextTick(() => {
    if (mobileSpecTrigger.value?.isConnected && mobileSpecTrigger.value.getClientRects().length) mobileSpecTrigger.value.focus({ preventScroll:true });
  });
}
function syncSpecViewport() { if (!specViewport?.matches) closeMobileSpecs(false); }
const loading = ref(false);
const loadError = ref('');
const favoriting = ref(false);
const favoriteState = computed(() => product.value ? favorites.entries[String(product.value.id)] : undefined);
const favoriteBusy = computed(() => favoriting.value || favoriteState.value?.loading || favoriteState.value?.writing);
const content = ref<InstanceType<typeof V47DetailContent>>();
const reviewStars = ref(0);
const reviewHasImage = ref(false);
const reviewKeyword = ref('');
const reviewSort = ref<Api.RealReview.ReviewSort>('MOST_HELPFUL');
const helpfulBusy = ref<Record<string, boolean>>({});
let helpfulTargets = new Map<string, boolean>();
const allReviewCount = ref<number>();
const related = ref<Api.RealProduct.Record[]>([]);
const relatedLoading = ref(false);
const relatedError = ref(false);
const relatedGuard = createLatestRequestGuard();
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

const id = computed(() => String(route.params.id || ''));
const aftersaleMeta = computed(() => product.value ? productApi.getAftersaleMeta(product.value.aftersaleType) : undefined);
const isOwnProduct = computed(() => userStore.currentUser?.id !== undefined && product.value?.sellerId !== undefined
  && String(userStore.currentUser.id) === String(product.value.sellerId));
const canBuy = computed(() => !buyDisabledReason.value);
function ratingText(value?: string | number) {
  const score = Number(value);
  return value !== undefined && value !== null && Number.isFinite(score) ? Math.max(0, Math.min(5, score)).toFixed(1) : '暂无评分';
}
function money(value?: string | number) { return formatPaymentAmount(value); }

async function load() {
  if (!id.value) return;
  reviewsGuard.invalidate();
  summaryGuard.invalidate();
  sellerRatingGuard.invalidate();
  qualificationGuard.invalidate();
  sellerQualification.value = undefined;
  sellerQualificationError.value = false;
  helpfulBusy.value = {};
  helpfulTargets = new Map();
  relatedGuard.invalidate();
  related.value = [];
  relatedError.value = false;
  relatedLoading.value = false;
  reviewStars.value = 0;
  reviewHasImage.value = false;
  reviewKeyword.value = '';
  reviewSort.value = 'MOST_HELPFUL';
  allReviewCount.value = undefined;
  previewVisible.value = false;
  shareVisible.value = false;
  mobileSpecs.value = false;
  reviews.value = [];
  reviewPage.value = 1;
  reviewTotal.value = 0;
  reviewError.value = '';
  reviewLoading.value = false;
  reviewSummary.value = undefined;
  reviewSummaryLoading.value = false;
  reviewSummaryError.value = '';
  sellerScoreLoading.value = false;
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
    favorites.ensure(nextProduct.id);
    const firstSku = nextProduct.skus?.find(skuCanPurchase);
    selectedSpecs.value = firstSku ? Object.fromEntries(firstSku.specs.map(spec => [spec.name, spec.value])) : {};
    qty.value = Math.max(1, Math.min(qty.value, selectedStock.value || 1));
    if (product.value) {
      productApi.trackProductBrowse(id.value).catch(() => undefined);
      productApi.trackProductView(id.value).catch(() => undefined);
      void loadReviews(1);
      void loadRelated();
      void loadReviewSummary();
      void loadSellerRating();
      void loadSellerQualification();
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

async function loadReviewSummary() {
  const productId = product.value?.id;
  if (productId === undefined) return;
  const isCurrent = summaryGuard.begin();
  const matchesContext = () => isCurrent() && String(product.value?.id) === String(productId);
  reviewSummaryLoading.value = true;
  reviewSummaryError.value = '';
  reviewSummary.value = undefined;
  try {
    const summary = await reviewApi.fetchReviewSummary(productId, { signal:isCurrent.signal });
    if (matchesContext()) reviewSummary.value = summary;
  } catch {
    if (matchesContext()) reviewSummaryError.value = '评价统计读取失败，请重新加载。';
  } finally {
    if (isCurrent()) reviewSummaryLoading.value = false;
  }
}

async function loadSellerRating() {
  const sellerId = product.value?.sellerId;
  if (sellerId === undefined) return;
  const isCurrent = sellerRatingGuard.begin();
  const matchesContext = () => isCurrent() && String(product.value?.sellerId) === String(sellerId);
  sellerScoreLoading.value = true;
  sellerScoreError.value = false;
  sellerScore.value = undefined;
  try {
    const rating = await reviewApi.fetchSellerRating(sellerId, { signal:isCurrent.signal });
    if (matchesContext()) sellerScore.value = rating;
  } catch {
    if (matchesContext()) sellerScoreError.value = true;
  } finally {
    if (isCurrent()) sellerScoreLoading.value = false;
  }
}

async function loadSellerQualification() {
  const sellerId = product.value?.sellerId;
  if (sellerId === undefined || sellerId === '') return;
  const isCurrent = qualificationGuard.begin();
  sellerQualification.value = undefined;
  sellerQualificationError.value = false;
  try {
    const result = await productApi.fetchSellerQualification(sellerId, { signal:isCurrent.signal });
    if (isCurrent() && String(product.value?.sellerId) === String(sellerId)) sellerQualification.value = result;
  } catch {
    if (isCurrent()) sellerQualificationError.value = true;
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
    const query = { productId, pageSize: reviewPageSize.value, productScore: reviewStars.value || undefined, hasImage: reviewHasImage.value || undefined, keyword:reviewKeyword.value || undefined, sortBy:reviewSort.value };
    let result = await reviewApi.fetchStorefrontReviews({ ...query, pageNo:page }, { signal: isCurrent.signal });
    for (let correction = 0; ; correction += 1) {
      if (!isCurrent()) return;
      reviewPageSize.value = resolvePageSize(result, reviewPageSize.value);
      const lastPage = Math.max(1, Math.ceil(result.total / reviewPageSize.value));
      if (reviewPage.value <= lastPage) break;
      // 分页回读期间评价仍可能被删除/下线，重新检查每个回包；限制续读次数。
      if (correction >= 3) throw new Error('评价分页持续变化');
      reviewPage.value = lastPage;
      result = await reviewApi.fetchStorefrontReviews({ ...query, pageNo:lastPage, pageSize:reviewPageSize.value }, { signal: isCurrent.signal });
    }
    if (!isCurrent()) return;
    reviews.value = result.records;
    reviewTotal.value = result.total;
    if (!reviewStars.value && !reviewHasImage.value && !reviewKeyword.value) allReviewCount.value = result.total;
  } catch {
    if (isCurrent()) reviewError.value = '评价读取失败，请重新加载';
  } finally {
    if (isCurrent()) reviewLoading.value = false;
  }
}

function refreshReviewsOnFocus() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!product.value || loading.value || reviewLoading.value || Object.values(helpfulBusy.value).some(Boolean)) return;
  void loadReviews(reviewPage.value);
  void loadReviewSummary();
}

onMounted(() => {
  specViewport = matchMedia('(max-width:700px)');
  specViewport.addEventListener('change', syncSpecViewport);
  window.addEventListener('focus', refreshReviewsOnFocus);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshReviewsOnFocus);
  void load();
});
onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshReviewsOnFocus);
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refreshReviewsOnFocus);
  specViewport?.removeEventListener('change', syncSpecViewport);
  reviewsGuard.invalidate();
  summaryGuard.invalidate();
  sellerRatingGuard.invalidate();
  qualificationGuard.invalidate();
  relatedGuard.invalidate();
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id, () => userStore.sessionVersion], ([nextId, nextUserId, nextSession], [prevId, prevUserId, prevSession]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId) && nextSession === prevSession) return;
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
  const added = await cart.add(product.value.id, qty.value, product.value, selectedSku.value?.id);
  if (added === undefined) return;
  if (!added) {
    Message.warning('购买数量超过库存，请检查购物袋已有数量');
    return;
  }
  Message.success('已加入购物袋');
}
function buyNow() {
  if (!product.value || !canBuy.value) return;
  if (!Number.isSafeInteger(qty.value) || qty.value < 1 || qty.value > selectedStock.value) {
    Message.warning('请按当前库存调整购买数量');
    return;
  }
  const contextId = createCheckoutIntent([{ productId: product.value.id, skuId: selectedSku.value?.id, quantity: qty.value, confirmedUnitPrice: String(selectedPrice.value) }], userStore.currentUser?.id);
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
  if (favoriteBusy.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    Message.warning('请先登录后再收藏');
    return;
  }
  const requestedProductId = product.value.id;
  const operation = writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && String(product.value?.id) === String(requestedProductId);
  favoriting.value = true;
  try {
    const result = await favorites.toggle(requestedProductId);
    if (!isCurrentWrite()) return;
    if (result === undefined) return;
    Message.success(result ? '已收藏' : '已取消收藏');
    favoriteCountError.value = true;
    try {
      const latest = await productApi.fetchProductDetail(requestedProductId);
      if (!isCurrentWrite()) return;
      product.value.favoriteCount = latest.favoriteCount;
      favoriteCountError.value = false;
    } catch {
      if (isCurrentWrite()) Message.warning('收藏已成功，数量刷新失败，请重新加载商品查看');
    }
  } catch (error) {
    if (isCurrentWrite()) Message.error(error instanceof Error ? error.message : '收藏状态待确认，请点击重试');
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
  if (purchase.value?.selectionRequired) return '请选择完整商品规格';
  if (!purchase.value?.available) return '当前规格已停用、缺货或不可购买，请重新选择';
  if (product.value.shippingFee === undefined || product.value.tax === undefined) return '运费或税费待确认，请重新加载后购买';
  return '';
});
const previewVisible = ref(false);
const previewTitle = ref('评价配图');
const shareVisible = ref(false);
const shareUrl = ref('');
const previewImages = ref<string[]>([]);
const previewIndex = ref(0);
function openPreview(images: string[], index: number, title = '评价配图') {
  previewTitle.value = title;
  previewImages.value = [...images];
  previewIndex.value = index;
  previewVisible.value = true;
}
function filterReviews(value: { stars: number; hasImage: boolean; keyword: string; sort: Api.RealReview.ReviewSort }) {
  reviewStars.value = value.stars;
  reviewHasImage.value = value.hasImage;
  reviewKeyword.value = value.keyword;
  reviewSort.value = value.sort;
  void loadReviews(1);
}

async function voteHelpful(review: Api.RealReview.ReviewDTO) {
  const userId = userStore.currentUser?.id;
  if (userId === undefined) { Message.warning('请先登录后再投票'); return; }
  const key = String(review.reviewId);
  if (helpfulBusy.value[key]) return;
  const productId = product.value?.id;
  const context = writeVersion;
  const isCurrent = () => context === writeVersion && String(userStore.currentUser?.id) === String(userId) && String(product.value?.id) === String(productId);
  helpfulBusy.value[key] = true;
  try {
    let target = helpfulTargets.get(key);
    if (target === undefined && typeof review.helpful !== 'boolean') {
      await loadReviews(reviewPage.value);
      if (!isCurrent()) return;
      const current = reviews.value.find(item => String(item.reviewId) === key);
      const state = reviewApi.validateHelpfulState(current as Api.RealReview.ReviewHelpfulVO, review.reviewId);
      Object.assign(review, state);
    }
    target ??= !review.helpful;
    helpfulTargets.set(key, target);
    let result: Api.RealReview.ReviewHelpfulVO;
    try {
      result = await reviewApi.setReviewHelpful(review.reviewId, target);
    } catch (error) {
      if (!isCurrent()) return;
      // 公开评价投票不能读取仅作者/买手可见的私有详情；回读公开当前页。
      // 未能定位时保留原目标，下一次明确点击按该目标幂等重试。
      await loadReviews(reviewPage.value);
      if (!isCurrent()) return;
      const current = reviews.value.find(item => String(item.reviewId) === key);
      result = reviewApi.validateHelpfulState(current as Api.RealReview.ReviewHelpfulVO, review.reviewId);
      if (result.helpful !== target) throw error;
    }
    if (!isCurrent()) return;
    const row = reviews.value.find(item => String(item.reviewId) === key);
    if (row) Object.assign(row, result);
    helpfulTargets.delete(key);
    if (reviewSort.value === 'MOST_HELPFUL') await loadReviews(reviewPage.value);
  } catch (error) {
    if (isCurrent()) Message.error(error instanceof Error ? error.message : '帮助状态待确认，请点击重试');
  } finally {
    if (isCurrent()) helpfulBusy.value[key] = false;
  }
}
async function loadRelated() {
  const productId = product.value?.id;
  if (productId === undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  const isCurrent = relatedGuard.begin();
  const matchesContext = () => isCurrent() && String(product.value?.id) === String(productId)
    && String(userStore.currentUser?.id) === String(requestedUserId);
  relatedLoading.value = true;
  relatedError.value = false;
  try {
    const records = await productApi.fetchHomeRecommendations(5, { signal: isCurrent.signal });
    if (!matchesContext()) return;
    related.value = records.filter(record => String(record.id) !== String(productId)).slice(0, 4);
  } catch {
    if (matchesContext()) { related.value = []; relatedError.value = true; }
  } finally {
    if (matchesContext()) relatedLoading.value = false;
  }
}
function share() {
  shareUrl.value = window.location.href;
  shareVisible.value = true;
}

</script>

<template>
  <div class="detail-page shop-container" :aria-busy="loading">
    <template v-if="product">
      <nav class="breadcrumb" aria-label="当前位置">
        <RouterLink to="/">首页</RouterLink><UmIcon name="chevron" />
        <RouterLink :to="{ name:'product-list', query:{ categoryId:String(product.categoryId) } }">{{ product.categoryPath || '商品列表' }}</RouterLink>
        <UmIcon name="chevron" /><span aria-current="page">{{ product.title }}</span>
      </nav>
      <div class="product-detail">
        <V47DetailGallery :images="galleryImages" :title="product.title" :favoriting="favoriteBusy" :saved="favoriteState?.value" :favorite-error="favoriteState?.error" @favorite="favorite" @share="share" />
        <section class="product-info" aria-label="商品信息与购买">
          <span class="eyebrow">{{ product.categoryPath }}</span>
          <h1>{{ product.title }}</h1>
          <p v-if="product.summary" class="subtitle">{{ product.summary }}</p>
          <div class="rating"><span>★</span>{{ reviewSummaryLoading ? '评分读取中' : reviewSummaryError ? '评分待确认' : reviewSummary?.totalCount ? ratingText(reviewSummary.averageScore) : '暂无评分' }}<button type="button" @click="content?.showReviews()">查看评价（{{ reviewSummary?.totalCount ?? allReviewCount ?? '—' }}）</button><small>已售 {{ product.salesCount ?? '—' }}</small></div>
          <div class="detail-price">
            <span>{{ money(selectedPrice) }} <small>USDT</small></span>
            <p>≈ {{ priceSet(selectedPrice ?? product.price).cny }} <small :title="priceSet(selectedPrice ?? product.price).rateLabel">参考估算 · 获取时间见页顶</small></p>
            <div>运费 {{ money(product.shippingFee) }} USDT <span>税费 {{ money(product.tax) }} USDT <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="14" /></span></div>
          </div>
          <button ref="mobileSpecTrigger" type="button" class="mobile-spec-trigger" :aria-expanded="mobileSpecs" aria-controls="product-spec-options" @click="openMobileSpecs"><span>已选 <b>{{ selectedSpecText }} / {{ qty }} 件</b></span><UmIcon name="chevron" /></button>
          <div v-if="mobileSpecs" class="spec-touch-mask" aria-hidden="true" @pointerdown.prevent @touchmove.prevent @click.stop="closeMobileSpecs()" />
          <FocusScope as-child :trapped="mobileSpecs" :loop="mobileSpecs" :present="mobileSpecs" @unmount-auto-focus="$event.preventDefault()">
          <div id="product-spec-options" class="spec-options" :class="{ sheet:mobileSpecs }" :role="mobileSpecs ? 'dialog' : undefined" :aria-modal="mobileSpecs || undefined" :aria-labelledby="mobileSpecs ? 'product-spec-title' : undefined" @keydown.esc.stop.prevent="closeMobileSpecs()">
            <div class="mobile-only sheet-heading"><h3 id="product-spec-title">确认商品与数量</h3><button ref="mobileSpecClose" type="button" class="icon-btn" aria-label="关闭选购" @click="closeMobileSpecs()"><UmIcon name="close" /></button></div>
            <template v-if="product.hasSku">
              <template v-for="(group, groupIndex) in product.specGroups" :key="group.name">
                <label>{{ group.name }} <small>{{ selectedSpecs[group.name] || '请选择' }}</small></label>
                <div class="option-row"><button v-for="option in group.options" :key="option" type="button" :class="{ active:selectedSpecs[group.name] === option }" :aria-pressed="selectedSpecs[group.name] === option" :disabled="!optionAvailable(groupIndex, option)" @click="selectSpec(groupIndex, option)">{{ option }}</button></div>
              </template>
            </template>
            <template v-else><label>规格</label><div class="option-row"><button type="button" class="active" aria-pressed="true">标准规格</button></div></template>
            <div class="quantity-line"><label>数量</label><div class="stepper"><button type="button" :disabled="!canBuy || qty <= 1" aria-label="减少数量" @click="qty = Math.max(1, qty - 1)">−</button><span>{{ qty }}</span><button type="button" :disabled="!canBuy || qty >= selectedStock" aria-label="增加数量" @click="qty = Math.min(selectedStock, qty + 1)">+</button></div><small>{{ purchase?.selectionRequired ? '请选择规格' : selectedStock ? '库存 ' + selectedStock + ' 件' : '已售罄' }}</small></div>
            <button v-if="mobileSpecs" type="button" class="primary full mobile-only" @click="closeMobileSpecs()">确认数量</button>
          </div>
          </FocusScope>
          <div v-if="product.overseasCustoms" class="overseas-note"><UmIcon name="globe" /><span>海外直邮商品<small>过关后不可退货退款，请认真挑选。</small></span></div>
          <p v-if="isOwnProduct" class="status-banner">这是您本人出售的商品，不可购买或加入购物袋。</p>
          <div class="buy-actions">
            <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child><span class="action-wrap" :tabindex="!canBuy || cart.mutating ? 0 : undefined"><button type="button" class="outline" :disabled="!canBuy || cart.mutating" @click="addToCart"><UmIcon :name="cart.mutating ? 'clock' : 'bag'" />{{ cart.mutating ? '正在同步' : '加入购物袋' }}</button></span></TooltipTrigger><TooltipContent v-if="buyDisabledReason || cart.mutating">{{ buyDisabledReason || '购物袋正在同步，请稍候' }}</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child><span class="action-wrap" :tabindex="!canBuy ? 0 : undefined"><button type="button" class="gold" :disabled="!canBuy" @click="buyNow">{{ product.stock ? '立即购买' : '暂时售罄' }}<UmIcon name="arrow" /></button></span></TooltipTrigger><TooltipContent v-if="buyDisabledReason">{{ buyDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
          </div>
          <div class="product-benefits"><span><UmIcon name="shield" />{{ aftersaleMeta?.label || '售后信息待确认' }}</span><button type="button" @click="startPurchase">发起求购 ↗</button><button type="button" @click="router.push('/im')"><UmIcon name="headset" />咨询买手</button></div>
          <button type="button" class="seller-card" @click="router.push('/im')"><span class="avatar">{{ sellerInitial }}</span><span><b>{{ product.sellerName || '商品买手' }}<span v-if="sellerQualification?.verifiedBuyer" class="seller-verified"><UmIcon name="shield" />已认证买手</span></b><small v-if="sellerScoreLoading || sellerScoreError">{{ sellerScoreLoading ? '正在加载买手评分…' : '买手评分加载失败' }}</small></span><span class="score">{{ sellerScore ? ratingText(sellerScore.averageScore) : '—' }}<UmIcon name="star" /></span><UmIcon name="chevron" /></button>
          <button v-if="sellerScoreError" type="button" class="text-link seller-score-retry" :disabled="sellerScoreLoading" @click="loadSellerRating">重新加载买手评分</button>
          <button v-if="sellerQualificationError" type="button" class="text-link seller-score-retry" @click="loadSellerQualification">重新核对买手资格</button>
        </section>
      </div>
      <ProductParameters :parameters="product.parameters || []" summary />
      <V47DetailContent @contextmenu="preventImageAction" @dragstart="preventImageAction" ref="content" :key="String(product.id)" :initial-review="route.query.tab === 'reviews'">
        <template #default="{ tab }">
          <template v-if="tab === '商品详情'">
            <ProductDescription :summary="product.summary" :description="product.description" />
            <p class="purchase-hint">请核对当前商品资料、包装清单、配送与售后信息后购买。</p>
          </template>
          <div v-else-if="tab === '规格参数'"><ProductParameters :parameters="product.parameters || []" /><dl class="spec-table"><dt>品牌</dt><dd><RouterLink v-if="product.brand?.enabled" :to="{ path:'/brand', query:{ brandId:String(product.brand.id) } }">{{ product.brand.name }}</RouterLink><template v-else>{{ product.brand?.name || '品牌信息未提供' }}</template></dd><dt>商品名称</dt><dd>{{ product.title }}</dd><template v-for="group in product.specGroups" :key="group.name"><dt>{{ group.name }}</dt><dd>{{ group.options.join(' / ') }}</dd></template><template v-if="!product.hasSku"><dt>规格</dt><dd>标准规格</dd></template><dt>库存</dt><dd>{{ product.stock }} 件</dd><dt>售后服务</dt><dd>{{ aftersaleMeta?.label || '—' }}</dd><dt>配送方式</dt><dd>{{ product.overseasCustoms ? '海外直邮' : '普通配送' }}</dd><dt>商品编号</dt><dd>{{ product.code }}</dd><dt>所属分类</dt><dd>{{ product.categoryPath || '未提供分类名称' }}</dd><dt>上架时间</dt><dd>{{ formatDateValue(product.publishedAt || product.createdAt, true) }}</dd><dt>收藏数量</dt><dd>{{ favoriteCountError ? '待刷新' : product.favoriteCount ?? '—' }}</dd></dl></div>
          <template v-else-if="tab === '配送与售后'"><h2>配送与售后</h2><p>运费 {{ money(product.shippingFee) }} USDT，税费 {{ money(product.tax) }} USDT。{{ product.overseasCustoms ? '此商品为海外直邮，过关后不可退货退款。' : '' }}售后类型：{{ aftersaleMeta?.label || '待确认' }}。</p><button type="button" class="outline" @click="router.push('/help')">查看帮助中心 →</button></template>
          <template v-else><h2>支付说明</h2><p>请在结算时选择可用支付方式和网络，并核对订单金额。链上转账后需等待到账确认，请勿重复付款。</p><button type="button" class="outline" @click="router.push('/help')">查看帮助中心 →</button></template>
        </template>
        <template #reviews><V47DetailReviews :rows="reviews" :summary="reviewSummary" :summary-loading="reviewSummaryLoading" :summary-error="reviewSummaryError" :total="reviewTotal" :current="reviewPage" :page-size="reviewPageSize" :loading="reviewLoading" :error="reviewError" :stars="reviewStars" :has-image="reviewHasImage" :keyword="reviewKeyword" :sort="reviewSort" :helpful-busy="helpfulBusy" @helpful="voteHelpful" @filter="filterReviews" @retry-summary="loadReviewSummary" @page="loadReviews" @photo="openPreview" /></template>
      </V47DetailContent>
      <section class="section related-section"><div class="section-heading"><h2>相关商品</h2><RouterLink to="/product/list">发现更多 →</RouterLink></div><div v-if="relatedLoading" class="product-grid related" role="status"><Skeleton v-for="index in 4" :key="index" class="h-72 w-full" /></div><div v-else-if="related.length" class="product-grid related"><ProductCard v-for="item in related" :key="item.id" :product="item" /></div><div v-else class="empty"><p>{{ relatedError ? '推荐商品读取失败' : '暂无推荐商品' }}</p><button v-if="relatedError" type="button" class="outline" @click="loadRelated">重新加载</button></div></section>
    </template>
    <div v-else-if="loading" class="detail-skeleton" role="status"><span class="sr-only">正在加载商品详情</span><Skeleton class="aspect-square w-full" /><div><Skeleton class="h-10 w-3/4" /><Skeleton class="mt-6 h-6 w-1/2" /><Skeleton class="mt-8 h-44 w-full" /><Skeleton class="mt-8 h-12 w-full" /></div></div>
    <EmptyState v-else icon="lucide:package-x" :title="loadError || '商品不存在'" :description="loadError ? '请稍后重试。' : undefined" :action-text="loadError ? '重新加载' : '返回首页'" @action="loadError ? load() : router.push('/')" />
    <V47DetailPreview v-model="previewVisible" :images="previewImages" :start-index="previewIndex" :title="previewTitle" review />
    <V47DetailShare v-model="shareVisible" :url="shareUrl" />
  </div>
</template>

<style scoped>
.breadcrumb [aria-current] { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.detail-skeleton { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:54px; margin:20px 0 48px; }
.buy-actions > .action-wrap { display:flex; flex:1; min-width:0; }
.buy-actions > .action-wrap > button { width:100%; height:auto; }
.spec-capability-note { font-size:13px; line-height:1.6; color:var(--muted); margin-top:12px; }
.detail-panel :deep(.rich-content) { min-width:0; }
.seller-card > span:nth-child(2) { min-width:0; }
.seller-card b { overflow-wrap:anywhere; }
.seller-score-retry { margin-top:10px; }
.seller-verified { display:inline-flex; align-items:center; gap:4px; margin-left:8px; color:var(--primary); font-size:11px; font-weight:500; }
.seller-verified :deep(svg) { width:13px; height:13px; }
@media (max-width:700px) {
  .detail-skeleton { grid-template-columns:1fr; }
  .spec-touch-mask { position:fixed; inset:0; z-index:79; background:transparent; }
  .spec-options.sheet { overscroll-behavior:contain; }
}
</style>
