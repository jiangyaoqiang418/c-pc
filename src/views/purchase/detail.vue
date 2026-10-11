<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@iconify/vue';
import DescriptionList from '@/components/common/description-list.vue';
import ImagePreview from '@/components/common/image-preview.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { enums, formatAmount } from '@shared';
import PurchaseStatusTimeline from '@/components/purchase/purchase-status-timeline.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as purchaseApi from '@/service/api/purchase';
import { getAftersaleMeta } from '@/service/api/product';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { formatDateValue } from '@/utils/date-range';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const id = computed(() => String(route.params.id || ''));
const request = ref<Api.RealPurchase.Record>();
const loading = ref(false);
const loadError = ref('');
const progress = ref<Api.RealPurchase.Progress>();
const progressError = ref('');
const claiming = ref(false);
const canceling = ref(false);
const cancellationPending = ref(false);
const requestGuard = createLatestRequestGuard();
let claimWriteVersion = 0;
let cancelWriteVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
let disposed = false;

async function load() {
  if (disposed) return;
  const isCurrent = requestGuard.begin();
  const requestedId = id.value;
  const requestedUserId = userStore.currentUser?.id;
  loading.value = true;
  loadError.value = '';
  progress.value = undefined;
  progressError.value = '';
  try {
    const nextRequest = await purchaseApi.fetchPurchaseDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    request.value = nextRequest;
    if (sameBusinessId(nextRequest.customerId, requestedUserId)) {
      try {
        const result = await purchaseApi.fetchPurchaseProgress(requestedId, { signal: isCurrent.signal });
        if (isCurrent()) progress.value = result;
      } catch (error) {
        if (isCurrent()) progressError.value = error instanceof Error ? error.message : '求购进度读取失败';
      }
    }
  } catch {
    if (!isCurrent()) return;
    request.value = undefined;
    loadError.value = '求购详情加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(async () => {
  await userStore.init();
  if (disposed) return;
  await load();
});
onBeforeUnmount(() => {
  confirmationModal?.close();
  disposed = true;
  claimWriteVersion += 1;
  cancelWriteVersion += 1;
  requestGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (disposed) return;
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  confirmationModal?.close();
  claimWriteVersion += 1;
  cancelWriteVersion += 1;
  request.value = undefined;
  claiming.value = false;
  canceling.value = false;
  cancellationPending.value = false;
  void load();
});

const statusMeta = computed(() => (request.value ? enums.PURCHASE_STATUS_META[request.value.status] : undefined));
const aftersaleMeta = computed(() => (request.value ? getAftersaleMeta(request.value.aftersaleType) : undefined));

const isMyRequest = computed(() => userStore.currentUser?.id !== undefined && request.value?.customerId !== undefined
  && String(userStore.currentUser.id) === String(request.value.customerId));
const canCancel = computed(() => isMyRequest.value && !!request.value
  && ['pending_audit', 'pushing'].includes(request.value.status));
const canClaim = computed(() => {
  if (!userStore.currentUser || !request.value) return false;
  if (request.value.status !== 'pushing') return false;
  return userStore.isBuyerActive;
});

async function claim() {
  if (!request.value || !userStore.currentUser || !canClaim.value || loading.value || claiming.value) return;
  const requestedUserId = userStore.currentUser.id;
  const requestedRequestId = request.value.id;
  const operation = ++claimWriteVersion;
  const isCurrentWrite = () => operation === claimWriteVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(request.value?.id, requestedRequestId);
  claiming.value = true;
  try {
    const r = await purchaseApi.claimRequest(requestedRequestId);
    if (!isCurrentWrite()) return;
    if (r.ok) {
      Message.success('接单成功');
      await load();
    } else {
      Message.error(r.message || '接单失败');
    }
  } catch {
    // 请求层已展示错误，保留当前求购供用户重试。
  } finally {
    if (operation === claimWriteVersion) claiming.value = false;
  }
}

