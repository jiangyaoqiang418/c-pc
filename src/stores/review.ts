import { computed, reactive, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useUserStore } from './user';
import { isDefinitiveRejection, RequestError } from '@/service/request/type';
import { isReviewWriteRejected, submitReview } from '@/service/api/review';

interface PendingReview {
  params: Api.RealReview.ReviewSubmitParams;
  state: 'submitting' | 'unknown';
}

export type ReviewAction = 'reply' | 'appeal' | 'delete';
export interface UncertainReviewAction {
  kind: ReviewAction;
  review: Api.RealReview.ReviewDTO;
  phase: 'unknown' | 'ready' | 'existing';
  note: string;
  content?: string;
  reason?: string;
  evidenceImages?: string[];
  receipt?: string | number;
}

/** 仅当前登录会话内保留原操作；跨页面可恢复，不落盘保存评价正文或图片。 */
export const useReviewStore = defineStore('bw-review', () => {
  const userStore = useUserStore();
  const pending = ref<Record<string, PendingReview>>({});
  const pendingActions = reactive(new Map<string, UncertainReviewAction>());
  let generation = 0;
  watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
    generation += 1;
    pending.value = {};
    pendingActions.clear();
  }, { flush: 'sync' });

  const pendingReviews = computed(() => Object.values(pending.value));
  const getPending = (orderId: string | number) => pending.value[String(orderId)];

  async function submit(params: Api.RealReview.ReviewSubmitParams, restoring = false, verify?: (id: string | number) => Promise<void>) {
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
    let receivedId = false;
    try {
      const id = await submitReview(snapshot);
      receivedId = true;
      if (version !== generation) throw new RequestError('登录会话已变化，请返回原订单核对评价', { code: 'SESSION_CHANGED' });
      await verify?.(id);
      if (version !== generation) throw new RequestError('登录会话已变化，请返回原订单核对评价', { code: 'SESSION_CHANGED' });
      delete pending.value[key];
      return id;
    } catch (error) {
      if (version === generation) {
        if (error instanceof RequestError && error.code === 'REVIEW_CONTENT_MISMATCH'
          || !receivedId && !previous && (isDefinitiveRejection(error) || isReviewWriteRejected(error))) delete pending.value[key];
        else pending.value[key] = { params: snapshot, state: 'unknown' };
      }
      throw error;
    }
  }

  function confirmExisting(review: Api.RealReview.ReviewDTO) {
    const id = review.reviewId;
    if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) return;
    if (review.userId === undefined || String(review.userId) !== String(userStore.currentUser?.id)) return;
    const key = String(review.orderId);
    const original = pending.value[key];
    if (original?.state !== 'unknown') return;
    const params = original.params;
    if (review.productScore !== params.productScore || review.sellerScore !== params.sellerScore
      || (review.content || '').trim() !== (params.content || '').trim()
      || JSON.stringify(review.images ?? []) !== JSON.stringify(params.images ?? [])
      || !!review.anonymous !== !!params.anonymous || params.topic !== undefined && review.topic !== params.topic) return;
    delete pending.value[key];
  }

  return { pendingReviews, getPending, submit, confirmExisting, pendingActions };
});
