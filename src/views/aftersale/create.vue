<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import EmptyState from '@/components/common/empty-state.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import * as orderApi from '@/service/api/order';
import * as refundApi from '@/service/api/refund';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const orderId = computed(() => String(route.params.orderId || ''));
const order = ref<Api.RealOrder.Record>();
const loading = ref(false);
const loadError = ref('');
const submitting = ref(false);
const confirmationOpen = ref(false);
const form = reactive({ reason: '', evidenceImages: [] as string[] });
const eligible = computed(() => ['PROCURING', 'PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM'].includes(order.value?.status || ''));
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = String(userStore.currentUser?.id || '');
  if (!userId || !orderId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const nextOrder = await orderApi.fetchOrderDetail(orderId.value, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
    order.value = nextOrder;
  } catch {
    if (!isCurrent()) return;
    order.value = undefined;
    loadError.value = '订单信息加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch(() => [orderId.value, userStore.currentUser?.id], () => {
  requestGuard.invalidate();
  writeVersion += 1;
  submitting.value = false;
  confirmationOpen.value = false;
  requestGuard.invalidate();
  order.value = undefined;
  loadError.value = '';
  void load();
});

function submit() {
  if (submitting.value || confirmationOpen.value) return;
  if (!order.value || !eligible.value) return Message.warning('当前订单状态不可申请仅退款');
  if (!form.reason.trim()) return Message.warning('请填写退款原因');
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  confirmationOpen.value = true;
  Modal.confirm({
    title: '确认申请仅退款？',
    content: '申请将由平台后台审核；审核通过后退款会原路退回钱包。',
    okText: '提交申请',
    onCancel() {
      confirmationOpen.value = false;
    },
    async onOk() {
      const operation = ++writeVersion;
      const isCurrentWrite = () => operation === writeVersion
        && String(userStore.currentUser?.id) === String(requestedUserId)
        && sameBusinessId(order.value?.id, requestedOrderId);
      if (!isCurrentWrite()) {
        confirmationOpen.value = false;
        return;
      }
      submitting.value = true;
      try {
        const refundId = await refundApi.createRefund({ orderId: requestedOrderId, reason: form.reason.trim(), evidenceImages: form.evidenceImages });
        if (!isCurrentWrite()) return;
        Message.success('仅退款申请已提交，等待平台审核');
        router.replace({ name: 'aftersale-detail', params: { id: String(refundId) } });
      } catch {
        if (isCurrentWrite()) Message.error('仅退款申请提交失败，请稍后重试');
      } finally {
        if (operation === writeVersion) {
          submitting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}
</script>

<template>
  <div class="aftersale-create-page shop-container">
    <a-spin :loading="loading">
      <template v-if="order">
        <a-breadcrumb class="bread"><a-breadcrumb-item @click="router.push('/order')">我的订单</a-breadcrumb-item><a-breadcrumb-item>申请仅退款</a-breadcrumb-item></a-breadcrumb>
        <a-card class="order-card" :bordered="false"><div class="order-row"><img :src="order.productCover" :alt="order.productTitle || '商品图片'" class="cover" /><div><strong>{{ order.productTitle }}</strong><div class="meta"><OrderStatusTag :status="order.status" size="small" /> · 订单 {{ order.code }}</div></div><strong>U {{ order.totalAmount }}</strong></div></a-card>
        <a-alert v-if="!eligible" type="warning" class="notice">仅“待发货”或“待收货”订单可申请仅退款。</a-alert>
        <a-card class="step-card" :bordered="false"><div class="step-title">退款原因</div><a-textarea v-model="form.reason" :max-length="512" show-word-limit :rows="5" placeholder="请说明退款原因，例如商品与描述不符" /></a-card>
        <a-card class="step-card" :bordered="false"><div class="step-title">上传凭证（可选，最多 6 张）</div><AftersaleEvidenceUploader v-model="form.evidenceImages" :max="6" /></a-card>
        <a-card class="actions-card" :bordered="false"><a-button @click="router.back()">取消</a-button><a-button type="primary" :disabled="!eligible" :loading="submitting || confirmationOpen" @click="submit">提交仅退款申请</a-button></a-card>
      </template>
      <EmptyState v-else-if="!loading" :title="loadError || '订单不存在'" :action-text="loadError ? '重新加载' : '返回订单'" @action="loadError ? load() : router.push('/order')" />
    </a-spin>
  </div>
</template>

<style scoped>
.aftersale-create-page { max-width: 960px; margin: 0 auto; padding-top: 16px; }
.bread,.order-card,.step-card,.notice { margin-bottom: 12px; }
.order-row { display:grid; grid-template-columns:80px 1fr auto; gap:16px; align-items:center; }
.cover { width:80px; height:80px; object-fit:cover; border-radius:4px; background:#f7f8fa; }
.meta { color:#86909c; font-size:12px; margin-top:6px; }.step-title { font-weight:600; margin-bottom:14px; padding-left:8px; border-left:3px solid var(--bw-brand-primary); }
.actions-card { display:flex; justify-content:flex-end; gap:12px; }
@media (max-width: 640px) {
  .aftersale-create-page { padding-top: 10px; }
  .order-row { grid-template-columns: 64px minmax(0, 1fr); gap: 12px; }
  .order-row > strong:last-child { grid-column: 2; }
  .cover { width: 64px; height: 64px; }
  .actions-card { justify-content: stretch; }
  .actions-card :deep(.arco-btn) { flex: 1; }
}
</style>