function cancel() {
  if (!request.value || !canCancel.value || loading.value || canceling.value || cancellationPending.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedRequestId = request.value.id;
  if (requestedUserId === undefined) return;
  const operation = ++cancelWriteVersion;
  const isCurrentWrite = () => operation === cancelWriteVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(request.value?.id, requestedRequestId);
  cancellationPending.value = true;
  confirmationModal = Modal.confirm({
    title: '撤销求购？',
    content: '撤销后不可恢复',
    okButtonProps: { status: 'danger' },
    onCancel() {
      if (!isCurrentWrite()) return;
      cancelWriteVersion += 1;
      cancellationPending.value = false;
    },
    async onOk() {
      if (!isCurrentWrite() || !canCancel.value || loading.value) {
        if (operation === cancelWriteVersion) cancellationPending.value = false;
        return;
      }
      canceling.value = true;
      try {
        const r = await purchaseApi.cancelPurchase(requestedRequestId);
        if (!isCurrentWrite()) return;
        if (r.ok) {
          Message.success('已撤销');
          await load();
        } else {
          Message.error(r.message || '撤销求购失败');
        }
      } catch {
        // 请求层已展示错误，保留当前求购供用户重试。
      } finally {
        if (operation === cancelWriteVersion) {
          canceling.value = false;
          cancellationPending.value = false;
        }
      }
    }
  });
}


const previewOpen = ref(false);
const previewIndex = ref(0);
function previewEvidence(index: number) {
  previewIndex.value = index;
  previewOpen.value = true;
}
watch([id, () => userStore.currentUser?.id], () => { previewOpen.value = false; });

</script>

<template>

  <div class="purchase-detail-page">
    <nav class="bread" aria-label="面包屑"><RouterLink to="/purchase/hall">求购大厅</RouterLink><span>/</span><span>{{ request?.code || '求购详情' }}</span></nav>
    <div v-if="loading" class="loading" aria-busy="true" aria-label="正在读取求购详情"><Skeleton class="hero-skeleton" /><Skeleton class="detail-skeleton" /></div>
    <template v-else-if="request">
      <section class="paper hero-card">
        <div class="hero-row"><div><span v-if="statusMeta" class="status-pill" :data-status="request.status">{{ statusMeta.label }}</span><h1>{{ request.productTitle }}</h1><p class="category">{{ request.categoryPath || '—' }}</p><small class="code">{{ request.code }}</small></div><div class="budget-block"><small>求购预算</small><strong>{{ formatAmount(request.budgetAmount) }} <span>USDT</span></strong></div></div>
        <div v-if="canClaim || canCancel" class="button-row"><Button v-if="canClaim" :disabled="claiming" @click="claim"><Icon v-if="claiming" icon="lucide:loader-circle" class="animate-spin" width="16" />{{ claiming ? '接单中…' : '我接此单' }}</Button><Button v-if="canCancel" variant="outline" class="danger" :disabled="canceling || cancellationPending" @click="cancel">{{ canceling || cancellationPending ? '正在撤销…' : '撤销求购' }}</Button></div>
      </section>
      <div v-if="request.status === 'rejected'" class="review-alert" role="alert"><Icon icon="lucide:circle-alert" width="20" /><div><strong>{{ request.reviewComment || '求购审核未通过' }}</strong><p>审核时间：{{ formatDateValue(request.reviewedAt) }}</p></div></div>
      <section class="paper"><h2>求购信息</h2><DescriptionList :columns="2" :items="[
        { label: '期望发货', value: request.expectedDays + ' 天内' },
        { label: '接单截止', value: formatDateValue(request.claimExpiresAt) },
        { label: '海外过关', value: request.overseasCustoms ? '是' : '否' },
        { label: '售后类型', value: aftersaleMeta?.label || '—' },
        { label: '审核时间', value: formatDateValue(request.reviewedAt) },
        { label: '创建时间', value: formatDateValue(request.createdAt) }
      ]" /><div class="section-divider" /><h3>商品描述</h3><p class="description">{{ request.productDescription || '—' }}</p><h3>求购说明</h3><p class="description">{{ request.appeal || '—' }}</p><div v-if="request.evidenceUrls?.length" class="evidence"><button v-for="(url, index) in request.evidenceUrls" :key="url" type="button" :aria-label="`查看求购参考图片 ${index + 1}`" @click="previewEvidence(index)"><img :src="url" :alt="`求购参考图片 ${index + 1}`" /></button></div></section>
      <section class="paper progress-card"><h2>求购进度</h2><div v-if="progressError" class="notice" role="alert"><span>{{ progressError }}</span><Button variant="outline" size="sm" @click="load">重新加载</Button></div><template v-else-if="progress"><PurchaseStatusTimeline :request="request" :progress="progress" /><div class="progress-summary"><p>推送 {{ progress.pushBatchCount }} 批 · 累计触达 {{ progress.reachedBuyerCount }} 位买手</p><p>最近推送：{{ formatDateValue(progress.lastPushedAt ?? undefined) }}</p></div></template><p v-else class="muted">{{ isMyRequest ? '正在读取处理进度' : '处理进度仅求购发起人可查看' }}</p>
        <template v-if="request.status === 'claimed'"><div class="section-divider" /><h3>接单信息</h3><p class="claimed"><Icon icon="lucide:check-circle" width="18" />已被 {{ request.claimedByName }} 接单<span v-if="request.assignedBy">· 后台指派</span></p><p v-if="request.relatedOrderCode" class="code">关联订单 {{ request.relatedOrderCode }}</p><div v-if="isMyRequest && request.relatedOrderId" class="button-row"><Button @click="router.push({ name: 'order-detail', params: { id: String(request.relatedOrderId) } })">查看关联订单<Icon icon="lucide:arrow-right" width="16" /></Button></div></template>
      </section>
      <ImagePreview v-model="previewOpen" :images="request.evidenceUrls || []" :start-index="previewIndex" />
    </template>
    <EmptyState v-else :title="loadError || '求购不存在'" :description="loadError ? '不会展示不完整的求购数据。' : undefined" :action-text="loadError ? '重新加载' : '返回大厅'" @action="loadError ? load() : router.push('/purchase/hall')" />
  </div>

