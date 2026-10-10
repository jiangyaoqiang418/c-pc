<script setup lang="ts">
import { Button } from '@/components/ui/button';
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
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';
import { RequestError } from '@/service/request/type';
import { useReviewStore } from '@/stores/review';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const reviewStore = useReviewStore();

const orderId = computed(() => String(route.params.orderId));
const order = ref<Api.RealOrder.Record>();
const loading = ref(false);
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
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
    order.value = nextOrder;
    if (getOrderCapabilities(nextOrder, userStore.currentUser?.id).review && !pendingReview.value) {
      try {
        const eligibility = nextOrder.reviewEligibility;
        if (!eligibility || String(eligibility.orderId) !== String(nextOrder.id) || typeof eligibility.reviewable !== 'boolean') throw new Error('缺少评价资格');
        reviewable.value = eligibility.reviewable;
        eligibilityReason.value = eligibility.reviewable ? '' : eligibility.reasonText || eligibility.reason || '当前不可评价';
      } catch {
        if (isCurrent()) eligibilityError.value = '评价资格读取失败，请重新核对';
      }
    }
  } catch {
    if (!isCurrent()) return;
    order.value = undefined;
    loadError.value = '订单信息加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
});
watch([orderId, () => userStore.currentUser?.id], () => {
  writeVersion += 1;
  confirmationModal?.close();
  submitting.value = false;
  confirmationOpen.value = false;
  requestGuard.invalidate();
  order.value = undefined;
  loadError.value = '';
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
  if (!order.value || !reviewRouteEligible.value || !userStore.currentUser || submissionInFlight.value || confirmationOpen.value || (submissionUnknown.value && !restoring)) return;
  if (!sameBusinessId(params.orderId, order.value.id)) return;
  const targetOrder = order.value;
  const requestedUserId = userStore.currentUser.id;
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
        && String(userStore.currentUser?.id) === String(requestedUserId)
        && sameBusinessId(order.value?.id, requestedOrderId);
      if (!isCurrentWrite() || !reviewRouteEligible.value) {
        if (operation === writeVersion) confirmationOpen.value = false;
        return;
      }
      submitting.value = true;
      try {
        await reviewStore.submit(params, restoring);
        if (!isCurrentWrite()) return;
        formRef.value?.markSaved();
        Message.success('评价提交成功');
        router.push('/review');
      } catch (error) {
        if (!isCurrentWrite()) return;
        // RequestError 已由请求层按原始语义提示，不能再改成“提交失败，请重试”。
        if (!(error instanceof RequestError)) Message.error('未能确认评价提交结果，请先核对已提交评价');
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
  <div class="review-write-page shop-container"><div class="review-content" :aria-busy="loading">
    <template v-if="order">
      <nav class="bread" aria-label="面包屑"><RouterLink to="/order">我的订单</RouterLink><span>/</span><RouterLink :to="{ name: 'order-detail', params: { id: String(order.id) } }">{{ order.code }}</RouterLink><span>/</span><strong>写评价</strong></nav>
      <header class="page-heading"><span class="eyebrow">YOUR EXPERIENCE</span><h1>分享这次购物体验</h1><p>真实的使用感受，也是下一位买家的参考。</p></header>
      <section class="order-card"><img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle || '商品图片'" class="cover" @error="setImageFallback" /><div class="info"><h2>{{ order.productTitle }}</h2><small>买手 {{ order.shopperName }} · 总额 U {{ formatAmount(order.totalAmount) }}</small></div></section>
      <Alert v-if="submissionUnknown" class="notice"><AlertDescription>本次评价结果尚未确认，原内容保留在当前登录会话中。可查看已提交评价后返回重试；刷新或退出登录会清除本地快照，不会撤销已发出的请求。</AlertDescription><div class="notice-actions"><Button size="sm" variant="outline" :disabled="submissionInFlight || confirmationOpen" @click="retryPendingReview">按原评价重试</Button><Button size="sm" variant="outline" @click="router.push('/review')">查看我的评价</Button></div></Alert>
      <Alert v-else-if="pendingOperation?.state === 'submitting'" class="notice"><AlertDescription>原评价正在提交，离开页面不会取消请求，请勿重复提交。</AlertDescription></Alert>
      <ReviewForm v-if="reviewRouteEligible" ref="formRef" :key="`${String(userStore.currentUser?.id)}:${orderId}`" :initial="initialReview" :submitting="submissionInFlight || confirmationOpen || submissionUnknown" @submit="onSubmit" />
      <Alert v-else-if="eligibilityReason" class="notice"><AlertDescription>{{ eligibilityReason }}</AlertDescription></Alert>
      <Alert v-else-if="eligibilityError" class="notice"><AlertDescription>{{ eligibilityError }}</AlertDescription><Button size="sm" variant="outline" :disabled="loading" @click="load">重新核对</Button></Alert>
      <Alert v-else-if="!loading" class="notice"><AlertDescription>当前订单不具备评价资格（可能已评价、超过可评价期限或身份/状态不符），请从订单列表的“写评价”入口进入。</AlertDescription><Button size="sm" variant="outline" @click="router.push('/order')">返回订单</Button></Alert>
    </template>
    <div v-else-if="loading" class="skeletons"><Skeleton class="h-28" /><Skeleton class="h-96" /></div>
    <EmptyState v-else :title="loadError ? '订单加载失败' : '订单不存在'" :description="loadError || undefined" :action-text="loadError ? '重新加载' : '返回订单'" @action="handleEmptyAction" />
  </div></div>
</template>

<style scoped>
.review-write-page { padding-top:32px; padding-bottom:48px; }.review-content { display:block; width:100%; max-width:720px; margin:0 auto; }.bread { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:24px; color:var(--yb-muted); font-size:13px; }.bread a:hover { color:var(--yb-brand-primary); }.bread strong { color:var(--yb-ink); font-weight:500; }.page-heading { margin-bottom:24px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { font-size:28px; font-weight:650; margin:6px 0 8px; }.page-heading p { margin:0; color:var(--yb-muted); font-size:14px; }.order-card { display:flex; align-items:center; gap:18px; padding:24px; margin-bottom:20px; background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; }.cover { width:76px; height:76px; border-radius:6px; object-fit:cover; background:var(--yb-fill); }.info { min-width:0; }.info h2 { font-size:17px; font-weight:600; margin:0 0 8px; }.info small { color:var(--yb-muted); font-size:13px; }.notice { margin:18px 0; display:grid; gap:14px; }.notice-actions { display:flex; flex-wrap:wrap; gap:12px; }.skeletons { display:grid; gap:18px; }
</style>
