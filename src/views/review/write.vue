<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { formatAmount } from '@shared';
import * as orderApi from '@/service/api/order';
import * as reviewApi from '@/service/api/review';
import ReviewForm from '@/components/review/review-form.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';
import { RequestError } from '@/service/request/type';
import { useReviewStore } from '@/stores/review';

// Bundled Lucide icon data (ISC), so review controls also render without the icon CDN.
const reviewIcons = {"message-square-heart": {"body": "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\"/><path d=\"M7.5 9.5c0 .687.265 1.383.697 1.844l3.009 3.264a1.14 1.14 0 0 0 .407.314a1 1 0 0 0 .783-.004a1.14 1.14 0 0 0 .398-.31l3.008-3.264A2.77 2.77 0 0 0 16.5 9.5A2.5 2.5 0 0 0 12 8a2.5 2.5 0 0 0-4.5 1.5\"/></g>", "width": 24, "height": 24}};

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const reviewStore = useReviewStore();

const orderId = computed(() => String(route.params.orderId));
const order = ref<Api.RealOrder.Record>();
const loading = ref(false);
const coverFailed = ref(false);
watch(() => order.value?.productCover, () => { coverFailed.value = false; });
const reviewable = ref(false);
const eligibilityError = ref('');
const eligibilityReason = ref('');
const submitting = ref(false);
const confirmationOpen = ref(false);
const pendingOperation = computed(() => reviewStore.getPending(orderId.value));
const submissionUnknown = computed(() => pendingOperation.value?.state === 'unknown');
const pendingReview = computed(() => pendingOperation.value?.params);
const submissionInFlight = computed(() => submitting.value || pendingOperation.value?.state === 'submitting');
const initialReview = computed(() => pendingReview.value && ({ ...pendingReview.value, photoUrls: pendingReview.value.images || [] }));
const formRef = ref<InstanceType<typeof ReviewForm>>();
const loadError = ref('');
const submissionIssue = ref('');
const existingReviewConflict = ref(false);
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
const reviewRouteEligible = computed(() => (reviewable.value || !!pendingReview.value) && getOrderCapabilities(order.value, userStore.currentUser?.id).review);

async function load() {
  reviewable.value = false;
  eligibilityError.value = '';
  eligibilityReason.value = '';
  const isCurrent = requestGuard.begin();
  const userId = String(userStore.currentUser?.id || '');
  const session = userStore.sessionVersion;
  const matchesContext = () => isCurrent() && session === userStore.sessionVersion && String(userStore.currentUser?.id || '') === userId;
  if (!userId) {
    loading.value = false;
    order.value = undefined;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const nextOrder = await orderApi.fetchOrderDetail(orderId.value, { signal: isCurrent.signal });
    if (!matchesContext()) return;
    order.value = nextOrder;
    if (getOrderCapabilities(nextOrder, userStore.currentUser?.id).review && !pendingReview.value) {
      try {
        const eligibility = nextOrder.reviewEligibility;
        if (!eligibility || String(eligibility.orderId) !== String(nextOrder.id) || typeof eligibility.reviewable !== 'boolean') throw new Error('缺少评价资格');
        reviewable.value = eligibility.reviewable;
        eligibilityReason.value = eligibility.reviewable ? '' : eligibility.reasonText || eligibility.reason || '当前不可评价';
      } catch {
        if (matchesContext()) eligibilityError.value = '评价资格读取失败，请重新核对';
      }
    }
  } catch {
    if (!matchesContext()) return;
    order.value = undefined;
    loadError.value = '订单信息加载失败，请检查网络后重试。';
  } finally {
    if (matchesContext()) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
});
watch([orderId, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  writeVersion += 1;
  confirmationModal?.close();
  submitting.value = false;
  confirmationOpen.value = false;
  requestGuard.invalidate();
  order.value = undefined;
  loadError.value = '';
  submissionIssue.value = '';
  existingReviewConflict.value = false;
  void load();
});

