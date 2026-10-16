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
import { useReviewStore, type ReviewAction, type UncertainReviewAction } from '@/stores/review';
import { isDefinitiveRejection, RequestError } from '@/service/request/type';

type ReviewTab = 'sent' | 'received' | 'appeals';
type UncertainAction = UncertainReviewAction;

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
const uncertainActions = reviewStore.pendingActions;
function actionKey(id: string | number, kind: ReviewAction) { return JSON.stringify([String(id), kind]); }
function uncertainAction(review: Api.RealReview.ReviewDTO | undefined, kind: ReviewAction) { return review && uncertainActions.get(actionKey(review.reviewId, kind)); }
const pendingReply = computed(() => uncertainAction(replyTarget.value, 'reply'));
const pendingAppeal = computed(() => uncertainAction(appealTarget.value, 'appeal'));
const requestGuard = createLatestRequestGuard();
const notificationRequestGuard = createLatestRequestGuard();
let writeVersion = 0;
let replyModalVersion = 0;
let appealModalVersion = 0;
watch(replyVisible, () => { replyModalVersion += 1; }, { flush: 'sync' });
watch(appealVisible, () => { appealModalVersion += 1; }, { flush: 'sync' });

const isBuyer = computed(() => !!userStore.currentUser?.isBuyer);
const isAppealTab = computed(() => activeKey.value === 'appeals');
function reviewAudience(review?: Api.RealReview.ReviewDTO): 'sent' | 'received' | undefined {
  const userId = userStore.currentUser?.id;
  if (!review || userId === undefined) return;
  if (sameBusinessId(review.userId, userId)) return 'sent';
  if (isBuyer.value && sameBusinessId(review.sellerId, userId)) return 'received';
  // 私有分页已由端点限定本人视角；通知详情缺少归属时只读展示。
  if (reviews.value.includes(review)) return activeKey.value === 'sent' ? 'sent' : activeKey.value === 'received' && isBuyer.value ? 'received' : undefined;
}
const notificationAudience = computed(() => reviewAudience(notificationReview.value));
let syncingQuery = false;

function resetActions() {
  writeVersion += 1;
  actionLoading.value = '';
  replyVisible.value = false;
  appealVisible.value = false;
  replyTarget.value = undefined;
  appealTarget.value = undefined;
  replyContent.value = '';
  appealForm.reason = '';
  appealForm.evidenceImages = [];
  appealUploading.value = false;
}

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
  const userId = userStore.currentUser?.id;
  const session = userStore.sessionVersion;
  const matchesContext = () => isCurrent() && session === userStore.sessionVersion && sameBusinessId(userStore.currentUser?.id, userId);
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
      if (!matchesContext()) return;
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
    if (!matchesContext()) return;
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
    if (!matchesContext()) return;
    if (isAppealTab.value) appeals.value = [];
    else reviews.value = [];
    total.value = 0;
    loadError.value = isAppealTab.value ? '评价申诉加载失败，请稍后重试' : '评价列表加载失败，请稍后重试';
  } finally {
    if (matchesContext()) loading.value = false;
  }
}

async function loadNotificationReview(id: string | number) {
  const isCurrent = notificationRequestGuard.begin();
  const requestedId = String(id);
  const userId = userStore.currentUser?.id;
  const session = userStore.sessionVersion;
  const matchesContext = () => isCurrent() && session === userStore.sessionVersion && sameBusinessId(userStore.currentUser?.id, userId) && String(route.query.id || '') === requestedId;
  notificationReview.value = undefined;
  notificationReviewError.value = '';
  if (userId === undefined) return;
  try {
    const next = await reviewApi.fetchReviewDetail(requestedId, { signal: isCurrent.signal });
    if (!matchesContext()) return;
    if (!sameBusinessId(next.reviewId, requestedId)) throw new Error('关联评价不匹配');
    notificationReview.value = next;
  } catch {
    if (!matchesContext()) return;
    notificationReviewError.value = '通知关联的评价详情加载失败，请稍后重试';
  }
}

