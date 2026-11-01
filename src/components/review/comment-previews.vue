<script setup lang="ts">
import { formatDateValue } from '@/utils/date-range';
import { hasMoreReviewComments } from '@/utils/review-comments';
defineProps<{ review: Api.RealReview.ReviewDTO; disabled?: boolean }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <section v-if="review.status === 'PUBLISHED' && (review.commentPreviews?.length || hasMoreReviewComments(review.commentCount, review.commentPreviews?.length || 0))" class="comment-previews" aria-label="最近评论">
    <article v-for="comment in review.commentPreviews || []" :key="comment.id">
      <header><b>{{ comment.authorName }}</b><time>{{ formatDateValue(comment.createdAt, true) }}</time></header>
      <p>{{ comment.content }}</p>
    </article>
    <button v-if="hasMoreReviewComments(review.commentCount, review.commentPreviews?.length || 0)" type="button" class="text-link" :disabled="disabled" @click="$emit('open')">查看全部评论</button>
  </section>
</template>

<style scoped>
.comment-previews { margin-top:12px; padding:10px 12px; background:var(--soft); border-radius:6px; font-size:12px; }
article + article { margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
header { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 12px; }
time { color:var(--muted); font-size:11px; }
p { margin:5px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
button { margin-top:6px; min-height:32px; }
</style>
