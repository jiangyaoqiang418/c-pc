<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
import V47CatalogPagination from '@/components/product/v47-catalog-pagination.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUmScrollRail } from '@/composables/use-um-scroll-rail';
import { formatDateValue } from '@/utils/date-range';
import { setImageFallback } from '@/utils/image-placeholder';

const props = defineProps<{
  rows: Api.RealReview.ReviewDTO[];
  summary?: Api.RealReview.ReviewSummaryDTO;
  summaryLoading?: boolean;
  summaryError?: string;
  total: number;
  current: number;
  pageSize: number;
  loading: boolean;
  error: string;
  stars: number;
  hasImage: boolean;
}>();
const emit = defineEmits<{ filter: [value: { stars: number; hasImage: boolean }]; page: [value: number]; photo: [images: string[], index: number, title: string]; 'retry-summary': [] }>();
const rail = ref<HTMLElement>();
const scrollRail = useUmScrollRail(rail, { cardStep:true });
const railHeight = ref<number>();
const expanded = ref<Record<string, boolean>>({});
const replies = ref<Record<string, boolean>>({});
const average = computed(() => {
  const score = Number(props.summary?.averageScore);
  return props.summary && props.summary.totalCount > 0 && Number.isFinite(score) ? Math.max(0, Math.min(5, score)).toFixed(1) : '—';
});
const ratingFill = computed(() => average.value === '—' ? 0 : Number(average.value) / 5 * 100);
const distribution = computed(() => [5,4,3,2,1].map(stars => ({ stars, count:props.summary?.[`star${stars}Count` as 'star1Count'] })));
function name(review: Api.RealReview.ReviewDTO) { return review.anonymous ? '匿名用户' : review.userName || '匿名用户'; }
function text(review: Api.RealReview.ReviewDTO) { return review.content || ''; }
function toggleStars(stars: number) { emit('filter', { stars:props.stars === stars ? 0 : stars, hasImage:props.hasImage }); }
function setImages(hasImage: boolean) { emit('filter', { stars:props.stars, hasImage }); }
function reset() { emit('filter', { stars:0, hasImage:false }); }
function syncRail() {
  const element = rail.value;
  if (!element) return;
  if (element.scrollTop) element.scrollTop = 0;
  const card = element.firstElementChild as HTMLElement | null;
  if (matchMedia('(max-width:700px)').matches && card) {
    const box = element.getBoundingClientRect();
    const visible = Array.from(element.children).filter(item => {
      const rect = item.getBoundingClientRect();
      return Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > rect.width * .4;
    }) as HTMLElement[];
    const height = Math.max(...(visible.length ? visible : [card]).map(item => item.offsetHeight));
    const style = getComputedStyle(element);
    railHeight.value = Math.ceil(height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom));
  } else railHeight.value = undefined;
  scrollRail.update();
}
let resizeObserver: ResizeObserver | undefined;
function observeCards() {
  resizeObserver?.disconnect();
  if (!rail.value) return;
  resizeObserver?.observe(rail.value);
  for (const card of rail.value.children) resizeObserver?.observe(card);
}
onMounted(() => { resizeObserver = new ResizeObserver(syncRail); observeCards(); syncRail(); window.addEventListener('resize', syncRail); });
watch(() => props.rows, async () => { expanded.value = {}; replies.value = {}; await nextTick(); rail.value?.scrollTo({ left:0, behavior:'instant' }); observeCards(); syncRail(); });
onBeforeUnmount(() => { resizeObserver?.disconnect(); window.removeEventListener('resize', syncRail); });
</script>