function openReply(review: Api.RealReview.ReviewDTO) {
  const pending = uncertainAction(review, 'reply');
  if (loading.value || actionLoading.value || reviewAudience(review) !== 'received' && !pending) return;
  replyModalVersion += 1;
  replyTarget.value = review;
  replyContent.value = pending?.content || '';
  replyVisible.value = true;
}

function openAppeal(review: Api.RealReview.ReviewDTO) {
  const pending = uncertainAction(review, 'appeal');
  if (loading.value || actionLoading.value || reviewAudience(review) !== 'received' && !pending) return;
  appealModalVersion += 1;
  appealTarget.value = review;
  appealForm.reason = pending?.reason || '';
  appealForm.evidenceImages = [...(pending?.evidenceImages || [])];
  appealVisible.value = true;
}

function updateKnownReview(detail: Api.RealReview.ReviewDTO) {
  for (const row of [...reviews.value, notificationReview.value, replyTarget.value, appealTarget.value]) {
    if (row && sameBusinessId(row.reviewId, detail.reviewId)) Object.assign(row, detail);
  }
}

async function readActionReview(pending: UncertainAction, userId: string | number, isCurrent: () => boolean) {
  const detail = await reviewApi.fetchReviewDetail(pending.review.reviewId, { showError:false });
  if (!isCurrent()) throw new RequestError('会话或页面已切换，请重新核对', { code:'SESSION_CHANGED' });
  if (!sameBusinessId(detail.reviewId, pending.review.reviewId) || !sameBusinessId(detail.orderId, pending.review.orderId)
    || !sameBusinessId(pending.kind === 'delete' ? detail.userId : detail.sellerId, userId)) {
    throw new Error('评价归属回读不一致，原操作保持待核实');
  }
  updateKnownReview(detail);
  return detail;
}

async function finishAction(pending: UncertainAction, message: string, modalVersion?: number) {
  uncertainActions.delete(actionKey(pending.review.reviewId, pending.kind));
  if (pending.kind === 'reply' && modalVersion === replyModalVersion) replyVisible.value = false;
  if (pending.kind === 'appeal' && modalVersion === appealModalVersion) appealVisible.value = false;
  Message.success(message);
  await load();
}

async function submitReply() {
  const target = replyTarget.value;
  const previous = uncertainAction(target, 'reply');
  if (!target || actionLoading.value || loading.value || reviewAudience(target) !== 'received' && !previous) return;
  const content = previous?.content ?? replyContent.value.trim();
  if (!content || content.length > 500) { Message.warning('请输入 1–500 字回复内容'); return; }
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  const session = userStore.sessionVersion;
  const operation = ++writeVersion;
  const modalVersion = replyModalVersion;
  const isCurrent = () => operation === writeVersion && session === userStore.sessionVersion && sameBusinessId(userStore.currentUser?.id, userId);
  const pending: UncertainAction = previous || reactive({ kind:'reply', review:{...target}, content, phase:'unknown', note:'' });
  let wrote = false;
  let acknowledged = false;
  actionLoading.value = String(target.reviewId);
  try {
    const detail = await readActionReview(pending, userId, isCurrent);
    if (!isCurrent()) return;
    if (detail.replyContent) {
      if (detail.replyContent.trim() === content) { await finishAction(pending, '已核对原回复，内容一致', modalVersion); return; }
      pending.phase = 'existing';
      pending.note = '该评价已有其他回复，当前回复未确认为成功；不会重复提交。';
      uncertainActions.set(actionKey(target.reviewId, 'reply'), pending);
      Message.warning(pending.note);
      return;
    }
    if (detail.repliedAt != null || detail.status !== 'PUBLISHED') throw new Error('原评价状态不允许回复，原操作仍需核实');
    if (previous && previous.phase !== 'ready') {
      pending.phase = 'ready';
      pending.note = '已核对原评价当前暂无回复；再次确认仅会重试原回复内容。';
      Message.info(pending.note);
      return;
    }
    pending.phase = 'unknown';
    pending.note = '回复结果待核实，请先核对原回复；原内容保持保留。';
    uncertainActions.set(actionKey(target.reviewId, 'reply'), pending);
    wrote = true;
    const receipt = await reviewApi.replyReview({ reviewId:target.reviewId, content }, { showError:false });
    acknowledged = true;
    if (!isCurrent()) return;
    if (!sameBusinessId(receipt, target.reviewId)) throw new Error('回复回执不匹配，请核对原评价');
    const after = await readActionReview(pending, userId, isCurrent);
    if (!isCurrent()) return;
    if (!after.replyContent || after.replyContent.trim() !== content) throw new Error('尚未读到原回复内容，请继续核对');
    await finishAction(pending, '评价回复已提交并核对', modalVersion);
  } catch (error) {
    if (!isCurrent()) return;
    if (wrote && !acknowledged && !previous && isDefinitiveRejection(error)) {
      uncertainActions.delete(actionKey(target.reviewId, 'reply'));
      Message.error(error instanceof Error ? error.message : '评价回复未提交');
    } else {
      if (previous || wrote) {
        pending.phase = 'unknown';
        pending.note = '回复结果仍待核实。重试会先读取原评价，不会直接重发。';
        uncertainActions.set(actionKey(target.reviewId, 'reply'), pending);
      }
      Message.warning(error instanceof Error ? error.message : '原回复尚未核实，请稍后重试读取');
    }
  } finally { if (operation === writeVersion) actionLoading.value = ''; }
}

