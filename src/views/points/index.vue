<script setup lang="ts">
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { parseDateValue } from '@/utils/date-range';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { formatPoints } from '@shared';
import * as pointApi from '@/service/api/point';
import * as vipApi from '@/service/api/vip';
import PointBehaviorTag from '@/components/profile/point-behavior-tag.vue';
import PointLogRow from '@/components/profile/point-log-row.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

const activeTab = ref<'logs' | 'appeals' | 'rules'>('logs');
const logs = ref<Api.RealPoint.Ledger[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const logLoadError = ref('');
const rules = ref<Api.RealPoint.Rule[]>([]);
const rulesLoadError = ref('');
const rulesLoading = ref(false);
const rulesReadComplete = ref(false);
const vipStatus = ref<Api.RealVip.Status>();
const appeals = ref<Api.RealPoint.PointAppealDTO[]>([]);
const appealTotal = ref(0);
const appealCurrent = ref(1);
const appealSize = ref(20);
const appealLoading = ref(false);
const appealLoadError = ref('');
const appealModalOpen = ref(false);
const appealSubmitting = ref(false);
const appealTarget = ref<Api.RealPoint.Ledger>();
const appealForm = reactive({ reason: '' });
const appealFilter = reactive<{
  keyword?: string;
  status?: Api.RealPoint.PointAppealStatus;
}>({});

const filter = reactive<{
  behaviors: Api.Point.BehaviorCode[];
  dateRange?: string[];
}>({ behaviors: [] });
const logsGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const appealsGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const rulesGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const vipGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
let appealWriteVersion = 0;
let appealModalVersion = 0;
watch(appealModalOpen, () => { appealModalVersion += 1; }, { flush: 'sync' });
let disposed = false;

const ALL_BEHAVIORS: Api.Point.BehaviorCode[] = [
  'CONSUME', 'DEPOSIT_IN', 'RECHARGE', 'WITHDRAW', 'FINANCE_HOLD',
  'ORDER_DONE', 'KYC_PASS', 'REVIEW_GOOD', 'REVIEW_BAD', 'DEPOSIT_PLEDGE', 'BUYER_NO_FULFILL'
];
let syncingQuery = false;

function syncFromQuery() {
  syncingQuery = true;
  const value = (key: string) => {
    const raw = route.query[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const pageValue = (key: string) => {
    const page = Number(value(key));
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  };
  const tab = value('tab');
  activeTab.value = tab === 'appeals' || tab === 'rules' ? tab : 'logs';
  const behaviorValues = (value('behaviors') || '').split(',').filter(Boolean);
  filter.behaviors = behaviorValues.filter((behavior): behavior is Api.Point.BehaviorCode => ALL_BEHAVIORS.includes(behavior as Api.Point.BehaviorCode));
  filter.dateRange = value('from') || value('to') ? [value('from') || '', value('to') || ''] : undefined;
  current.value = pageValue('page');
  appealCurrent.value = pageValue('appealPage');
  appealFilter.keyword = value('appealKeyword') || undefined;
  const state = value('appealStatus') as Api.RealPoint.PointAppealStatus;
  const validAppealStatus = ['PENDING', 'APPROVED', 'REJECTED'].includes(state);
  appealFilter.status = validAppealStatus ? state : undefined;
  syncingQuery = false;
  return (route.query.behaviors !== undefined && (Array.isArray(route.query.behaviors)
      || behaviorValues.some(behavior => !ALL_BEHAVIORS.includes(behavior as Api.Point.BehaviorCode))))
    || (route.query.tab !== undefined && (Array.isArray(route.query.tab) || !['appeals', 'rules'].includes(String(tab))))
    || (route.query.appealStatus !== undefined && (Array.isArray(route.query.appealStatus) || !validAppealStatus));
}

function loadActiveTab() {
  if (activeTab.value === 'appeals') return loadAppeals();
  if (activeTab.value === 'rules') return loadRules();
  return loadLogs();
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  const query = { ...route.query, tab: activeTab.value === 'logs' ? undefined : activeTab.value,
    behaviors: filter.behaviors.join(',') || undefined, from: filter.dateRange?.[0] || undefined, to: filter.dateRange?.[1] || undefined,
    page: current.value > 1 ? String(current.value) : undefined,
    appealPage: appealCurrent.value > 1 ? String(appealCurrent.value) : undefined,
    appealKeyword: appealFilter.keyword?.trim() || undefined, appealStatus: appealFilter.status };
  void (replace ? router.replace({ query }) : router.push({ query })).then(() => {
    if (route.fullPath === before) void loadActiveTab();
  });
}

async function loadLogs() {
  if (disposed) return;
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    logsGuard.invalidate();
    loading.value = false;
    logs.value = [];
    total.value = 0;
    logLoadError.value = '';
    return;
  }
  const isCurrent = logsGuard.begin();
  const userId = currentUser.id;
  loading.value = true;
  logLoadError.value = '';
  try {
    const r = await pointApi.fetchMyPointLogs({
      userId,
      current: current.value,
      size: size.value,
      behaviors: filter.behaviors.length ? filter.behaviors : undefined,
      fromAt: filter.dateRange?.[0],
      toAt: filter.dateRange?.[1]
    }, { signal: isCurrent.signal, showError: false });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    logs.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    logs.value = [];
    total.value = 0;
    logLoadError.value = '积分流水加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadRules() {
  if (disposed) return;
  const isCurrent = rulesGuard.begin();
  rulesLoading.value = true;
  rulesLoadError.value = '';
  try {
    const result = await pointApi.fetchPointRules({ signal: isCurrent.signal });
    if (!isCurrent()) return;
    rules.value = result;
  } catch {
    if (!isCurrent()) return;
    rules.value = [];
    rulesLoadError.value = '积分规则加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) {
      rulesLoading.value = false;
      rulesReadComplete.value = true;
    }
  }
}

async function loadAppeals() {
  if (disposed) return;
  const userId = userStore.currentUser?.id;
  if (!userId) {
    appealsGuard.invalidate();
    appealLoading.value = false;
    appeals.value = [];
    appealTotal.value = 0;
    appealLoadError.value = '';
    return;
  }
  const isCurrent = appealsGuard.begin();
  appealLoading.value = true;
  appealLoadError.value = '';
  try {
    const r = await pointApi.fetchMyPointAppeals({
      pageNo: appealCurrent.value,
      pageSize: appealSize.value,
      keyword: appealFilter.keyword || undefined,
      status: appealFilter.status,
      userId: String(userId)
    }, { signal: isCurrent.signal, showError: false });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    appealSize.value = resolvePageSize(r, appealSize.value);
    const maxPage = Math.max(1, Math.ceil(r.total / appealSize.value));
    if (appealCurrent.value > maxPage) {
      appealCurrent.value = maxPage;
      syncQuery(true);
      return;
    }
    appeals.value = r.records;
    appealTotal.value = r.total;
  } catch {
    if (!isCurrent()) return;
    appeals.value = [];
    appealTotal.value = 0;
    appealLoadError.value = '积分申诉记录加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) appealLoading.value = false;
  }
}

async function loadInitial() {
  if (disposed) return;
  const uid = userStore.currentUser?.id;
  if (!uid) {
    vipGuard.invalidate();
    vipStatus.value = undefined;
    return;
  }
  const isCurrent = vipGuard.begin();
  try {
    const nextVipStatus = await vipApi.fetchMyVipStatus(uid, { signal: isCurrent.signal, audience: userStore.currentAudience });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(uid)) return;
    vipStatus.value = nextVipStatus;
  } catch {
    if (!isCurrent()) return;
    vipStatus.value = undefined;
  }
  if (disposed || !isCurrent()) return;
  await loadLogs();
  if (disposed || !isCurrent()) return;
  await loadRules();
}

onMounted(() => {
  if (syncFromQuery()) {
    syncQuery(true);
    return;
  }
  void loadInitial();
  if (activeTab.value === 'appeals') void loadAppeals();
});
onBeforeUnmount(() => {
  disposed = true;
  appealWriteVersion += 1;
  logsGuard.invalidate();
  appealsGuard.invalidate();
  rulesGuard.invalidate();
  vipGuard.invalidate();
});

watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  if (disposed) return;
  appealWriteVersion += 1;
  logsGuard.invalidate();
  appealsGuard.invalidate();
  rulesGuard.invalidate();
  vipGuard.invalidate();
  current.value = 1;
  appealCurrent.value = 1;
  logs.value = [];
  total.value = 0;
  appeals.value = [];
  appealTotal.value = 0;
  vipStatus.value = undefined;
  logLoadError.value = '';
  rulesLoadError.value = '';
  appealLoadError.value = '';
  appealTarget.value = undefined;
  appealModalOpen.value = false;
  appealSubmitting.value = false;
  syncQuery(true);
  void loadInitial();
});
watch(() => userStore.currentAudience, () => {
  vipGuard.invalidate();
  vipStatus.value = undefined;
  void loadInitial();
});

