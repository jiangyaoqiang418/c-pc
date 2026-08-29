<script setup lang="ts">
import { computed } from 'vue';
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
</script>

<template>
  <a-card class="review-card" :class="{ hidden: isHidden }" :body-style="{ padding: '16px 20px' }" :bordered="false">
    <div class="head">
      <div class="head-left">
        <ReviewStars :score="review.productScore" :show-score="true" size="md" />
        <a-tag :color="statusMeta.color" size="small">
          {{ statusMeta.label }}
        </a-tag>
      </div>
      <div class="head-right">
        <span class="time">{{ formatDateValue(review.createdAt) }}</span>
        <a-link size="small" @click="goOrder">查看订单</a-link>
      </div>
    </div>

    <div v-if="isHidden" class="hidden-overlay">
      ⚠️ 该评价已被平台隐藏
      <span v-if="review.rejectReason">{{ review.rejectReason }}</span>
      <span v-else-if="review.appealStatus === 'PENDING'" class="appeal-pending">申诉处理中…</span>
    </div>
    <template v-else>
      <div class="content">{{ review.content }}</div>
      <div v-if="review.images?.length" class="photos">
        <img v-for="(u, index) in review.images" :key="u" :src="u" :alt="`评价图片 ${index + 1}`" />
      </div>
      <div v-if="review.replyContent" class="reply">买手回复：{{ review.replyContent }}</div>
      <div class="meta">
        <span class="from">— {{ review.userName || '匿名用户' }} · 订单 {{ review.orderNo || review.orderId }}</span>
      </div>
    </template>
    <div v-if="audience === 'sent' || canReply || canAppeal" class="actions">
      <a-popconfirm
        v-if="audience === 'sent'"
        content="删除后无法恢复，确认删除这条评价吗？"
        type="warning"
        @ok="emit('delete', review)"
      >
        <a-button type="text" status="danger" size="mini" :loading="actionLoading === String(review.reviewId)">删除评价</a-button>
      </a-popconfirm>
      <a-button v-if="canReply" type="text" size="mini" :loading="actionLoading === String(review.reviewId)" @click="emit('reply', review)">回复评价</a-button>
      <a-button v-if="canAppeal" type="text" size="mini" :loading="actionLoading === String(review.reviewId)" @click="emit('appeal', review)">发起申诉</a-button>
    </div>
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
.reply { margin: 10px 0; padding: 8px 10px; border-radius: 4px; background: #f7f8fa; color: #4e5969; font-size: 13px; }
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
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