async function submitAppeal() {
  const target = appealTarget.value;
  const previous = uncertainAction(target, 'appeal');
  if (!target || actionLoading.value || loading.value || appealUploading.value || reviewAudience(target) !== 'received' && !previous) return;
  const reason = previous?.reason ?? appealForm.reason.trim();
  if (!reason || reason.length > 512) { Message.warning('请输入 1–512 字申诉理由'); return; }
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  const session = userStore.sessionVersion;
  const operation = ++writeVersion;
  const modalVersion = appealModalVersion;
  const isCurrent = () => operation === writeVersion && session === userStore.sessionVersion && sameBusinessId(userStore.currentUser?.id, userId);
  const pending: UncertainAction = previous || reactive({ kind:'appeal', review:{...target}, reason, evidenceImages:[...appealForm.evidenceImages], phase:'unknown', note:'' });
  let wrote = false;
  let acknowledged = false;
  actionLoading.value = String(target.reviewId);
  try {
    const detail = await readActionReview(pending, userId, isCurrent);
    if (!isCurrent()) return;
    if (detail.appealId != null) {
      if (pending.receipt !== undefined && sameBusinessId(detail.appealId, pending.receipt)) {
        await finishAction(pending, '已核对原申诉记录', modalVersion); return;
      }
      pending.phase = 'existing';
      pending.note = '该评价已有关联申诉，请在评价申诉记录核对；不能据此认定本次内容成功，也不会重建申诉。';
      uncertainActions.set(actionKey(target.reviewId, 'appeal'), pending);
      Message.warning(pending.note);
      return;
    }
    if (detail.appealStatus != null || !['PUBLISHED', 'HIDDEN'].includes(detail.status)) throw new Error('原评价状态不允许发起申诉，原操作仍需核实');
    if (previous && previous.phase !== 'ready') {
      pending.phase = 'ready';
      pending.note = '已核对原评价当前无关联申诉；再次确认仅会重试原理由和凭证。';
      Message.info(pending.note);
      return;
    }
    pending.phase = 'unknown';
    pending.note = '申诉结果待核实，原理由和凭证保持保留。';
    uncertainActions.set(actionKey(target.reviewId, 'appeal'), pending);
    wrote = true;
    const receipt = await reviewApi.createReviewAppeal({ reviewId:target.reviewId, reason, evidenceImages:[...(pending.evidenceImages || [])] }, { showError:false });
    acknowledged = true;
    if (!isCurrent()) return;
    if (!(typeof receipt === 'string' && receipt.trim() || typeof receipt === 'number' && Number.isSafeInteger(receipt))) throw new Error('申诉回执缺失，请核对原评价');
    pending.receipt = receipt;
    const after = await readActionReview(pending, userId, isCurrent);
    if (!isCurrent()) return;
    if (!sameBusinessId(after.appealId, receipt)) throw new Error('尚未读到原申诉记录，请继续核对');
    await finishAction(pending, '评价申诉已提交并核对', modalVersion);
  } catch (error) {
    if (!isCurrent()) return;
    if (wrote && !acknowledged && !previous && isDefinitiveRejection(error)) {
      uncertainActions.delete(actionKey(target.reviewId, 'appeal'));
      Message.error(error instanceof Error ? error.message : '评价申诉未提交');
    } else {
      if (previous || wrote) {
        pending.phase = 'unknown';
        pending.note = '申诉结果仍待核实。重试会先读取原评价，不会直接重建。';
        uncertainActions.set(actionKey(target.reviewId, 'appeal'), pending);
      }
      Message.warning(error instanceof Error ? error.message : '原申诉尚未核实，请稍后重试读取');
    }
  } finally { if (operation === writeVersion) actionLoading.value = ''; }
}

