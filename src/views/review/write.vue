<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
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
        const ids = await reviewApi.findReviewableOrderIds([nextOrder.id], { signal: isCurrent.signal });
        if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
        reviewable.value = ids.has(String(nextOrder.id));
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
  <div class="review-write-page shop-container">
    <a-spin :loading="loading">
      <template v-if="order">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item role="link" tabindex="0" @click="router.push('/order')" @keydown.enter="router.push('/order')" @keydown.space.prevent="router.push('/order')">我的订单</a-breadcrumb-item>
          <a-breadcrumb-item role="link" tabindex="0" @click="router.push({ name: 'order-detail', params: { id: String(order.id) } })" @keydown.enter="router.push({ name: 'order-detail', params: { id: String(order.id) } })" @keydown.space.prevent="router.push({ name: 'order-detail', params: { id: String(order.id) } })">
            {{ order.code }}
          </a-breadcrumb-item>
          <a-breadcrumb-item>写评价</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="order-card" :body-style="{ padding: '14px 20px' }" :bordered="false">
          <div class="order-row">
            <img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle || '商品图片'" class="cover" @error="setImageFallback" />
            <div class="info">
              <div class="title">{{ order.productTitle }}</div>
              <div class="meta">买手 {{ order.shopperName }} · 总额 U {{ formatAmount(order.totalAmount) }}</div>
            </div>
          </div>
        </a-card>

        <a-alert v-if="submissionUnknown" type="warning">
          本次评价结果尚未确认，原内容保留在当前登录会话中。可查看已提交评价后返回重试；刷新或退出登录会清除本地快照，不会撤销已发出的请求。
          <template #action><a-space><a-button :disabled="submissionInFlight || confirmationOpen" @click="retryPendingReview">按原评价重试</a-button><a-button @click="router.push('/review')">查看我的评价</a-button></a-space></template>
        </a-alert>
        <a-alert v-else-if="pendingOperation?.state === 'submitting'" type="info">原评价正在提交，离开页面不会取消请求，请勿重复提交。</a-alert>
        <ReviewForm v-if="reviewRouteEligible" ref="formRef" :key="`${String(userStore.currentUser?.id)}:${orderId}`" :initial="initialReview" :submitting="submissionInFlight || confirmationOpen || submissionUnknown" @submit="onSubmit" />
        <a-alert v-else-if="eligibilityError" type="warning" class="eligibility-alert">
          {{ eligibilityError }}
          <template #action><a-button :loading="loading" @click="load">重新核对</a-button></template>
        </a-alert>
        <a-alert v-else-if="!loading" type="warning" class="eligibility-alert">
          当前订单不具备评价资格（可能已评价、超过可评价期限或身份/状态不符），请从订单列表的“写评价”入口进入。
          <template #action><a-button size="mini" @click="router.push('/order')">返回订单</a-button></template>
        </a-alert>
      </template>

      <EmptyState
        v-else-if="!loading"
        :title="loadError ? '订单加载失败' : '订单不存在'"
        :description="loadError || undefined"
        :action-text="loadError ? '重新加载' : '返回订单'"
        @action="handleEmptyAction"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.review-write-page {
  padding-top: 16px;
  max-width: 860px;
  margin: 0 auto;
}
.bread {
  margin-bottom: 12px;
}
.order-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.order-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
.cover {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  object-fit: cover;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 4px;
}
.meta {
  font-size: 12px;
  color: #86909c;
}
@media (max-width: 640px) {
  .review-write-page { margin: 0; }
  .order-row { align-items: flex-start; }
  .info { min-width: 0; }
  .title { overflow-wrap: anywhere; }
  .meta { line-height: 1.6; }
}
</style>
