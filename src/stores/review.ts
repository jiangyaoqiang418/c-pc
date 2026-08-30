import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useUserStore } from './user';
import { getAccessToken } from '@/service/request';
import { isDefinitiveRejection, RequestError } from '@/service/request/type';
import { submitReview } from '@/service/api/review';

interface PendingReview {
  params: Api.RealReview.ReviewSubmitParams;
  state: 'submitting' | 'unknown';
}

/** 仅当前登录会话内保留原操作；跨页面可恢复，不落盘保存评价正文或图片。 */
export const useReviewStore = defineStore('bw-review', () => {
  const userStore = useUserStore();
  const pending = ref<Record<string, PendingReview>>({});
  let generation = 0;
  watch([() => userStore.currentUser?.id, () => getAccessToken()], () => {
    generation += 1;
    pending.value = {};
  }, { flush: 'sync' });

  const pendingReviews = computed(() => Object.values(pending.value));
  const getPending = (orderId: string | number) => pending.value[String(orderId)];

  async function submit(params: Api.RealReview.ReviewSubmitParams, restoring = false) {
    if (!userStore.currentUser) throw new Error('请先登录');
    const key = String(params.orderId);
    const previous = pending.value[key];
    if (previous?.state === 'submitting' || (previous && !restoring) || (!previous && restoring)) {
      throw new RequestError('原评价正在提交或状态已变化，请重新核对', { code: 'REVIEW_PENDING' });
    }
    const original = previous?.params ?? params;
    const snapshot = { ...original, images: original.images && [...original.images] };
    const entry: PendingReview = { params: snapshot, state: 'submitting' };
    const version = generation;
    pending.value[key] = entry;
    try {
      const id = await submitReview(snapshot);
      if (version === generation) delete pending.value[key];
      return id;
    } catch (error) {
      if (version === generation) {
        if (!previous && isDefinitiveRejection(error)) delete pending.value[key];
        else pending.value[key] = { params: snapshot, state: 'unknown' };
      }
      throw error;
    }
  }

  function confirmExisting(review: Api.RealReview.ReviewDTO) {
    const id = review.reviewId;
    if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) return;
    if (review.userId !== undefined && String(review.userId) !== String(userStore.currentUser?.id)) return;
    const key = String(review.orderId);
    if (pending.value[key]?.state === 'unknown') delete pending.value[key];
  }

  return { pendingReviews, getPending, submit, confirmExisting };
});