/** 仅在核实删除结果时扫描未过滤的本人分页；上限 20 页/1000 条，未读完绝不判为缺失。 */
async function findVisibleOwnReview(pending: UncertainAction, userId: string | number, isCurrent: () => boolean) {
  let expectedTotal: number | undefined;
  let size = 50;
  const seen = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const result = await reviewApi.fetchMyReviews({ pageNo:page, pageSize:size }, { showError:false });
    if (!isCurrent()) throw new RequestError('会话或页面已切换，请重新核对', { code:'SESSION_CHANGED' });
    const total = result.total;
    if (!Number.isSafeInteger(total) || total < 0 || total > 1000 || expectedTotal !== undefined && expectedTotal !== total) throw new Error('本人评价数量变化或超过核对范围，删除结果仍待核实');
    expectedTotal = total;
    const actualSize = resolvePageSize(result, size);
    if (page > 1 && actualSize !== size) throw new Error('本人评价分页已变化，删除结果仍待核实');
    size = actualSize;
    if (!Array.isArray(result.records) || result.records.length !== Math.min(size, Math.max(0, total - (page - 1) * size))) throw new Error('本人评价分页未完整读回，删除结果仍待核实');
    for (const row of result.records) {
      if (!(typeof row.reviewId === 'string' && row.reviewId.trim() || typeof row.reviewId === 'number' && Number.isSafeInteger(row.reviewId))) throw new Error('本人评价编号不完整，删除结果仍待核实');
      const key = String(row.reviewId);
      if (!key || seen.has(key)) throw new Error('本人评价分页已变化，删除结果仍待核实');
      seen.add(key);
      if (sameBusinessId(row.reviewId, pending.review.reviewId)) {
        if (!sameBusinessId(row.userId, userId) || !sameBusinessId(row.orderId, pending.review.orderId)) throw new Error('原评价归属不一致，删除结果仍待核实');
        return row;
      }
    }
    if (seen.size === total) return undefined;
  }
  throw new Error('本人评价尚未完整核对，删除结果仍待核实');
}

