<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import { formatDateValue } from '@/utils/date-range';

interface Props {
  review: Api.RealReview.ReviewDTO;
  audience: 'sent' | 'received';
  actionLoading?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'reply', review: Api.RealReview.ReviewDTO): void;
  (e: 'appeal', review: Api.RealReview.ReviewDTO): void;
  (e: 'delete', review: Api.RealReview.ReviewDTO): void;
}>();

const router = useRouter();

const isHidden = computed(() => ['HIDDEN', 'REJECTED'].includes(props.review.status));
const canReply = computed(() => props.audience === 'received' && props.review.status === 'PUBLISHED' && !props.review.replyContent);
const canAppeal = computed(() => props.audience === 'received' && ['PUBLISHED', 'HIDDEN'].includes(props.review.status) && !props.review.appealId);
const statusMeta = computed(() => ({
  PENDING: { label: '待审核', color: 'orange' }, PUBLISHED: { label: '已发布', color: 'green' },
  REJECTED: { label: '已驳回', color: 'red' }, HIDDEN: { label: '已隐藏', color: 'gray' }
}[props.review.status] || { label: props.review.statusText || props.review.status, color: 'gray' }));

function goOrder() {
  router.push({ name: 'order-detail', params: { id: String(props.review.orderId) } });
}


const expanded = ref(false);
const replyOpen = ref(false);
const displayName = computed(() => props.review.anonymous ? '匿名用户' : props.review.userName || '匿名用户');
const deleteVisible = ref(false);
const previewOpen = ref(false);
const previewIndex = ref(0);
watch(() => props.review.reviewId, () => { deleteVisible.value = false; previewOpen.value = false; expanded.value = false; replyOpen.value = false; });
</script>

<template>
  <article class="review-card" :class="{ hidden:isHidden }">
    <header class="review-person"><span class="review-avatar" :class="`tone-${review.productScore % 3}`" aria-hidden="true">{{ displayName.slice(0,1) }}</span><div><h3>{{ displayName }}</h3><small>{{ audience === 'sent' ? '我的评价' : '顾客评价' }}</small></div><span class="review-origin">{{ statusMeta.label }}</span></header>
    <div class="review-rating-line"><span class="review-stars" :aria-label="`${review.productScore} 分，满分 5 分`"><span v-for="n in 5" :key="n" :class="{ filled:n <= review.productScore }" aria-hidden="true">{{ n <= review.productScore ? '★' : '☆' }}</span></span><time>{{ formatDateValue(review.createdAt) }}</time></div>
    <p v-if="review.productTitle" class="review-variant">{{ review.productTitle }}</p>
    <div v-if="isHidden" class="status-banner"><strong>{{ review.status === 'REJECTED' ? '该评价已被平台驳回' : '该评价已被平台隐藏' }}</strong><span v-if="review.rejectReason">{{ review.rejectReason }}</span><span v-else-if="review.appealStatus === 'PENDING'">申诉处理中…</span></div>
    <template v-else>
      <p :id="`review-text-${review.reviewId}`" class="review-body">{{ expanded || !review.content || review.content.length <= 85 ? review.content || '未填写评价内容' : `${review.content.slice(0,85)}…` }}</p>
      <button v-if="review.content && review.content.length > 85" type="button" class="review-expand" :aria-expanded="expanded" :aria-controls="`review-text-${review.reviewId}`" @click="expanded = !expanded">{{ expanded ? '收起评价' : '展开全文' }} <UmIcon name="chevron" /></button>
      <div v-if="review.images?.length" class="review-photos"><button v-for="(url,index) in review.images" :key="`${url}:${index}`" type="button" :aria-label="`预览评价图片 ${index + 1}`" @click="previewIndex = index; previewOpen = true"><img :src="url" :alt="`评价图片 ${index + 1}`" @error="setImageFallback" /></button></div>
    </template>
    <div class="review-card-bottom"><button type="button" class="text-link" @click="goOrder">查看订单</button><button v-if="review.replyContent && !isHidden" type="button" class="review-reply-toggle" :aria-expanded="replyOpen" @click="replyOpen = !replyOpen">买手回复 <UmIcon name="chevron" /></button></div>
    <div v-if="review.replyContent && replyOpen && !isHidden" class="review-reply"><b>买手回复</b><p>{{ review.replyContent }}</p></div>
    <footer v-if="audience === 'sent' || canReply || canAppeal" class="button-row review-actions"><button v-if="audience === 'sent'" type="button" class="text-link danger" :disabled="!!actionLoading" @click="deleteVisible = true">删除评价</button><button v-if="canReply" type="button" class="outline" :disabled="!!actionLoading" @click="emit('reply',review)">回复评价</button><button v-if="canAppeal" type="button" class="outline" :disabled="!!actionLoading" @click="emit('appeal',review)">发起申诉</button></footer>
    <AModal v-model:visible="deleteVisible" title="删除评价？" :width="420" ok-text="确认删除" :ok-button-props="{ status:'danger',disabled:!!actionLoading }" @ok="emit('delete',review)"><p>删除后无法恢复，确认删除这条评价吗？</p></AModal>
    <ImagePreview v-model="previewOpen" :images="review.images || []" :start-index="previewIndex" title="评价图片" />
  </article>
</template>

<style scoped>
.review-actions { justify-content:flex-end; flex-wrap:wrap; margin-top:16px; }.danger { color:var(--yb-danger); }.status-banner { flex-wrap:wrap; }.review-reply p { white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
