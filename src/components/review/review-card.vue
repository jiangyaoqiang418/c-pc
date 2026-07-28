<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { enums } from '@shared';
import ReviewStars from '@/components/common/review-stars.vue';

interface Props {
  review: Api.Review.ReviewRecord;
}
const props = defineProps<Props>();

const router = useRouter();

const isHidden = computed(() => props.review.moderationStatus === 'hidden');
const directionMeta = computed(() => enums.DIRECTION_META[props.review.direction]);
const moderationMeta = computed(() => enums.MODERATION_STATUS_META[props.review.moderationStatus]);

function goOrder() {
  router.push({ name: 'order-detail', params: { id: String(props.review.orderId) } });
}
</script>

<template>
  <a-card class="review-card" :class="{ hidden: isHidden }" :body-style="{ padding: '16px 20px' }" :bordered="false">
    <div class="head">
      <div class="head-left">
        <ReviewStars :score="review.score" :show-score="true" size="md" />
        <a-tag :color="directionMeta.color" size="small">{{ directionMeta.label }}</a-tag>
        <a-tag v-if="review.moderationStatus !== 'normal'" :color="moderationMeta.color" size="small">
          {{ moderationMeta.label }}
        </a-tag>
      </div>
      <div class="head-right">
        <span class="time">{{ new Date(review.createdAt).toLocaleString() }}</span>
        <a-link size="small" @click="goOrder">查看订单</a-link>
      </div>
    </div>

    <div v-if="isHidden" class="hidden-overlay">
      ⚠️ 该评价已被平台隐藏
      <a-link v-if="review.appealStatus !== 'pending'" disabled class="appeal-link">申诉 · Phase 4 实现</a-link>
      <span v-else class="appeal-pending">申诉处理中…</span>
    </div>
    <template v-else>
      <div class="content">{{ review.content }}</div>
      <div v-if="review.tags?.length" class="tags">
        <a-tag v-for="t in review.tags" :key="t" size="small">{{ t }}</a-tag>
      </div>
      <div v-if="review.photoUrls?.length" class="photos">
        <img v-for="u in review.photoUrls" :key="u" :src="u" />
      </div>
      <div class="meta">
        <span class="from">— {{ review.fromUserName }} · 订单 {{ review.orderCode }}</span>
      </div>
    </template>
  </a-card>
</template>

<style scoped>
.review-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
  border: 1px solid #f2f3f5;
}
.review-card.hidden {
  background: #f7f8fa;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.time {
  color: #86909c;
  font-size: 12px;
}
.content {
  font-size: 14px;
  line-height: 1.6;
  color: #1d2129;
  margin-bottom: 8px;
  white-space: pre-wrap;
}
.tags {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.photos {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.photos img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 4px;
}
.meta {
  font-size: 12px;
  color: #86909c;
}
.from {
  font-style: italic;
}
.hidden-overlay {
  padding: 20px 0;
  color: #ff7d00;
  font-size: 13px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.appeal-link {
  margin-left: 12px;
}
.appeal-pending {
  color: #165dff;
  font-size: 12px;
}
</style>
