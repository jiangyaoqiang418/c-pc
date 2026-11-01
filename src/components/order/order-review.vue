<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useUserStore } from '@/stores';
import { fetchReviewDetail, fetchReceivedReviews } from '@/service/api/review';
import { RequestError } from '@/service/request/type';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';
import { formatDateValue } from '@/utils/date-range';
import { setImageFallback } from '@/utils/image-placeholder';
import ImagePreview from '@/components/common/image-preview.vue';

const props = defineProps<{ order: Api.RealOrder.Record }>();
const user = useUserStore();
const review = ref<Api.RealReview.ReviewDTO>();
const loading = ref(false);
const error = ref('');
const previewOpen = ref(false);
const previewIndex = ref(0);
const visible = ref(false);
const guard = createLatestRequestGuard(() => `${String(user.currentUser?.id)}:${user.sessionVersion}`);
const reviewId = computed(() => props.order.reviewEligibility?.reviewId);
const statusText = computed(() => review.value ? ({ PENDING:'待审核', PUBLISHED:'已发布', REJECTED:'已驳回', HIDDEN:'已隐藏' }[review.value.status] || review.value.statusText || '状态待确认') : '');
const contentVisible = computed(() => review.value && ['PUBLISHED', 'PENDING'].includes(review.value.status));

async function load() {
  const isCurrent = guard.begin();
  review.value = undefined;
  loading.value = false;
  error.value = '';
  previewOpen.value = false;
  visible.value = false;
  let id = reviewId.value;
  const orderId = props.order.id;
  const permissions = getOrderCapabilities(props.order, user.currentUser?.id);
  if (!permissions.isCustomer && !permissions.isSeller) return;
  if (id == null && (!permissions.isSeller || !['COMPLETED', 'WARRANTY', 'ARCHIVED', 'REFUNDED'].includes(props.order.status))) return;
  visible.value = true;
  loading.value = true;
  try {
    if (id == null) {
      // 买手详情可能只返回 NOT_BUYER 资格；沿用收到的评价分页按原订单 ID 查找。
      const seen = new Set<string>();
      for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
        const page = await fetchReceivedReviews({ pageNo, pageSize:50 }, { signal:isCurrent.signal });
        if (!isCurrent()) return;
        const match = page.records.find(item => sameBusinessId(item.orderId, orderId));
        if (match) { id = match.reviewId; break; }
        const previousCount = seen.size;
        page.records.forEach(item => seen.add(String(item.reviewId)));
        if (seen.size >= page.total) { visible.value = false; return; }
        if (!page.records.length || previousCount === seen.size) throw new Error('评价分页未完整读取');
      }
      if (id == null) throw new Error('尚未查到本单评价，请重试或前往评价管理核对');
    } else if (!sameBusinessId(props.order.reviewEligibility?.orderId, orderId)) throw new Error('订单评价关联异常，请重新读取');
    const result = await fetchReviewDetail(id, { signal:isCurrent.signal, showError:false });
    if (!isCurrent() || !sameBusinessId(props.order.id, orderId)) return;
    if (!sameBusinessId(result?.reviewId, id) || !sameBusinessId(result?.orderId, orderId)) throw new Error('评价与当前订单不一致，请重新读取');
    review.value = result;
  } catch (reason) {
    if (isCurrent()) error.value = reason instanceof RequestError && reason.status === 404 ? '该评价已删除或暂不可用' : '订单评价读取失败，请重试';
  } finally { if (isCurrent()) loading.value = false; }
}
watch([() => props.order, () => props.order.id, reviewId, () => user.currentUser?.id, () => user.sessionVersion], load, { immediate:true });
onBeforeUnmount(guard.invalidate);
</script>

<template>
  <section v-if="visible" class="paper order-production-section order-review" aria-labelledby="order-review-heading" :aria-busy="loading">
    <div class="review-heading"><h2 id="order-review-heading">订单评价</h2><span v-if="review" class="review-status">{{ statusText }}</span></div>
    <p v-if="loading" role="status">正在读取订单评价…</p>
    <div v-else-if="error" role="status"><p>{{ error }}</p><button type="button" class="outline" @click="load">重新加载评价</button></div>
    <template v-else-if="review">
      <div class="review-scores"><span>商品评分 <strong>{{ review.productScore }} / 5</strong></span><span>买手服务 <strong>{{ review.sellerScore }} / 5</strong></span></div>
      <p class="review-author">{{ review.anonymous ? '匿名用户' : review.userName || '顾客' }} · {{ formatDateValue(review.createdAt) }}</p>
      <template v-if="contentVisible">
        <p class="review-content">{{ review.content || '未填写评价内容' }}</p>
        <div v-if="review.images?.length" class="review-images"><button v-for="(url,index) in review.images" :key="`${url}:${index}`" type="button" :aria-label="`查看评价图片 ${index + 1}`" @click="previewIndex = index; previewOpen = true"><img :src="url" :alt="`评价图片 ${index + 1}`" @error="setImageFallback" /></button></div>
        <div v-if="review.replyContent" class="review-response"><b>买手回复</b><p class="review-content">{{ review.replyContent }}</p></div>
      </template>
      <p v-else>该评价{{ review.status === 'REJECTED' ? '已被驳回' : '已隐藏' }}<template v-if="review.rejectReason">：{{ review.rejectReason }}</template></p>
      <ImagePreview v-model="previewOpen" :images="review.images || []" :start-index="previewIndex" title="评价图片" />
    </template>
  </section>
</template>

<style scoped>
.review-heading { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
.review-heading h2 { margin:0; }
.review-status { padding:4px 10px; border-radius:999px; background:var(--soft); color:var(--ink); font-size:13px; }
.review-scores { display:flex; flex-wrap:wrap; gap:16px 32px; }
.review-scores strong { margin-left:8px; color:var(--green); }
.review-author { margin:12px 0; color:var(--muted); font-size:13px; }
.review-content { white-space:pre-wrap; overflow-wrap:anywhere; }
.review-images { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
.review-images button { width:80px; height:80px; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.review-images img { width:100%; height:100%; object-fit:cover; }
.review-response { padding:16px; background:var(--soft); border-radius:8px; margin-top:20px; }
.review-response p { margin-top:8px; }
.order-review .outline { margin-top:12px; }
</style>