watch(activeTab, () => {
  if (disposed || syncingQuery) return;
  syncQuery();
}, { flush: 'sync' });
watch(() => route.fullPath, () => {
  if (syncFromQuery()) {
    syncQuery(true);
    return;
  }
  void loadActiveTab();
});

const user = computed(() => userStore.currentUser);
const progressPct = computed(() => {
  if (!vipStatus.value?.nextThreshold) return undefined;
  const value = vipStatus.value.points / vipStatus.value.nextThreshold * 100;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined;
});

function openAppeal(log: Api.RealPoint.Ledger) {
  appealModalVersion += 1;
  appealTarget.value = log;
  appealForm.reason = '';
  appealModalOpen.value = true;
}

async function submitAppeal() {
  if (appealSubmitting.value) return;
  const reason = appealForm.reason.trim();
  if (!appealTarget.value || reason.length < 10) {
    Message.warning('原因至少 10 字');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  const requestedSession = userStore.sessionVersion;
  if (requestedUserId === undefined) return;
  const appealLogId = appealTarget.value.id;
  const operation = ++appealWriteVersion;
  const submittedModalVersion = appealModalVersion;
  appealSubmitting.value = true;
  try {
    const r = await pointApi.appealPointLog({ logId: appealLogId, reason });
    if (operation !== appealWriteVersion || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    if (!r.ok) {
      Message.error(r.message || '提交失败');
      return;
    }
    Message.success('申诉已提交');
    if (submittedModalVersion === appealModalVersion) appealModalOpen.value = false;
    await Promise.all([loadLogs(), loadAppeals()]);
  } catch {
    // 请求层显示业务错误，保留申诉表单且不产生未处理的确认回调异常。
  } finally {
    if (operation === appealWriteVersion) appealSubmitting.value = false;
  }
}

function reset() {
  filter.behaviors = [];
  filter.dateRange = undefined;
  current.value = 1;
  syncQuery();
}

function resetAppeals() {
  appealFilter.keyword = undefined;
  appealFilter.status = undefined;
  appealCurrent.value = 1;
  syncQuery();
}

function appealStatusText(status: Api.RealPoint.PointAppealStatus) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }[status];
}