<template>
  <section class="reviews-section" aria-label="用户评价" :aria-busy="loading">
    <div class="reviews-heading"><div><span class="eyebrow">VOICES OF EVERYDAY</span><h2>好不好用，听听他们说。</h2></div></div>
    <div v-if="summaryError" class="status-banner review-summary-error" role="alert"><span>{{ summaryError }}</span><button type="button" class="outline" :disabled="summaryLoading" @click="emit('retry-summary')">重新加载统计</button></div>
    <div class="reviews-overview" :aria-busy="summaryLoading">
      <div class="reviews-score"><strong>{{ average }}</strong><div><span class="review-stars aggregate-stars" :style="{ '--rating-fill':ratingFill + '%' }" aria-hidden="true">★★★★★</span><p>{{ summary?.totalCount ?? '—' }} 条评价 · 满分 5 分</p></div></div>
      <div class="review-distribution" aria-label="按星级筛选"><button v-for="item in distribution" :key="item.stars" type="button" :aria-label="item.stars + ' 星，' + (item.count ?? '未知') + ' 条评价'" :aria-pressed="stars === item.stars" :class="{ selected:stars === item.stars }" @click="toggleStars(item.stars)"><span>{{ item.stars }} <em>★</em></span><i><b :style="{ width:(summary?.totalCount ? Math.min(100, (item.count || 0) / summary.totalCount * 100) : 0) + '%' }"></b></i><small>{{ item.count ?? '—' }}</small></button></div>
      <div class="review-summary-note"><UmIcon name="chat" /><h3>每一种体验，都值得被看见</h3><p>从商品质感到配送细节，<br />找到对你有用的购买参考。</p></div>
    </div>
    <div class="reviews-toolbar">
      <label class="review-search"><UmIcon name="search" /><input aria-label="搜索评价，暂未开放" placeholder="搜索评价中的关键词" disabled title="评价搜索暂未开放" /></label>
      <Select model-value="sort-unavailable" disabled><SelectTrigger class="app-select-trigger h-10 w-auto min-w-[105px] text-xs" aria-label="评价排序，暂未开放"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sort-unavailable">排序暂未开放</SelectItem></SelectContent></Select>
    </div>
    <div class="review-topics" aria-label="评价主题"><button type="button" :class="{ active:!hasImage }" :aria-pressed="!hasImage" @click="setImages(false)">全部<span>{{ summary?.totalCount ?? '—' }}</span></button><button type="button" :class="{ active:hasImage }" :aria-pressed="hasImage" @click="setImages(true)">有图<span>{{ summary?.withImageCount ?? '—' }}</span></button></div>
    <div class="reviews-result-line"><span role="status">{{ stars ? stars + ' 星 · ' : '' }}{{ loading ? '正在加载评价' : error ? '评价读取失败' : '共 ' + total + ' 条评价' }}</span><button v-if="stars || hasImage" type="button" @click="reset">清除筛选</button><small>星级分布可点击筛选</small></div>
    <div v-if="loading" class="review-loading" role="status"><Skeleton v-for="index in 3" :key="index" class="h-40 w-full" /></div>
    <div v-else-if="error" class="reviews-empty" role="alert"><UmIcon name="chat" /><h3>{{ error }}</h3><button type="button" class="outline" @click="emit('page', current)">重新加载</button></div>
    <div v-else-if="rows.length" class="reviews-rail-host">
      <div ref="rail" class="reviews-rail" :class="{ 'drag-scroll-overflow':scrollRail.overflow.value, 'is-dragging':scrollRail.isDragging.value }" :style="railHeight ? { height:railHeight + 'px' } : undefined" role="region" aria-label="横向滑动用户评价" tabindex="0" data-um-rail @scroll.passive="syncRail" @pointerdown="scrollRail.onPointerdown" @pointermove="scrollRail.onPointermove" @pointerup="scrollRail.onPointerend" @pointercancel="scrollRail.onPointerend" @lostpointercapture="scrollRail.onPointerend" @click.capture="scrollRail.onClickCapture" @dragstart="scrollRail.onDragStart" @keydown="scrollRail.onKeydown">
        <article v-for="review in rows" :key="review.reviewId" class="review-card">
          <header class="review-person"><span class="review-avatar" :class="'tone-' + (review.productScore % 3)" aria-hidden="true">{{ name(review).slice(0, 1) }}</span><div><h3>{{ name(review) }}</h3><small>顾客评价</small></div></header>
          <div class="review-rating-line"><span class="review-stars" :aria-label="review.productScore + ' 分，满分 5 分'"><span v-for="star in 5" :key="star" :class="{ filled:star <= review.productScore }" aria-hidden="true">{{ star <= review.productScore ? '★' : '☆' }}</span></span><time>{{ formatDateValue(review.createdAt, true) }}</time></div>
          <p class="review-body" :class="{ clamped:!expanded[String(review.reviewId)] && text(review).length > 85 }" :id="'review-text-' + review.reviewId">{{ expanded[String(review.reviewId)] || text(review).length <= 85 ? text(review) : text(review).slice(0, 85) + '…' }}</p>
          <button v-if="text(review).length > 85" type="button" class="review-expand" :aria-expanded="!!expanded[String(review.reviewId)]" :aria-controls="'review-text-' + review.reviewId" @click="expanded[String(review.reviewId)] = !expanded[String(review.reviewId)]">{{ expanded[String(review.reviewId)] ? '收起评价' : '展开全文' }}<UmIcon name="chevron" /></button>
          <div v-if="review.images?.length" class="review-photos"><button v-for="(image, index) in review.images" :key="`${image}-${index}`" type="button" :aria-label="'查看 ' + name(review) + ' 的第 ' + (index + 1) + ' 张配图'" @click="emit('photo', review.images!, index, name(review) + ' 的评价配图')"><img :src="image" alt="评价配图" loading="lazy" @error="setImageFallback" /></button></div>
          <div class="review-card-bottom"><button type="button" class="review-helpful" disabled title="评价点赞暂未开放"><UmIcon name="thumb" />对我有帮助<span>—</span></button><button v-if="review.replyContent" type="button" class="review-reply-toggle" :aria-expanded="!!replies[String(review.reviewId)]" @click="replies[String(review.reviewId)] = !replies[String(review.reviewId)]">买手回复<UmIcon name="chevron" /></button></div>
          <div v-if="review.replyContent && replies[String(review.reviewId)]" class="review-reply"><b>买手回复</b><p>{{ review.replyContent }}</p></div>
        </article>
      </div>
      <div v-if="scrollRail.overflow.value" class="edge-scroll-layer"><button type="button" class="edge-scroll-button edge-scroll-prev" :disabled="!scrollRail.canPrev.value" aria-label="向左滑动评价" @click="scrollRail.step(-1)"><UmIcon name="chevron" /></button><button type="button" class="edge-scroll-button edge-scroll-next" :disabled="!scrollRail.canNext.value" aria-label="向右滑动评价" @click="scrollRail.step(1)"><UmIcon name="chevron" /></button></div>
    </div>
    <div v-else class="reviews-empty"><UmIcon :name="stars || hasImage ? 'search' : 'chat'" /><h3>{{ stars || hasImage ? '没有找到匹配的评价' : '期待第一份使用感受' }}</h3><p>{{ stars || hasImage ? '调整筛选，或查看所有购买感受。' : '完成订单后，即可从订单详情分享评价。' }}</p><button v-if="stars || hasImage" type="button" class="outline" @click="reset">查看全部评价</button></div>
    <V47CatalogPagination v-if="!error && !loading && total > pageSize" class="review-pagination" :total="total" :current="current" :page-size="pageSize" :loading="loading" @change="emit('page', $event)" />
  </section>
</template>

<style scoped>
.reviews-rail-host { position:relative; }
.reviews-rail-host > .edge-scroll-layer { inset:0; }
.review-loading { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }
.review-pagination { margin-top:28px; }
.review-summary-error { flex-wrap:wrap; }
.review-summary-error > span { flex:1; }
@media (max-width:700px) { .review-loading { grid-template-columns:1fr; } }
</style>
