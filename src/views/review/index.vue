<script setup lang="ts">
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BusinessPagination from '@/components/common/business-pagination.vue';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import * as reviewApi from '@/service/api/review';
import ReviewCard from '@/components/review/review-card.vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { sameBusinessId } from '@/utils/im';
import { resolvePageSize } from '@/service/api/page';
import { useReviewStore } from '@/stores/review';
import { isDefinitiveRejection } from '@/service/request/type';

type ReviewTab = 'sent' | 'received' | 'appeals';

const userStore = useUserStore();
const reviewStore = useReviewStore();
const route = useRoute();
const router = useRouter();
const activeKey = ref<ReviewTab>('sent');
const reviews = ref<Api.RealReview.ReviewDTO[]>([]);
const appeals = ref<Api.RealReview.ReviewAppealDTO[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(10);
const total = ref(0);
const status = ref<Api.RealReview.ReviewStatus>();
const hasImage = ref<boolean>();
const actionLoading = ref('');
const replyVisible = ref(false);
const appealVisible = ref(false);
const appealUploading = ref(false);
const replyTarget = ref<Api.RealReview.ReviewDTO>();
const appealTarget = ref<Api.RealReview.ReviewDTO>();
const notificationReview = ref<Api.RealReview.ReviewDTO>();
const notificationReviewError = ref('');
const replyContent = ref('');
const appealForm = reactive({ reason: '', evidenceImages: [] as string[] });
const requestGuard = createLatestRequestGuard();
const notificationRequestGuard = createLatestRequestGuard();
let writeVersion = 0;
let replyModalVersion = 0;
let appealModalVersion = 0;
watch(replyVisible, () => { replyModalVersion += 1; }, { flush: 'sync' });
watch(appealVisible, () => { appealModalVersion += 1; }, { flush: 'sync' });

const isBuyer = computed(() => !!userStore.currentUser?.isBuyer);
const isAppealTab = computed(() => activeKey.value === 'appeals');
let syncingQuery = false;

function syncFromQuery() {
  syncingQuery = true;
  const value = (key: string) => {
    const raw = route.query[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const tab = value('tab');
  const validTab = tab === 'sent' || (isBuyer.value && (tab === 'received' || tab === 'appeals'));
  activeKey.value = validTab ? tab : 'sent';
  const state = value('status') as Api.RealReview.ReviewStatus;
  const validStatus = ['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN'].includes(state);
  status.value = validStatus ? state : undefined;
  const imageQuery = value('hasImage');
  const validHasImage = imageQuery === 'true' || imageQuery === 'false';
  hasImage.value = imageQuery === 'true' ? true : imageQuery === 'false' ? false : undefined;
  const page = Number(value('page'));
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  syncingQuery = false;
  return (route.query.tab !== undefined && (Array.isArray(route.query.tab) || !validTab))
    || (route.query.status !== undefined && (Array.isArray(route.query.status) || !validStatus))
    || (route.query.hasImage !== undefined && (Array.isArray(route.query.hasImage) || !validHasImage))
    || (route.query.page !== undefined && (Array.isArray(route.query.page) || !Number.isSafeInteger(page) || page <= 0));
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  const query = { ...route.query, tab: activeKey.value === 'sent' ? undefined : activeKey.value,
    status: status.value, hasImage: hasImage.value === undefined ? undefined : String(hasImage.value),
    page: current.value > 1 ? String(current.value) : undefined };
  void (replace ? router.replace({ query }) : router.push({ query })).then(() => {
    if (route.fullPath === before) void load();
  });
}

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function resetAndLoad() {
  current.value = 1;
  syncQuery();
}

async function load() {
  const isCurrent = requestGuard.begin();
  if (!userStore.currentUser) {
    loading.value = false;
    reviews.value = [];
    appeals.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    if (isAppealTab.value) {
      const result = await reviewApi.fetchMyReviewAppeals({ pageNo: current.value, pageSize: pageSize.value }, { signal: isCurrent.signal });
      if (!isCurrent()) return;
      pageSize.value = resolvePageSize(result, pageSize.value);
      const maxPage = Math.max(1, Math.ceil(result.total / pageSize.value));
      if (current.value > maxPage) {
        current.value = maxPage;
        syncQuery(true);
        return;
      }
      appeals.value = result.records || [];
      total.value = result.total;
      return;
    }

    const params = {
      pageNo: current.value,
      pageSize: pageSize.value,
      status: status.value,
      hasImage: hasImage.value
    };
    const result = activeKey.value === 'sent'
      ? await reviewApi.fetchMyReviews(params, { signal: isCurrent.signal })
      : await reviewApi.fetchReceivedReviews(params, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    pageSize.value = resolvePageSize(result, pageSize.value);
    const maxPage = Math.max(1, Math.ceil(result.total / pageSize.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    reviews.value = result.records || [];
    if (activeKey.value === 'sent') reviews.value.forEach(reviewStore.confirmExisting);
    total.value = result.total;
  } catch {
    if (!isCurrent()) return;
    if (isAppealTab.value) appeals.value = [];
    else reviews.value = [];
    total.value = 0;
    loadError.value = isAppealTab.value ? '评价申诉加载失败，请稍后重试' : '评价列表加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadNotificationReview(id: string | number) {
  const isCurrent = notificationRequestGuard.begin();
  const requestedId = String(id);
  notificationReview.value = undefined;
  notificationReviewError.value = '';
  try {
    const next = await reviewApi.fetchReviewDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || String(route.query.id || '') !== requestedId) return;
    notificationReview.value = next;
  } catch {
    if (!isCurrent() || String(route.query.id || '') !== requestedId) return;
    notificationReviewError.value = '通知关联的评价详情加载失败，请稍后重试';
  }
}

function openReply(review: Api.RealReview.ReviewDTO) {
  replyModalVersion += 1;
  replyTarget.value = review;
  replyContent.value = '';
  replyVisible.value = true;
}

async function submitReply() {
  if (actionLoading.value) return;
  const content = replyContent.value.trim();
  if (!replyTarget.value || !content) {
    Message.warning('请输入回复内容');
    return;
  }
  if (content.length > 500) {
    Message.warning('回复内容不能超过 500 字');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  const reviewId = replyTarget.value.reviewId;
  const submittedModalVersion = replyModalVersion;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(replyTarget.value?.reviewId, reviewId);
  actionLoading.value = String(reviewId);
  try {
    await reviewApi.replyReview({ reviewId, content }, { showError: false });
    if (!isCurrentWrite()) return;
    if (submittedModalVersion === replyModalVersion) replyVisible.value = false;
    Message.success('评价回复已提交');
    await load();
  } catch (error) {
    if (!isCurrentWrite()) return;
    if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '评价回复未提交');
    else Message.warning('评价回复结果待核实，请重新读取原评价，勿直接重复提交');
  } finally {
    if (operation === writeVersion) actionLoading.value = '';
  }
}

function openAppeal(review: Api.RealReview.ReviewDTO) {
  appealModalVersion += 1;
  appealTarget.value = review;
  appealForm.reason = '';
  appealForm.evidenceImages = [];
  appealVisible.value = true;
}

async function submitAppeal() {
  if (actionLoading.value || appealUploading.value) return;
  const reason = appealForm.reason.trim();
  if (!appealTarget.value || !reason) {
    Message.warning('请输入申诉理由');
    return;
  }
  if (reason.length > 512) {
    Message.warning('申诉理由不能超过 512 字');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  const reviewId = appealTarget.value.reviewId;
  const submittedModalVersion = appealModalVersion;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(appealTarget.value?.reviewId, reviewId);
  actionLoading.value = String(reviewId);
  try {
    await reviewApi.createReviewAppeal({
      reviewId,
      reason,
      evidenceImages: [...appealForm.evidenceImages]
    }, { showError: false });
    if (!isCurrentWrite()) return;
    if (submittedModalVersion === appealModalVersion) appealVisible.value = false;
    Message.success('评价申诉已提交，请等待平台处理');
    await load();
  } catch (error) {
    if (!isCurrentWrite()) return;
    if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '评价申诉未提交');
    else Message.warning('评价申诉结果待核实，请先查看申诉记录，勿直接重复提交');
  } finally {
    if (operation === writeVersion) actionLoading.value = '';
  }
}

async function removeReview(review: Api.RealReview.ReviewDTO) {
  if (actionLoading.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const reviewId = review.reviewId;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  actionLoading.value = String(reviewId);
  try {
    await reviewApi.deleteReview(reviewId);
    if (!isCurrentWrite()) return;
    Message.success('评价已删除');
    if (reviews.value.length === 1 && current.value > 1) {
      current.value -= 1;
      syncQuery(true);
      return;
    }
    await load();
  } catch {
    if (isCurrentWrite()) Message.error('评价删除失败，请稍后重试');
  } finally {
    if (operation === writeVersion) actionLoading.value = '';
  }
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

watch(activeKey, () => {
  if (syncingQuery) return;
  writeVersion += 1;
  actionLoading.value = '';
  if (activeKey.value === 'received' && !isBuyer.value) activeKey.value = 'sent';
  resetAndLoad();
}, { flush: 'sync' });
watch([status, hasImage], () => {
  if (syncingQuery) return;
  writeVersion += 1;
  actionLoading.value = '';
  if (!isAppealTab.value) resetAndLoad();
}, { flush: 'sync' });
watch(isBuyer, value => {
  if (!value && activeKey.value !== 'sent') activeKey.value = 'sent';
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  actionLoading.value = '';
  requestGuard.invalidate();
  notificationRequestGuard.invalidate();
  reviews.value = [];
  appeals.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  notificationReview.value = undefined;
  notificationReviewError.value = '';
  replyVisible.value = false;
  appealVisible.value = false;
  replyTarget.value = undefined;
  appealTarget.value = undefined;
  syncQuery(true);
  const id = route.query.id;
  if (id) void loadNotificationReview(String(id));
});
watch(() => route.query.id, id => {
  notificationRequestGuard.invalidate();
  notificationReview.value = undefined;
  notificationReviewError.value = '';
  if (id) void loadNotificationReview(String(id));
}, { immediate: true });
onMounted(() => {
  if (syncFromQuery()) {
    syncQuery(true);
    return;
  }
  void load();
});
watch(() => route.fullPath, () => {
  if (syncFromQuery()) {
    syncQuery(true);
    return;
  }
  void load();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
  notificationRequestGuard.invalidate();
});


const statusOptions = [
  { value: 'all', label: '全部状态' }, { value: 'PENDING', label: '待审核' },
  { value: 'PUBLISHED', label: '已发布' }, { value: 'REJECTED', label: '已驳回' }, { value: 'HIDDEN', label: '已隐藏' }
];
const statusFilter = computed({
  get: () => status.value || 'all',
  set: (value: string) => {
    if (statusOptions.some(item => item.value === value)) status.value = value === 'all' ? undefined : value as Api.RealReview.ReviewStatus;
  }
});
const imageFilter = computed({
  get: () => hasImage.value === undefined ? 'all' : hasImage.value ? 'with' : 'without',
  set: (value: string) => {
    if (['all', 'with', 'without'].includes(value)) hasImage.value = value === 'all' ? undefined : value === 'with';
  }
});
function changeTab(value: string | number) {
  if (value === 'sent' || (isBuyer.value && (value === 'received' || value === 'appeals'))) activeKey.value = value;
}
const previewOpen = ref(false);
const previewImages = ref<string[]>([]);
const previewIndex = ref(0);
watch([() => route.fullPath, () => userStore.currentUser?.id], () => { previewOpen.value = false; previewImages.value = []; });
</script>

<template>
  <div class="review-list-page paper my-reviews-page">
    <h1>我的评价</h1>
    <Alert v-for="pending in reviewStore.pendingReviews" :key="String(pending.params.orderId)" class="notice"><AlertDescription>订单 {{ pending.params.orderId }} 的评价{{ pending.state === 'submitting' ? '正在提交' : '结果待核对' }}。原内容仅保留在当前登录会话，刷新或退出登录会清除快照。</AlertDescription><button type="button" class="outline"  @click="router.push({ name: 'review-write', params: { orderId: String(pending.params.orderId) } })">返回原评价</button></Alert>
    <div class="tabs" role="tablist" aria-label="评价视角"><button type="button" role="tab" :aria-selected="activeKey === 'sent'" :class="{ active:activeKey === 'sent' }" @click="changeTab('sent')">我发出的</button><button v-if="isBuyer" type="button" role="tab" :aria-selected="activeKey === 'received'" :class="{ active:activeKey === 'received' }" @click="changeTab('received')">我收到的（买手）</button><button v-if="isBuyer" type="button" role="tab" :aria-selected="activeKey === 'appeals'" :class="{ active:activeKey === 'appeals' }" @click="changeTab('appeals')">评价申诉</button></div>
    <div v-if="!isAppealTab" class="review-filters">
      <Select v-model="statusFilter"><SelectTrigger class="filter-select" aria-label="评价状态"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select>
      <Select v-model="imageFilter"><SelectTrigger class="filter-select" aria-label="评价图片筛选"><SelectValue placeholder="全部评价" /></SelectTrigger><SelectContent><SelectItem value="all">全部评价</SelectItem><SelectItem value="with">仅看带图</SelectItem><SelectItem value="without">仅看无图</SelectItem></SelectContent></Select>
      <small v-if="!loading">共 {{ total }} 条</small>
    </div>
    <section class="list-wrap" :aria-busy="loading" aria-label="评价列表">
      <Alert v-if="notificationReviewError" variant="destructive" class="notice"><AlertDescription>{{ notificationReviewError }}</AlertDescription><button type="button" class="outline"  @click="route.query.id && loadNotificationReview(String(route.query.id))">重新加载</button></Alert>
      <template v-else-if="notificationReview"><h2 class="notification-title">通知关联评价</h2><ReviewCard :review="notificationReview" audience="received" :action-loading="actionLoading" @reply="openReply" @appeal="openAppeal" /></template>
      <div v-if="loading && !(isAppealTab ? appeals.length : reviews.length)" class="skeletons"><Skeleton v-for="n in 3" :key="n" class="review-skeleton" /></div>
      <div v-else-if="!isAppealTab && reviews.length" class="reviews-grid my-reviews" :class="{ refreshing: loading }"><ReviewCard v-for="review in reviews" :key="review.reviewId" :review="review" :audience="activeKey === 'sent' ? 'sent' : 'received'" :action-loading="actionLoading" @reply="openReply" @appeal="openAppeal" @delete="removeReview" /></div>
      <div v-else-if="isAppealTab && appeals.length" :class="{ refreshing: loading }">
        <article v-for="appeal in appeals" :key="appeal.appealId" class="paper appeal-card"><header class="appeal-head"><div><h2>{{ appeal.productTitle || `评价申诉 #${appeal.reviewId}` }}</h2><small>提交于 {{ formatTime(appeal.appliedAt || appeal.createdAt) }}</small></div><span class="pill status" :class="appeal.status === 'APPROVED' ? 'green' : appeal.status === 'REJECTED' ? 'red' : 'orange'">{{ appeal.statusText || appeal.status }}</span></header><p class="appeal-reason">{{ appeal.reason }}</p><p v-if="appeal.reviewContent" class="appeal-review">原评价：{{ appeal.reviewContent }}</p><p v-if="appeal.handleRemark" class="appeal-result">处理说明：{{ appeal.handleRemark }}</p><div v-if="appeal.evidenceImages?.length" class="appeal-images"><button v-for="(url, index) in appeal.evidenceImages" :key="`${url}:${index}`" type="button" :aria-label="`预览申诉凭证 ${index + 1}`" @click="previewImages = [...(appeal.evidenceImages || [])]; previewIndex = index; previewOpen = true"><img :src="url" :alt="`申诉凭证 ${index + 1}`" @error="setImageFallback" /></button></div></article>
      </div>
      <EmptyState v-else :title="loadError || (isAppealTab ? '暂无评价申诉' : '暂无评价')" :description="loadError ? undefined : isAppealTab ? '买手可对收到的评价发起申诉' : activeKey === 'sent' ? '完成订单后可以评价买手' : '买手身份接单后会收到顾客评价'" :action-text="loadError ? '重新加载' : undefined" @action="loadError && load()" />
    </section>
    <BusinessPagination v-if="total > pageSize" :total="total" :current="current" :page-size="pageSize" :loading="loading" @change="changePage" />
    <AModal v-model:visible="replyVisible" title="回复评价" :width="560" :ok-loading="!!actionLoading" :on-before-ok="() => { void submitReply(); return false; }"><div class="dialog-field field"><Label for="review-reply">回复内容</Label><Textarea id="review-reply" v-model="replyContent" :disabled="!!actionLoading" maxlength="500" rows="5" placeholder="请输入回复内容" /><small class="word-count">{{ replyContent.length }}/500</small></div></AModal>
    <AModal v-model:visible="appealVisible" title="发起评价申诉" :width="600" :ok-loading="!!actionLoading" :mask-closable="!appealUploading" :esc-to-close="!appealUploading" :closable="!appealUploading" :ok-button-props="{ disabled: appealUploading }" :on-before-ok="() => { void submitAppeal(); return false; }"><div class="dialog-field field"><Label for="review-appeal">申诉理由 <span aria-hidden="true">*</span></Label><Textarea id="review-appeal" v-model="appealForm.reason" :disabled="!!actionLoading" maxlength="512" rows="5" placeholder="请说明申诉理由" required /><small class="word-count">{{ appealForm.reason.length }}/512</small></div><div class="dialog-field field"><span class="field-label">申诉凭证 <small>可选，最多 6 张</small></span><AftersaleEvidenceUploader v-model="appealForm.evidenceImages" scene="REVIEW" :max="6" :disabled="!!actionLoading" @uploading="appealUploading = $event" /></div></AModal>
    <ImagePreview v-model="previewOpen" :images="previewImages" :start-index="previewIndex" title="申诉凭证" />
  </div>
</template>

<style scoped>
.tabs { margin-top:20px; }.review-filters { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:20px 0; }.filter-select { width:180px; }.review-filters > small { margin-left:auto; color:var(--muted); }.notice { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:18px 0; }.notification-title { margin-bottom:14px; font-size:16px; }
.appeal-head { display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap; }.appeal-head h2 { font-size:20px; }.appeal-reason,.appeal-review,.appeal-result { margin-top:18px; white-space:pre-wrap; overflow-wrap:anywhere; }.appeal-review { padding:14px; border-radius:6px; background:var(--soft); }.appeal-images { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }.appeal-images button { border:1px solid var(--line); border-radius:6px; overflow:hidden; }.appeal-images img { width:80px; height:80px; object-fit:cover; }.dialog-field { margin-bottom:20px; }.word-count { text-align:right; }.skeletons { display:grid; gap:16px; }.review-skeleton { height:210px; }.refreshing { opacity:.65; }
</style>