</template>

<style scoped>

.purchase-detail-page { max-width:800px; margin:0 auto; padding-bottom:32px; }.bread { display:flex; gap:12px; font-size:13px; color:var(--yb-muted); margin:0 0 20px; overflow-wrap:anywhere; }.bread a { color:var(--yb-muted); text-decoration:none; }.bread a:hover { color:var(--yb-brand-primary); }.paper { border:1px solid var(--yb-hairline); border-radius:20px; padding:28px 32px; margin-bottom:20px; background:var(--yb-surface); }.hero-row { display:flex; align-items:center; justify-content:space-between; gap:32px; }.hero-row>div:first-child { min-width:0; }.hero-card h1 { font-size:26px; font-weight:650; line-height:1.4; margin:12px 0 8px; overflow-wrap:anywhere; }.category { font-size:13px; color:var(--yb-muted); margin:0 0 4px; overflow-wrap:anywhere; }.code { font-size:12px; font-family:var(--yb-font-mono); color:var(--yb-muted); overflow-wrap:anywhere; }.status-pill { display:inline-flex; font-size:12px; padding:4px 12px; border-radius:999px; background:var(--yb-primary-soft); color:var(--yb-brand-primary); }.status-pill[data-status='rejected'] { background:var(--yb-danger-soft); color:var(--yb-danger); }.status-pill[data-status='claimed'] { background:var(--yb-success-soft); color:var(--yb-success); }.status-pill[data-status='cancelled'] { background:var(--yb-fill); color:var(--yb-muted); }.budget-block { flex:none; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }.budget-block>small { color:var(--yb-muted); font-size:12px; }.budget-block strong { font-size:28px; font-weight:600; font-family:var(--yb-font-mono); color:var(--yb-brand-primary); }.budget-block strong span { font-size:12px; font-weight:400; }.button-row { display:flex; gap:16px; justify-content:flex-end; margin-top:22px; }.danger { color:var(--yb-danger); }.danger:hover { background:var(--yb-danger-soft); }.paper h2 { font-size:22px; font-weight:600; margin:0 0 22px; }.paper h3 { font-size:16px; font-weight:600; margin:22px 0 10px; }.section-divider { height:1px; margin:24px 0; background:var(--yb-hairline); }.description { white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; color:var(--yb-ink-2); margin:0; line-height:1.8; }.evidence { display:flex; flex-wrap:wrap; gap:12px; margin-top:20px; }.evidence button { width:104px; height:104px; border:1px solid var(--yb-hairline); padding:0; overflow:hidden; border-radius:12px; background:var(--yb-fill); cursor:zoom-in; }.evidence img { width:100%; height:100%; object-fit:cover; transition:transform .2s; }.evidence button:hover img { transform:scale(1.03); }.review-alert { display:flex; gap:14px; padding:20px 24px; border-radius:16px; margin-bottom:20px; background:var(--yb-danger-soft); color:var(--yb-danger); font-size:14px; }.review-alert p { font-size:12px; margin:6px 0 0; }.notice { display:flex; align-items:center; gap:16px; padding:16px; border-radius:12px; background:var(--yb-primary-soft); font-size:13px; }.notice span { flex:1; }.progress-summary { padding-top:18px; border-top:1px solid var(--yb-hairline); }.progress-summary p,.muted { font-size:13px; color:var(--yb-muted); }.claimed { display:flex; align-items:center; gap:8px; color:var(--yb-success); font-size:14px; flex-wrap:wrap; overflow-wrap:anywhere; }.hero-skeleton { height:190px; border-radius:20px; margin-bottom:20px; }.detail-skeleton { height:400px; border-radius:20px; }@media(prefers-reduced-motion:reduce) { .evidence img { transition:none; }.evidence button:hover img { transform:none; } }

</style>