async function removeReview(review: Api.RealReview.ReviewDTO, checkOnly = false) {
  const previous = uncertainAction(review, 'delete');
  if (actionLoading.value || loading.value || reviewAudience(review) !== 'sent' && !previous) return;
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  const session = userStore.sessionVersion;
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && session === userStore.sessionVersion && sameBusinessId(userStore.currentUser?.id, userId);
  const pending: UncertainAction = previous || reactive({ kind:'delete', review:{...review}, phase:'unknown', note:'' });
  let wrote = false;
  let acknowledged = false;
  actionLoading.value = String(review.reviewId);
  try {
    if (previous) {
      const existing = await findVisibleOwnReview(pending, userId, isCurrent);
      if (!isCurrent()) return;
      if (!existing) { await finishAction(pending, '已核对，该评价已不在我的评价中'); return; }
      if (checkOnly || previous.phase !== 'ready') {
        pending.phase = 'ready';
        pending.note = '已核对原评价仍在我的评价中；如需继续，请在原评价再次明确确认删除。';
        Message.info(pending.note);
        return;
      }
    }
    pending.phase = 'unknown';
    pending.note = '删除结果待核实，请先读取原评价，勿直接重复删除。';
    uncertainActions.set(actionKey(review.reviewId, 'delete'), pending);
    wrote = true;
    const receipt = await reviewApi.deleteReview(review.reviewId);
    acknowledged = true;
    if (!isCurrent()) return;
    if (!sameBusinessId(receipt, review.reviewId)) throw new Error('删除回执不匹配，请核对原评价');
    const existing = await findVisibleOwnReview(pending, userId, isCurrent);
    if (!isCurrent()) return;
    if (existing) throw new Error('原评价仍可见，删除结果需要继续核对');
    await finishAction(pending, '评价已删除并核对');
  } catch (error) {
    if (!isCurrent()) return;
    if (wrote && !acknowledged && !previous && isDefinitiveRejection(error)) {
      uncertainActions.delete(actionKey(review.reviewId, 'delete'));
      Message.error(error instanceof Error ? error.message : '评价未删除');
    } else {
      if (previous || wrote) {
        pending.phase = 'unknown';
        pending.note = '删除结果仍待核实；重试只先读取本人未过滤评价，不会直接重发。';
        uncertainActions.set(actionKey(review.reviewId, 'delete'), pending);
      }
      Message.warning(error instanceof Error ? error.message : '删除结果待核实，请先核对');
    }
  } finally { if (operation === writeVersion) actionLoading.value = ''; }
}