function appealStatusColor(status: Api.RealPoint.PointAppealStatus) {
  return { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red' }[status];
}

const filteredRules = computed(() => rules.value.filter(r => r.enabled));

const appealStatusFilter = computed({
  get: () => appealFilter.status || 'all',
  set: (value: string) => { appealFilter.status = value === 'all' ? undefined : value as Api.RealPoint.PointAppealStatus; }
});
function setBehavior(behavior: Api.Point.BehaviorCode, selected: boolean | 'indeterminate') {
  filter.behaviors = selected === true ? [...filter.behaviors.filter(value => value !== behavior), behavior] : filter.behaviors.filter(value => value !== behavior);
}
function dateInputValue(value?: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = parseDateValue(value);
  if (timestamp === undefined) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const fromDate = computed({
  get: () => dateInputValue(filter.dateRange?.[0]),
  set: (value: string) => { filter.dateRange = value || filter.dateRange?.[1] ? [value, filter.dateRange?.[1] || ''] : undefined; }
});
const toDate = computed({
  get: () => dateInputValue(filter.dateRange?.[1]),
  set: (value: string) => { filter.dateRange = value || filter.dateRange?.[0] ? [filter.dateRange?.[0] || '', value] : undefined; }
});
</script>

<template>
  <div class="points-page v47-membership">
    <div class="page-heading compact"><h1>我的积分</h1><span class="heading-meta">{{ vipStatus ? '当前积分 ' + formatPoints(vipStatus.points) : '积分待确认' }}</span><button class="outline" @click="router.push('/vip')">查看 VIP 权益 →</button></div>
    <section class="paper membership-overview"><h2>积分明细</h2><div v-if="user && vipStatus" class="membership-current-head"><div><h3>{{ user.nickname }} · {{ vipStatus.vipLevel }}</h3><p>当前积分 {{ formatPoints(vipStatus.points) }}</p></div><div v-if="vipStatus.nextThreshold !== undefined" class="membership-progress"><p>距离下一等级还差 {{ formatPoints(vipStatus.pointsToNext, '—') }} 积分</p><div v-if="progressPct !== undefined" class="membership-progress-track" role="progressbar" aria-label="积分升级进度" :aria-valuenow="Math.round(progressPct)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: progressPct + '%' }" /></div></div></div><div v-else class="membership-account-unavailable"><p>当前积分与等级尚未取得。</p><button class="outline" @click="loadInitial">重新加载账户</button></div></section>
    <nav class="tabs" aria-label="积分记录"><button v-for="item in [{ key: 'logs', label: '积分流水' }, { key: 'appeals', label: '申诉记录' }, { key: 'rules', label: '积分规则' }] as const" :key="item.key" :class="{ active: activeTab === item.key }" :aria-pressed="activeTab === item.key" @click="activeTab = item.key">{{ item.label }}</button></nav>
    <template v-if="activeTab === 'logs'">
      <form class="paper filter-panel" novalidate @submit.prevent="current = 1; syncQuery()" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div class="field"><span class="field-label">行为</span><DropdownMenu><DropdownMenuTrigger as-child><button type="button" class="outline behavior-trigger">{{ filter.behaviors.length ? '已选 ' + filter.behaviors.length + ' 种行为' : '全部行为' }}<Icon icon="lucide:chevron-down" width="15" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" :collision-padding="8" class="behavior-menu"><DropdownMenuItem @select="filter.behaviors = []">不限 · 清除全部行为</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuCheckboxItem v-for="b in ALL_BEHAVIORS" :key="b" :model-value="filter.behaviors.includes(b)" @update:model-value="setBehavior(b, $event)" @select.prevent><PointBehaviorTag :behavior="b" /></DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu></div>
        <div class="field date-field"><span class="field-label">日期范围</span><div class="date-range"><Input v-model="fromDate" type="date" aria-label="开始日期" :max="toDate || undefined" /><span>—</span><Input v-model="toDate" type="date" aria-label="结束日期" :min="fromDate || undefined" /></div></div>
        <div class="filter-actions"><button type="submit" :disabled="loading" class="primary">查询</button><button type="button" :disabled="loading" @click="reset" class="outline">重置</button></div>
      </form>
      <p v-if="!loading && !logLoadError" class="record-count">共 {{ total }} 条积分流水</p>
      <section class="paper list-panel" :aria-busy="loading"><div v-if="loading && !logs.length" class="skeletons"><Skeleton v-for="n in 4" :key="n" class="h-20" /></div><div v-else-if="logs.length" :class="{ refreshing: loading }"><PointLogRow v-for="l in logs" :key="l.id" :log="l" @appeal="openAppeal" /></div><EmptyState v-else :title="logLoadError || '暂无匹配的积分流水'" :description="logLoadError ? '请稍后重试。' : '积分变动后可在此查看记录。'" :action-text="logLoadError ? '重新加载' : undefined" @action="loadLogs" /></section>
      <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="(p: number) => { current = p; syncQuery(); }" />
    </template>
    <template v-else-if="activeTab === 'appeals'">
      <form class="paper filter-panel appeals-filter" novalidate @submit.prevent="appealCurrent = 1; syncQuery()" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }"><div class="field"><Label for="point-appeal-keyword">关键词</Label><Input id="point-appeal-keyword" v-model="appealFilter.keyword" placeholder="行为或申诉原因" /></div><div class="field"><Label for="point-appeal-status">状态</Label><Select v-model="appealStatusFilter"><SelectTrigger id="point-appeal-status"><SelectValue placeholder="请选择申诉状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="PENDING">待审核</SelectItem><SelectItem value="APPROVED">已通过</SelectItem><SelectItem value="REJECTED">已驳回</SelectItem></SelectContent></Select></div><div class="filter-actions"><button type="submit" :disabled="appealLoading" class="primary">查询</button><button type="button" :disabled="appealLoading" @click="resetAppeals" class="outline">重置</button></div></form>
      <section class="paper list-panel" :aria-busy="appealLoading"><div v-if="appealLoading && !appeals.length" class="skeletons"><Skeleton v-for="n in 4" :key="n" class="h-16" /></div><div v-else-if="appeals.length" class="table-scroll" :class="{ refreshing: appealLoading }"><table><thead><tr><th scope="col">行为</th><th scope="col">原积分</th><th scope="col">申诉原因</th><th scope="col">状态</th><th scope="col">审核意见</th><th scope="col">提交时间</th></tr></thead><tbody><tr v-for="record in appeals" :key="record.id"><td><PointBehaviorTag :behavior="record.behaviorCode || ''" :label="record.behaviorName" /></td><td>{{ record.originalScore }}</td><td class="long-text">{{ record.reason }}</td><td><span class="status" :class="appealStatusColor(record.status)">{{ appealStatusText(record.status) }}</span></td><td class="long-text">{{ record.reviewComment || record.decision || '—' }}</td><td>{{ record.createdAt }}</td></tr></tbody></table></div><EmptyState v-else :title="appealLoadError || '暂无申诉记录'" :description="appealLoadError ? '请稍后重试。' : undefined" :action-text="appealLoadError ? '重新加载' : undefined" @action="loadAppeals" /></section>
      <BusinessPagination v-if="appealTotal > appealSize" :total="appealTotal" :current="appealCurrent" :page-size="appealSize" :loading="appealLoading" @change="(p: number) => { appealCurrent = p; syncQuery(); }" />
    </template>
    <template v-else>
      <EmptyState v-if="rulesLoadError" :title="rulesLoadError" description="请稍后重试。" action-text="重新加载" @action="loadRules" />
      <div v-else-if="rulesLoading || !rulesReadComplete" class="rules-grid"><Skeleton v-for="n in 3" :key="n" class="h-48" /></div>
      <div v-else-if="filteredRules.length" class="rules-grid"><article v-for="r in filteredRules" :key="r.code" class="paper rule-card"><header><PointBehaviorTag :behavior="r.code" /><span class="audience-label">{{ r.audience === 'all' ? '通用' : r.audience === 'buyer' ? '买手' : '顾客' }}</span></header><h2>{{ r.label }}</h2><p>{{ r.description }}</p><footer><strong :class="{ minus: r.pointsPerUnit < 0 }">{{ r.pointsPerUnit > 0 ? '+' : '' }}{{ r.pointsPerUnit }} 分 / {{ r.unitLabel || '次' }}</strong><span v-if="r.capDaily">每日上限 {{ r.capDaily }}</span></footer></article></div>
      <EmptyState v-else title="暂无可用积分规则" action-text="重新加载" @action="loadRules" />
    </template>
    <a-modal v-model:visible="appealModalOpen" title="积分申诉" :ok-loading="appealSubmitting" :mask-closable="!appealSubmitting" :esc-to-close="!appealSubmitting" :closable="!appealSubmitting" :on-before-ok="() => { void submitAppeal(); return false; }"><div class="field"><Label for="point-appeal-reason">申诉原因 <span class="required">*</span></Label><Textarea id="point-appeal-reason" v-model="appealForm.reason" :disabled="appealSubmitting" :maxlength="500" :rows="5" placeholder="请说明申诉原因，至少 10 个字" /><span class="counter">{{ appealForm.reason.length }}/500</span></div></a-modal>
  </div>
</template>

<style scoped src="../../components/profile/v47-membership.css"></style>
<style scoped>
.membership-account-unavailable { display:flex; justify-content:space-between; align-items:center; gap:14px; font-size:13px; }
.filter-panel { display:grid; grid-template-columns:minmax(180px,1fr) minmax(260px,1.6fr) auto; gap:18px; align-items:end; }
.filter-panel .field { margin:0; min-width:0; }
.field-label { font-size:12px; font-weight:500; }
.behavior-trigger { justify-content:space-between; }
:global(.behavior-menu) { max-height:min(420px,70dvh,var(--reka-dropdown-menu-content-available-height,70dvh)); min-width:min(240px,calc(100vw - 32px)); overflow:auto; }
.date-range { display:flex; align-items:center; gap:8px; }.date-range input { min-width:0; }.date-range>span { color:var(--muted); }
.filter-actions { display:flex; gap:12px; }
.record-count { color:var(--muted); font-size:13px; margin:18px 0; }
.skeletons { display:grid; gap:16px; }
.refreshing { opacity:.65; }
.table-scroll { overflow:auto; }
table { border-collapse:collapse; min-width:850px; width:100%; text-align:left; }
th { padding:14px 16px; font-size:13px; font-weight:500; background:var(--soft); color:var(--muted); }
td { padding:18px 16px; border-bottom:1px solid var(--line); font-size:14px; vertical-align:top; }
.long-text { max-width:300px; overflow-wrap:anywhere; white-space:pre-wrap; }
.status,.audience-label { display:inline-flex; padding:4px 9px; border-radius:5px; font-size:12px; white-space:nowrap; background:var(--soft); color:var(--muted); }
.status.orange { color:var(--yb-warning); }.status.green { color:var(--yb-success); }.status.red { color:var(--yb-danger); }
.rules-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
.rule-card { margin-bottom:0; }
.rule-card header,.rule-card footer { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.rule-card h2 { font-size:18px; margin:20px 0 10px; }
.rule-card p { color:var(--muted); font-size:13px; line-height:1.8; margin-bottom:20px; }
.rule-card footer { padding-top:20px; border-top:1px solid var(--line); }
.rule-card footer strong { color:var(--yb-success); font-size:15px; }.rule-card footer .minus { color:var(--yb-danger); }
.rule-card footer>span,.counter { color:var(--muted); font-size:12px; }.counter { text-align:right; }.required { color:var(--yb-danger); }
.field :deep(input),.field :deep(button[role='combobox']),.field :deep(textarea) { height:auto; min-height:44px; padding:12px 14px; border:1px solid var(--line); border-radius:6px; background:var(--paper); box-shadow:none; }
@media(max-width:1100px) { .filter-panel { grid-template-columns:1fr 1.5fr; }.filter-actions { grid-column:1/-1; }.appeals-filter { grid-template-columns:1fr 1fr; }.rules-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:700px) {
  .filter-panel,.rules-grid { grid-template-columns:1fr; }
  .membership-account-unavailable { flex-wrap:wrap; }
  .membership-current-head > div { min-width:0; max-width:100%; }
  .membership-current-head h3 { overflow-wrap:anywhere; }
}
</style>