function onSubmit(f: { productScore: number; sellerScore: number; content: string; photoUrls: string[] }) {
  if (!order.value) return;
  confirmReview({ orderId: order.value.id, productScore: f.productScore, sellerScore: f.sellerScore,
    content: f.content.trim() || undefined, images: [...f.photoUrls], anonymous: false });
}

function retryPendingReview() {
  if (pendingReview.value) confirmReview(pendingReview.value, true);
}

function confirmReview(params: Api.RealReview.ReviewSubmitParams, restoring = false) {
  if (!order.value || !reviewRouteEligible.value || !userStore.currentUser || existingReviewConflict.value || submissionInFlight.value || confirmationOpen.value || (submissionUnknown.value && !restoring)) return;
  if (!sameBusinessId(params.orderId, order.value.id)) return;
  const targetOrder = order.value;
  const requestedUserId = userStore.currentUser.id;
  const requestedSession = userStore.sessionVersion;
  const requestedOrderId = targetOrder.id;
  const operation = ++writeVersion;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: restoring ? '按原评价核实并重试？' : '确认提交评价？',
    content: restoring ? '按原订单、原评分及原内容重试。平台按订单幂等处理，已提交时返回原评价，不创建第二条。' : '评价提交后不可修改，请确认评分和内容。',
    onCancel() {
      if (operation === writeVersion) confirmationOpen.value = false;
    },
    async onOk() {
      const isCurrentWrite = () => operation === writeVersion
        && requestedSession === userStore.sessionVersion
        && String(userStore.currentUser?.id) === String(requestedUserId)
        && sameBusinessId(order.value?.id, requestedOrderId);
      if (!isCurrentWrite() || !reviewRouteEligible.value) {
        if (operation === writeVersion) confirmationOpen.value = false;
        return;
      }
      submitting.value = true;
      submissionIssue.value = '';
      let verifiedExisting: Api.RealReview.ReviewDTO | undefined;
      const original = restoring ? reviewStore.getPending(requestedOrderId)?.params : params;
      if (!original) { submitting.value = false; confirmationOpen.value = false; return; }
      const snapshot = { ...original, images:[...(original.images || [])] };
      async function verifyContent(reviewId: string | number) {
        const detail = await reviewApi.fetchReviewDetail(reviewId, { showError:false });
        if (!isCurrentWrite()) throw new RequestError('会话或订单已切换，请重新核对', { code:'SESSION_CHANGED' });
        if (!sameBusinessId(detail.reviewId, reviewId) || !sameBusinessId(detail.orderId, requestedOrderId)
          || !sameBusinessId(detail.userId, requestedUserId)) throw new Error('评价信息未能核对一致，当前输入内容已保留，请先核对原评价');
        verifiedExisting = detail;
        const images = detail.images ?? [];
        if (!Array.isArray(images)) throw new Error('评价图片未能核对完整，当前输入内容已保留，请先查看已提交的评价');
        if (detail.productScore !== snapshot.productScore || detail.sellerScore !== snapshot.sellerScore
          || (detail.content || '').trim() !== (snapshot.content || '').trim()
          || JSON.stringify(images) !== JSON.stringify(snapshot.images)
          || !!detail.anonymous !== !!snapshot.anonymous || snapshot.topic !== undefined && detail.topic !== snapshot.topic) {
          // 已确认作者与订单，才可把不同内容判定为已有评价冲突。
          reviewable.value = true;
          existingReviewConflict.value = true;
          throw new RequestError('该订单已有其他评价，当前草稿内容未提交，已保留供你核对', { code:'REVIEW_CONTENT_MISMATCH' });
        }
      }
      try {
        const latestOrder = await orderApi.fetchOrderDetail(requestedOrderId);
        if (!isCurrentWrite()) return;
        if (!sameBusinessId(latestOrder.id, requestedOrderId) || !getOrderCapabilities(latestOrder, requestedUserId).review) {
          submissionIssue.value = '订单归属或状态已变化，当前草稿保留，未提交新的评价';
          return;
        }
        const eligibility = latestOrder.reviewEligibility;
        if (!eligibility || !sameBusinessId(eligibility.orderId, requestedOrderId) || typeof eligibility.reviewable !== 'boolean') {
          throw new Error('最新评价资格读取不完整，当前草稿保留');
        }
        if (eligibility.reviewId != null) {
          await verifyContent(eligibility.reviewId);
          if (!isCurrentWrite()) return;
          formRef.value?.markSaved();
          if (verifiedExisting) reviewStore.confirmExisting(verifiedExisting);
          Message.success('已核对原评价，与你提交的内容一致');
          void router.push('/review');
          return;
        }
        if (!eligibility.reviewable) {
          submissionIssue.value = eligibility.reasonText || '当前订单不可评价，草稿保持保留，请核对最新订单状态';
          return;
        }
        await reviewStore.submit(snapshot, restoring, verifyContent);
        if (!isCurrentWrite()) return;
        formRef.value?.markSaved();
        Message.success(snapshot.images?.length ? '带图评价已提交，等待平台审核' : '评价内容已提交并核对');
        void router.push('/review');
      } catch (error) {
        if (!isCurrentWrite()) return;
        if (error instanceof RequestError && error.code === 'REVIEW_CONTENT_MISMATCH') {
          if (verifiedExisting) reviewStore.confirmExisting(verifiedExisting);
          submissionIssue.value = error.message;
          Message.warning(error.message);
        } else {
          submissionIssue.value = error instanceof RequestError ? `${error.message}；原评分和内容已保留，请核对后继续操作。` : '未能确认评价提交结果，原评分和内容保持保留，请先核对已提交评价后按原内容恢复';
          if (!(error instanceof RequestError)) Message.warning(submissionIssue.value);
        }
      } finally {
        if (operation === writeVersion) {
          submitting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}

function handleEmptyAction() {
  if (loadError.value) {
    load();
    return;
  }
  router.push('/order');
}


</script>

<template>
  <div class="review-write-page"><div class="review-content paper" :aria-busy="loading">
    <template v-if="order">
      <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/order">我的订单</RouterLink><span>/</span><RouterLink :to="{ name: 'order-detail', params: { id: String(order.id) } }">{{ order.code }}</RouterLink><span>/</span><strong>写评价</strong></nav>
      <header class="review-heading"><div><span class="review-eyebrow">YOUR EXPERIENCE MATTERS</span><h1>好物，值得你的真实评价<span>。</span></h1><p>分享使用感受，帮下一位顾客选到心仪好物。</p></div><div class="review-emblem" aria-hidden="true"><Icon :icon="reviewIcons['message-square-heart']" width="32" /></div></header>
      <section class="review-order"><img v-if="order.productCover && !coverFailed" :src="order.productCover" :alt="order.productTitle || '订单商品图片'" class="cover" @error="coverFailed = true" /><div v-else class="cover cover-empty">暂无商品图片</div><div class="info"><h2>{{ order.productTitle }}</h2><small>买手 · {{ order.shopperName }}</small></div><div class="review-amount"><small>订单总额</small><strong>{{ formatAmount(order.totalAmount) }} <small>USDT</small></strong></div></section>
      <Alert v-if="submissionIssue" class="notice"><AlertDescription>{{ submissionIssue }}</AlertDescription><button v-if="existingReviewConflict" type="button" class="outline" @click="router.push('/review')">查看已有评价</button></Alert>
      <Alert v-if="submissionUnknown && !existingReviewConflict" class="notice"><AlertDescription>本次评价结果尚未确认，原内容保留在当前登录会话中。可查看已提交评价后返回重试；刷新或退出登录会清除本地快照，不会撤销已发出的请求。</AlertDescription><div class="notice-actions"><button type="button" class="outline"  :disabled="submissionInFlight || confirmationOpen" @click="retryPendingReview">按原评价重试</button><button type="button" class="outline"  @click="router.push('/review')">查看我的评价</button></div></Alert>
      <Alert v-else-if="pendingOperation?.state === 'submitting'" class="notice"><AlertDescription>原评价正在提交，离开页面不会取消请求，请勿重复提交。</AlertDescription></Alert>
      <ReviewForm v-if="reviewRouteEligible" ref="formRef" :key="`${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${orderId}`" :initial="initialReview" :submitting="submissionInFlight || confirmationOpen || submissionUnknown" :blocked-reason="existingReviewConflict ? '该订单已有评价，当前草稿未提交' : undefined" @submit="onSubmit" />
      <Alert v-else-if="eligibilityReason" class="notice"><AlertDescription>{{ eligibilityReason }}</AlertDescription></Alert>
      <Alert v-else-if="eligibilityError" class="notice"><AlertDescription>{{ eligibilityError }}</AlertDescription><button type="button" class="outline"  :disabled="loading" @click="load">重新核对</button></Alert>
      <Alert v-else-if="!loading" class="notice"><AlertDescription>当前订单不具备评价资格（可能已评价、超过可评价期限或身份/状态不符），请从订单列表的“写评价”入口进入。</AlertDescription><button type="button" class="outline"  @click="router.push('/order')">返回订单</button></Alert>
    </template>
    <div v-else-if="loading" class="skeletons"><Skeleton class="h-28" /><Skeleton class="h-96" /></div>
    <EmptyState v-else :title="loadError ? '订单加载失败' : '订单不存在'" :description="loadError || undefined" :action-text="loadError ? '重新加载' : '返回订单'" @action="handleEmptyAction" />
  </div></div>
</template>

<style scoped>
.review-write-page { padding:24px 0 48px; }
.review-content.paper { width:100%; max-width:900px; margin:0 auto; padding:36px; border:1px solid var(--line); border-radius:24px; background:var(--paper); color:var(--ink); overflow:hidden; }
.breadcrumb { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 32px; font-size:12px; overflow-wrap:anywhere; }
.review-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:28px; }
.review-eyebrow { color:var(--muted); font-size:10px; letter-spacing:2px; font-weight:600; }
.review-heading h1 { margin:10px 0; font-size:28px; line-height:1.4; letter-spacing:-.8px; font-weight:700; }
.review-heading h1 span { color:var(--green); }
.review-heading p { color:var(--muted); font-size:13px; line-height:1.7; margin:0; }
.review-emblem { display:grid; place-items:center; width:70px; height:70px; flex-shrink:0; border:1px solid color-mix(in srgb, var(--green) 25%, var(--line)); border-radius:22px; color:var(--green); background:color-mix(in srgb, var(--green) 9%, var(--paper)); transform:rotate(-8deg); }
.review-order { display:flex; gap:18px; align-items:center; margin:0 0 28px; padding:20px; background:var(--soft); border:1px solid var(--line); border-radius:16px; }
.review-order .cover { width:76px; height:76px; object-fit:contain; border-radius:12px; background:var(--paper); flex-shrink:0; }
.cover-empty { display:grid; place-items:center; padding:8px; text-align:center; font-size:11px; color:var(--muted); border:1px dashed var(--line); }
.info { min-width:0; flex:1; }.info h2 { margin:0 0 8px; font-size:16px; line-height:1.5; overflow-wrap:anywhere; }.info small,.review-amount small { color:var(--muted); font-size:12px; }
.review-amount { display:grid; gap:8px; text-align:right; flex-shrink:0; }.review-amount strong { font-size:19px; font-variant-numeric:tabular-nums; }.review-amount strong small { font-size:10px; }
.notice { margin:18px 0; display:grid; gap:14px; }.notice-actions { display:flex; flex-wrap:wrap; gap:12px; }.skeletons { display:grid; gap:18px; }
@media(max-width:600px) { .review-write-page { padding:12px 0 24px; }.review-content.paper { padding:22px 16px; border-radius:18px; }.breadcrumb { margin-bottom:24px; font-size:11px; }.review-heading h1 { font-size:23px; }.review-emblem { display:none; }.review-order { padding:14px; gap:12px; flex-wrap:wrap; }.review-order .cover { width:64px; height:64px; }.info h2 { font-size:14px; }.review-amount { width:100%; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--line); padding-top:12px; }.review-amount strong { font-size:17px; } }
</style>