function recoverAction(pending: UncertainAction) {
  if (actionLoading.value || loading.value) return;
  if (pending.kind === 'reply') openReply(pending.review);
  else if (pending.kind === 'appeal') openAppeal(pending.review);
  else void removeReview(pending.review, true);
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

watch(activeKey, () => {
  if (syncingQuery) return;
  resetActions();
  if (activeKey.value === 'received' && !isBuyer.value) activeKey.value = 'sent';
  resetAndLoad();
}, { flush: 'sync' });
watch([status, hasImage], () => {
  if (syncingQuery) return;
  resetActions();
  if (!isAppealTab.value) resetAndLoad();
}, { flush: 'sync' });
watch(isBuyer, value => {
  if (!value && activeKey.value !== 'sent') activeKey.value = 'sent';
});
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  resetActions();
  uncertainActions.clear();
  requestGuard.invalidate();
  notificationRequestGuard.invalidate();
  reviews.value = [];
  appeals.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  notificationReview.value = undefined;
  notificationReviewError.value = '';
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
  resetActions();
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
watch([() => route.fullPath, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => { previewOpen.value = false; previewImages.value = []; });
</script>

<template>
  <div class="review-list-page paper my-reviews-page">
    <h1>我的评价</h1>
    <Alert v-for="pending in reviewStore.pendingReviews" :key="String(pending.params.orderId)" class="notice"><AlertDescription>订单 {{ pending.params.orderId }} 的评价{{ pending.state === 'submitting' ? '正在提交' : '结果待核对' }}。原内容仅保留在当前登录会话，刷新或退出登录会清除快照。</AlertDescription><button type="button" class="outline"  @click="router.push({ name: 'review-write', params: { orderId: String(pending.params.orderId) } })">返回原评价</button></Alert>
    <Alert v-for="pending in uncertainActions.values()" :key="actionKey(pending.review.reviewId, pending.kind)" class="notice"><AlertDescription>评价 {{ pending.review.reviewId }}：{{ pending.note }} 原内容仅保留在当前登录会话，刷新或退出登录会清除快照。</AlertDescription><button type="button" class="outline" :disabled="!!actionLoading || loading" @click="recoverAction(pending)">核对原操作</button></Alert>
    <div class="tabs" role="tablist" aria-label="评价视角"><button type="button" role="tab" :aria-selected="activeKey === 'sent'" :class="{ active:activeKey === 'sent' }" @click="changeTab('sent')">我发出的</button><button v-if="isBuyer" type="button" role="tab" :aria-selected="activeKey === 'received'" :class="{ active:activeKey === 'received' }" @click="changeTab('received')">我收到的（买手）</button><button v-if="isBuyer" type="button" role="tab" :aria-selected="activeKey === 'appeals'" :class="{ active:activeKey === 'appeals' }" @click="changeTab('appeals')">评价申诉</button></div>
    <div v-if="!isAppealTab" class="review-filters">
      <Select v-model="statusFilter"><SelectTrigger class="filter-select" aria-label="评价状态"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select>
      <Select v-model="imageFilter"><SelectTrigger class="filter-select" aria-label="评价图片筛选"><SelectValue placeholder="全部评价" /></SelectTrigger><SelectContent><SelectItem value="all">全部评价</SelectItem><SelectItem value="with">仅看带图</SelectItem><SelectItem value="without">仅看无图</SelectItem></SelectContent></Select>
      <small v-if="!loading">共 {{ total }} 条</small>
    </div>
    <section class="list-wrap" :aria-busy="loading" aria-label="评价列表">
      <Alert v-if="notificationReviewError" variant="destructive" class="notice"><AlertDescription>{{ notificationReviewError }}</AlertDescription><button type="button" class="outline"  @click="route.query.id && loadNotificationReview(String(route.query.id))">重新加载</button></Alert>
      <template v-else-if="notificationReview"><h2 class="notification-title">通知关联评价</h2><ReviewCard :review="notificationReview" :audience="notificationAudience || 'sent'" :readonly="notificationAudience !== 'received'" :action-loading="loading ? 'loading' : actionLoading" @reply="openReply" @appeal="openAppeal" /></template>
      <div v-if="loading && !(isAppealTab ? appeals.length : reviews.length)" class="skeletons"><Skeleton v-for="n in 3" :key="n" class="review-skeleton" /></div>
      <div v-else-if="!isAppealTab && reviews.length" class="reviews-grid my-reviews" :class="{ refreshing: loading }"><ReviewCard v-for="review in reviews" :key="review.reviewId" :review="review" :audience="activeKey === 'sent' ? 'sent' : 'received'" :action-loading="loading ? 'loading' : actionLoading" :delete-mode="uncertainAction(review, 'delete')?.phase === 'ready' ? 'ready' : uncertainAction(review, 'delete') ? 'unknown' : undefined" @reply="openReply" @appeal="openAppeal" @delete="removeReview" /></div>
      <div v-else-if="isAppealTab && appeals.length" :class="{ refreshing: loading }">
        <article v-for="appeal in appeals" :key="appeal.appealId" class="paper appeal-card"><header class="appeal-head"><div><h2>{{ appeal.productTitle || `评价申诉 #${appeal.reviewId}` }}</h2><small>提交于 {{ formatTime(appeal.appliedAt || appeal.createdAt) }}</small></div><span class="pill status" :class="appeal.status === 'APPROVED' ? 'green' : appeal.status === 'REJECTED' ? 'red' : 'orange'">{{ appeal.statusText || appeal.status }}</span></header><p class="appeal-reason">{{ appeal.reason }}</p><p v-if="appeal.reviewContent" class="appeal-review">原评价：{{ appeal.reviewContent }}</p><p v-if="appeal.handleRemark" class="appeal-result">处理说明：{{ appeal.handleRemark }}</p><div v-if="appeal.evidenceImages?.length" class="appeal-images"><button v-for="(url, index) in appeal.evidenceImages" :key="`${url}:${index}`" type="button" :aria-label="`预览申诉凭证 ${index + 1}`" @click="previewImages = [...(appeal.evidenceImages || [])]; previewIndex = index; previewOpen = true"><img :src="url" :alt="`申诉凭证 ${index + 1}`" @error="setImageFallback" /></button></div></article>
      </div>
      <EmptyState v-else :title="loadError || (isAppealTab ? '暂无评价申诉' : '暂无评价')" :description="loadError ? undefined : isAppealTab ? '买手可对收到的评价发起申诉' : activeKey === 'sent' ? '完成订单后可以评价买手' : '买手身份接单后会收到顾客评价'" :action-text="loadError ? '重新加载' : undefined" @action="loadError && load()" />
    </section>
    <BusinessPagination v-if="total > pageSize" :total="total" :current="current" :page-size="pageSize" :loading="loading" @change="changePage" />
    <AModal v-model:visible="replyVisible" title="回复评价" :width="560" :ok-text="pendingReply?.phase === 'ready' ? '确认重试原回复' : pendingReply ? '核对原回复' : '确认回复'" :ok-loading="!!actionLoading" :on-before-ok="() => { void submitReply(); return false; }"><Alert v-if="pendingReply" class="notice"><AlertDescription>{{ pendingReply.note }}</AlertDescription></Alert><div class="dialog-field field"><Label for="review-reply">回复内容</Label><Textarea id="review-reply" v-model="replyContent" :disabled="!!actionLoading || !!pendingReply" maxlength="500" rows="5" placeholder="请输入回复内容" /><small class="word-count">{{ replyContent.length }}/500</small></div></AModal>
    <AModal v-model:visible="appealVisible" title="发起评价申诉" :width="600" :ok-text="pendingAppeal?.phase === 'ready' ? '确认重试原申诉' : pendingAppeal ? '核对原申诉' : '确认申诉'" :ok-loading="!!actionLoading" :mask-closable="!appealUploading" :esc-to-close="!appealUploading" :closable="!appealUploading" :ok-button-props="{ disabled: appealUploading }" :on-before-ok="() => { void submitAppeal(); return false; }"><Alert v-if="pendingAppeal" class="notice"><AlertDescription>{{ pendingAppeal.note }}</AlertDescription></Alert><div class="dialog-field field"><Label for="review-appeal">申诉理由 <span aria-hidden="true">*</span></Label><Textarea id="review-appeal" v-model="appealForm.reason" :disabled="!!actionLoading || !!pendingAppeal" maxlength="512" rows="5" placeholder="请说明申诉理由" required /><small class="word-count">{{ appealForm.reason.length }}/512</small></div><div class="dialog-field field"><span class="field-label">申诉凭证 <small>可选，最多 6 张</small></span><AftersaleEvidenceUploader :key="`${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${appealModalVersion}`" v-model="appealForm.evidenceImages" scene="REVIEW" :max="6" :disabled="!!actionLoading || !!pendingAppeal || !appealVisible" @uploading="appealUploading = $event" /></div></AModal>
    <ImagePreview v-model="previewOpen" :images="previewImages" :start-index="previewIndex" title="申诉凭证" />
  </div>
</template>

<style scoped>
.tabs { margin-top:20px; }.review-filters { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:20px 0; }.filter-select { width:180px; }.review-filters > small { margin-left:auto; color:var(--muted); }.notice { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:18px 0; }.notification-title { margin-bottom:14px; font-size:16px; }
.appeal-head { display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap; }.appeal-head h2 { font-size:20px; }.appeal-reason,.appeal-review,.appeal-result { margin-top:18px; white-space:pre-wrap; overflow-wrap:anywhere; }.appeal-review { padding:14px; border-radius:6px; background:var(--soft); }.appeal-images { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }.appeal-images button { border:1px solid var(--line); border-radius:6px; overflow:hidden; }.appeal-images img { width:80px; height:80px; object-fit:cover; }.dialog-field { margin-bottom:20px; }.word-count { text-align:right; }.skeletons { display:grid; gap:16px; }.review-skeleton { height:210px; }.refreshing { opacity:.65; }
</style>
