<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { useRouter } from 'vue-router';
import ReviewStars from '@/components/common/review-stars.vue';
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


const deleteVisible = ref(false);
const previewOpen = ref(false);
const previewIndex = ref(0);
watch(() => props.review.reviewId, () => { deleteVisible.value = false; previewOpen.value = false; });
</script>

<template>
  <article class="review-card" :class="{ hidden: isHidden }">
    <header class="head"><div class="head-left"><ReviewStars :score="review.productScore" :show-score="true" size="md" /><span class="status" :class="statusMeta.color">{{ statusMeta.label }}</span></div><div class="head-right"><time>{{ formatDateValue(review.createdAt) }}</time><Button variant="link" size="sm" @click="goOrder">查看订单</Button></div></header>
    <div v-if="isHidden" class="hidden-notice"><strong>{{ review.status === 'REJECTED' ? '该评价已被平台驳回' : '该评价已被平台隐藏' }}</strong><span v-if="review.rejectReason">{{ review.rejectReason }}</span><span v-else-if="review.appealStatus === 'PENDING'" class="appeal-pending">申诉处理中…</span></div>
    <template v-else><p class="content">{{ review.content || '未填写评价内容' }}</p><div v-if="review.images?.length" class="photos"><button v-for="(u, index) in review.images" :key="`${u}:${index}`" type="button" :aria-label="`预览评价图片 ${index + 1}`" @click="previewIndex = index; previewOpen = true"><img :src="u" :alt="`评价图片 ${index + 1}`" @error="setImageFallback" /></button></div><div v-if="review.replyContent" class="reply"><strong>买手回复</strong><p>{{ review.replyContent }}</p></div><small class="meta">{{ review.userName || '匿名用户' }} · 订单 {{ review.orderNo || review.orderId }}</small></template>
    <footer v-if="audience === 'sent' || canReply || canAppeal" class="actions"><Button v-if="audience === 'sent'" variant="ghost" size="sm" class="danger" :disabled="!!actionLoading" @click="deleteVisible = true">删除评价</Button><Button v-if="canReply" variant="outline" size="sm" :disabled="!!actionLoading" @click="emit('reply', review)">回复评价</Button><Button v-if="canAppeal" variant="outline" size="sm" :disabled="!!actionLoading" @click="emit('appeal', review)">发起申诉</Button></footer>
    <AModal v-model:visible="deleteVisible" title="删除评价？" :width="420" ok-text="确认删除" :ok-button-props="{ status: 'danger', disabled: !!actionLoading }" @ok="emit('delete', review)"><p class="delete-notice">删除后无法恢复，确认删除这条评价吗？</p></AModal>
    <ImagePreview v-model="previewOpen" :images="review.images || []" :start-index="previewIndex" title="评价图片" />
  </article>
</template>

<style scoped>
.review-card { background:var(--yb-paper); border-radius:10px; margin-bottom:16px; border:1px solid var(--yb-hairline); padding:24px; }.review-card.hidden { background:var(--yb-fill); }.head,.head-left,.head-right { display:flex; align-items:center; gap:12px; }.head { justify-content:space-between; flex-wrap:wrap; margin-bottom:18px; }.head-left { flex-wrap:wrap; }.head-right time { color:var(--yb-muted); font-size:12px; }.content { font-size:15px; line-height:1.8; color:var(--yb-ink); margin:0 0 18px; white-space:pre-wrap; overflow-wrap:anywhere; }.photos { display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }.photos button { overflow:hidden; border:1px solid var(--yb-hairline); border-radius:6px; padding:0; background:var(--yb-fill); cursor:zoom-in; }.photos img { width:80px; height:80px; object-fit:cover; display:block; transition:transform .2s; }.photos button:hover img { transform:scale(1.03); }.photos button:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.meta { font-size:12px; color:var(--yb-muted); overflow-wrap:anywhere; }.reply { margin:18px 0; padding:16px; border-radius:6px; background:var(--yb-fill); color:var(--yb-ink-2); font-size:13px; }.reply strong { font-weight:500; }.reply p { margin:8px 0 0; white-space:pre-wrap; overflow-wrap:anywhere; }.hidden-notice { padding:20px 0; color:#9a5709; font-size:14px; display:grid; gap:10px; }.appeal-pending { color:var(--yb-brand-primary); }.actions { display:flex; justify-content:flex-end; gap:12px; margin-top:20px; padding-top:16px; border-top:1px solid var(--yb-hairline); }.danger { color:var(--destructive); }.status { border-radius:4px; padding:3px 8px; font-size:12px; background:var(--yb-fill); color:var(--yb-muted); }.status.orange { background:#fff3df; color:#9a5709; }.status.green { background:#e9f3eb; color:#326b43; }.status.red { background:#fcecea; color:#ad453e; }.delete-notice { margin:0; line-height:1.8; }@media(prefers-reduced-motion:reduce) { .photos img { transition:none; }.photos button:hover img { transform:none; } }
</style>
