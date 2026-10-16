<script setup lang="ts">
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isDefinitiveRejection } from '@/service/request/type';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useUnsavedForm } from '@/composables/use-unsaved-form';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import EmptyState from '@/components/common/empty-state.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import * as orderApi from '@/service/api/order';
import * as refundApi from '@/service/api/refund';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { getOrderCapabilities } from '@/utils/order';
import { readRefundIntent, submitRefundIntent } from '@/utils/financial-submission';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const orderId = computed(() => String(route.params.orderId || ''));
const order = ref<Api.RealOrder.Record>();
const loading = ref(false);
const loadError = ref('');
const submitting = ref(false);
const uploading = ref(false);
const confirmationOpen = ref(false);
const pendingIntent = ref<ReturnType<typeof readRefundIntent>>();
const recoveryError = ref('');
const form = reactive({ reason: '', evidenceImages: [] as string[] });
const { markInteracted, markSaved } = useUnsavedForm(() => form, () => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${orderId.value}`);
const eligible = computed(() => getOrderCapabilities(order.value, userStore.currentUser?.id).refund);
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

function cancelCreate() {
  const back = router.options.history.state.back;
  const orderPath = orderId.value ? `/order/${encodeURIComponent(orderId.value)}` : '/order';
  if (typeof back === 'string' && ['/order', orderPath].includes(back.split(/[?#]/)[0])) router.back();
  else void router.replace(orderPath);
}

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = String(userStore.currentUser?.id || '');
  const requestedOrderId = orderId.value;
  if (!userId || !orderId.value) {
    loading.value = false;
    order.value = undefined;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  pendingIntent.value = undefined;
  recoveryError.value = '';
  try { pendingIntent.value = readRefundIntent(userId, orderId.value); } catch (error) { recoveryError.value = error instanceof Error ? error.message : '原申请读取失败'; }
  try {
    const nextOrder = await orderApi.fetchOrderDetail(orderId.value, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
    if (!sameBusinessId(nextOrder.id, requestedOrderId)) throw new Error('订单详情对象不一致');
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
  confirmationModal?.close();
  requestGuard.invalidate();
});
watch([orderId, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  requestGuard.invalidate();
  writeVersion += 1;
  confirmationModal?.close();
  form.reason = '';
  form.evidenceImages = [];
  submitting.value = false;
  confirmationOpen.value = false;
  order.value = undefined;
  loadError.value = '';
  void load();
});

function submit(restoring = false) {
  if (submitting.value || confirmationOpen.value || uploading.value) return;
  if (recoveryError.value) return Message.warning(recoveryError.value);
  if (!order.value || (!restoring && !eligible.value)) return Message.warning('当前订单状态不可申请仅退款');
  if (!restoring && !form.reason.trim()) return Message.warning('请填写退款原因');
  const snapshot = restoring && pendingIntent.value ? pendingIntent.value.params : { orderId: order.value.id, reason: form.reason.trim(), evidenceImages: [...form.evidenceImages] };
  const requestedUserId = userStore.currentUser?.id;
  const requestedOrderId = order.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const requestedSession = userStore.sessionVersion;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '确认申请仅退款？',
    content: '申请提交后由买手确认意见，再由平台审核；平台审核通过后退款会原路退回钱包。',
    okText: '提交申请',
    onCancel() {
      if (operation === writeVersion && userStore.sessionVersion === requestedSession) confirmationOpen.value = false;
    },
    async onOk() {
      const isCurrentWrite = () => operation === writeVersion && userStore.sessionVersion === requestedSession
        && String(userStore.currentUser?.id) === String(requestedUserId)
        && sameBusinessId(order.value?.id, requestedOrderId);
      if (!isCurrentWrite() || (!restoring && !eligible.value)) {
        if (operation === writeVersion && userStore.sessionVersion === requestedSession) confirmationOpen.value = false;
        return;
      }
      submitting.value = true;
      try {
        if (!restoring) {
          const latest = await orderApi.fetchOrderDetail(requestedOrderId);
          if (!isCurrentWrite()) return;
          if (!sameBusinessId(latest.id, requestedOrderId) || !getOrderCapabilities(latest, requestedUserId).refund) {
            if (sameBusinessId(latest.id, requestedOrderId)) order.value = latest;
            Message.warning('当前订单状态或退款资格已变化，请重新核对');
            return;
          }
        }
        const refundId = await submitRefundIntent(requestedUserId, snapshot, { lookup: refundApi.fetchRefundByKey, submit: params => {
          if (!isCurrentWrite()) throw new Error('原申请页面或登录会话已变化，本次未继续提交');
          return refundApi.createRefund(params, { showError: false });
        } }, restoring);
        if (!isCurrentWrite()) return;
        try { pendingIntent.value = readRefundIntent(requestedUserId, requestedOrderId); } catch { recoveryError.value = '原申请读取失败，请先到我的售后核实'; }
        markSaved();
        Message.success('仅退款申请已提交，等待买手确认');
        router.replace({ name: 'aftersale-detail', params: { id: String(refundId) } });
      } catch (error) {
        if (!isCurrentWrite()) return;
        try { pendingIntent.value = readRefundIntent(requestedUserId, requestedOrderId); } catch { recoveryError.value = '原申请读取失败，请先到我的售后核实'; }
        if (isDefinitiveRejection(error)) {
          Message.error(error instanceof Error ? error.message : '申请未被接受，请核对后重试');
        } else {
          Message.warning(error instanceof Error ? error.message : '未取得确定结果，请恢复原申请核对');
        }
      } finally {
        if (operation === writeVersion && userStore.sessionVersion === requestedSession) {
          submitting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}


const submitDisabledReason = computed(() => {
  if (submitting.value || confirmationOpen.value) return '正在处理原申请，请稍候';
  if (uploading.value) return '请等待凭证上传完成';
  if (recoveryError.value) return recoveryError.value;
  if (pendingIntent.value && !pendingIntent.value.receipt) return '请先恢复并核对原退款申请';
  if (!eligible.value) return '仅待发货或待收货订单可申请仅退款';
  return '';
});
</script>

<template>
  <div class="aftersale-create-page" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
    <div class="aftersale-create-content paper narrow" :aria-busy="loading">
      <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/order">我的订单</RouterLink><span>/</span><strong>申请仅退款</strong></nav>
      <template v-if="order">
        <Alert v-if="recoveryError" class="notice"><AlertDescription>{{ recoveryError }}</AlertDescription></Alert>
        <Alert v-else-if="pendingIntent && !pendingIntent.receipt" class="notice"><AlertDescription>原退款申请待核对，将使用原原因、凭证和幂等键；回查未落地才按原参数重试。</AlertDescription><button type="button" class="outline"  :disabled="submitting || confirmationOpen" @click="submit(true)">恢复原申请</button></Alert>
        <h1>申请仅退款</h1><p>待发货或待收货订单可申请，由平台审核。</p>
        <section class="checkout-item refund-order"><img :src="order.productCover || PRODUCT_IMAGE_PLACEHOLDER" :alt="order.productTitle || '商品图片'" class="cover" @error="setImageFallback" /><div class="order-info"><strong>{{ order.productTitle }}</strong><div class="meta"><OrderStatusTag :status="order.status" size="small" /><span>订单 {{ order.code }}</span></div></div><strong class="amount">U {{ order.totalAmount }}</strong></section>
        <Alert v-if="!eligible" class="notice"><AlertDescription id="refund-unavailable">仅“待发货”或“待收货”订单可申请仅退款。</AlertDescription></Alert>
        <section class="field"><Label for="refund-reason" class="section-title">退款原因 <span aria-hidden="true">*</span></Label><Textarea id="refund-reason" v-model="form.reason" :disabled="!eligible || submitting || confirmationOpen" :aria-describedby="!eligible ? 'refund-unavailable' : undefined" maxlength="512" rows="5" placeholder="请说明退款原因，例如商品与描述不符" required /><small class="word-count">{{ form.reason.length }}/512</small></section>
        <section class="field"><h2 class="section-title">上传凭证 <small>可选，最多 6 张</small></h2><AftersaleEvidenceUploader :key="`${orderId}:${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`" v-model="form.evidenceImages" :max="6" :disabled="!eligible || submitting || confirmationOpen" @uploading="uploading = $event" /></section>
        <footer class="button-row actions"><button type="button" class="outline"  :disabled="submitting || confirmationOpen" @click="cancelCreate">取消</button><TooltipProvider><Tooltip><TooltipTrigger as-child><span :tabindex="submitDisabledReason ? 0 : undefined"><button type="button" class="primary" :disabled="!!submitDisabledReason" @click="submit(false)">{{ submitting ? '提交中…' : '提交仅退款申请' }}</button></span></TooltipTrigger><TooltipContent v-if="submitDisabledReason">{{ submitDisabledReason }}</TooltipContent></Tooltip></TooltipProvider></footer>
      </template>
      <div v-else-if="loading" class="skeletons"><Skeleton class="h-28" /><Skeleton class="h-52" /><Skeleton class="h-44" /></div>
      <EmptyState v-else :title="loadError || '订单不存在'" :action-text="loadError ? '重新加载' : '返回订单'" @action="loadError ? load() : router.push('/order')" />
    </div>
  </div>
</template>

<style scoped>
.refund-order { margin:20px 0; }.order-info { min-width:0; flex:1; }.order-info strong { overflow-wrap:anywhere; }
.meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; font-size:12px; color:var(--muted); }
.amount { font-size:20px; }.section-title { display:flex; gap:8px; align-items:center; font-weight:500; }
.word-count { text-align:right; color:var(--muted); }.notice { margin:18px 0; }.notice button { margin-top:10px; }
.actions { justify-content:flex-end; }.actions > span { flex:1; }.actions > span button { width:100%; }
.skeletons { display:grid; gap:18px; }
@media(max-width:700px) {
  .refund-order { flex-wrap:wrap; }
  .refund-order .amount { min-width:0; max-width:100%; overflow-wrap:anywhere; }
}
</style>
