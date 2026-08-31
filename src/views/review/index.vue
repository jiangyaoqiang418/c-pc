<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
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
</script>

<template>
  <div class="review-list-page shop-container">
    <h1 class="page-title">我的评价</h1>
    <a-alert v-for="pending in reviewStore.pendingReviews" :key="String(pending.params.orderId)" type="warning">
      订单 {{ pending.params.orderId }} 的评价{{ pending.state === 'submitting' ? '正在提交' : '结果待核对' }}。原内容仅保留在当前登录会话，刷新或退出登录会清除快照。
      <template #action><a-button @click="router.push({ name: 'review-write', params: { orderId: String(pending.params.orderId) } })">返回原评价</a-button></template>
    </a-alert>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
        <a-tab-pane key="sent" title="我发出的" />
        <a-tab-pane v-if="isBuyer" key="received" title="我收到的（买手）" />
        <a-tab-pane v-if="isBuyer" key="appeals" title="评价申诉" />
      </a-tabs>
    </a-card>

    <div v-if="!isAppealTab" class="filters">
      <a-select v-model="status" allow-clear placeholder="全部状态">
        <a-option value="PENDING">待审核</a-option>
        <a-option value="PUBLISHED">已发布</a-option>
        <a-option value="REJECTED">已驳回</a-option>
        <a-option value="HIDDEN">已隐藏</a-option>
      </a-select>
      <a-select v-model="hasImage" allow-clear placeholder="全部评价">
        <a-option :value="true">仅看带图</a-option>
        <a-option :value="false">仅看无图</a-option>
      </a-select>
    </div>

    <div class="list-wrap">
      <a-alert v-if="notificationReviewError" type="error" :closable="false" class="notification-review-alert">
        {{ notificationReviewError }}
        <template #action><a-button size="mini" @click="route.query.id && loadNotificationReview(String(route.query.id))">重新加载</a-button></template>
      </a-alert>
      <template v-else-if="notificationReview">
        <div class="notification-review-title">通知关联评价</div>
        <ReviewCard :review="notificationReview" audience="received" :action-loading="actionLoading" @reply="openReply" @appeal="openAppeal" />
      </template>
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="!isAppealTab && reviews.length">
          <ReviewCard
            v-for="review in reviews"
            :key="review.reviewId"
            :review="review"
            :audience="activeKey === 'sent' ? 'sent' : 'received'"
            :action-loading="actionLoading"
            @reply="openReply"
            @appeal="openAppeal"
            @delete="removeReview"
          />
        </template>

        <template v-else-if="isAppealTab && appeals.length">
          <a-card v-for="appeal in appeals" :key="appeal.appealId" class="appeal-card" :bordered="false">
            <div class="appeal-head">
              <div>
                <div class="appeal-title">{{ appeal.productTitle || `评价申诉 #${appeal.reviewId}` }}</div>
                <span class="appeal-time">提交于 {{ formatTime(appeal.appliedAt || appeal.createdAt) }}</span>
              </div>
              <a-tag :color="appeal.status === 'APPROVED' ? 'green' : appeal.status === 'REJECTED' ? 'red' : 'orange'">
                {{ appeal.statusText || appeal.status }}
              </a-tag>
            </div>
            <div class="appeal-reason">{{ appeal.reason }}</div>
            <div v-if="appeal.reviewContent" class="appeal-review">原评价：{{ appeal.reviewContent }}</div>
            <div v-if="appeal.handleRemark" class="appeal-result">处理说明：{{ appeal.handleRemark }}</div>
            <div v-if="appeal.evidenceImages?.length" class="appeal-images">
              <a-image v-for="url in appeal.evidenceImages" :key="url" :src="url" width="72" height="72" fit="cover" />
            </div>
          </a-card>
        </template>

        <EmptyState
          v-else
          :title="loadError || (isAppealTab ? '暂无评价申诉' : '暂无评价')"
          :description="loadError ? undefined : isAppealTab ? '买手可对收到的评价发起申诉' : activeKey === 'sent' ? '完成订单后可以评价买手' : '买手身份接单后会收到顾客评价'"
          :action-text="loadError ? '重新加载' : undefined"
          @action="loadError && load()"
        />
      </a-spin>
    </div>

    <div v-if="total > pageSize" class="pagination">
      <a-pagination :total="total" :current="current" :page-size="pageSize" show-total @change="changePage" />
    </div>

    <a-modal v-model:visible="replyVisible" title="回复评价" :ok-loading="!!actionLoading" :on-before-ok="() => { void submitReply(); return false; }">
      <a-textarea v-model="replyContent" :max-length="500" show-word-limit placeholder="请输入回复内容" :rows="4" />
    </a-modal>

    <a-modal v-model:visible="appealVisible" title="发起评价申诉" :ok-loading="!!actionLoading" :ok-button-props="{ disabled: appealUploading }" :on-before-ok="() => { void submitAppeal(); return false; }">
      <a-form :model="appealForm" layout="vertical">
        <a-form-item label="申诉理由" required>
          <a-textarea v-model="appealForm.reason" :max-length="512" show-word-limit placeholder="请说明申诉理由" :rows="4" />
        </a-form-item>
        <a-form-item label="申诉凭证（可选，最多 6 张）">
          <AftersaleEvidenceUploader v-model="appealForm.evidenceImages" scene="REVIEW" :max="6" :disabled="!!actionLoading" @uploading="appealUploading = $event" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.review-list-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.filters { display: flex; gap: 12px; margin-top: 16px; }
.filters :deep(.arco-select) { width: 160px; }
.list-wrap { margin-top: 16px; }
.notification-review-alert { margin-bottom: 12px; }
.notification-review-title { margin: 0 0 8px; color: #4e5969; font-size: 13px; }
.pagination { display: flex; justify-content: center; margin-top: 16px; }
.appeal-card { margin-bottom: 12px; border: 1px solid #f2f3f5; }
.appeal-head { display: flex; justify-content: space-between; gap: 12px; }
.appeal-title { color: #1d2129; font-weight: 600; }
.appeal-time { display: block; color: #86909c; font-size: 12px; margin-top: 4px; }
.appeal-reason, .appeal-review, .appeal-result { margin-top: 12px; color: #4e5969; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.appeal-review { padding: 8px 10px; background: #f7f8fa; }
.appeal-result { color: #00b42a; }
.appeal-images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
@media (max-width: 640px) {
  .filters { flex-direction: column; }
  .filters :deep(.arco-select) { width: 100%; }
}
</style>
