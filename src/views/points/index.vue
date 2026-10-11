<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import VipBadge from '@/components/common/vip-badge.vue';
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
const logsGuard = createLatestRequestGuard();
const appealsGuard = createLatestRequestGuard();
const rulesGuard = createLatestRequestGuard();
const vipGuard = createLatestRequestGuard();
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
    const nextVipStatus = await vipApi.fetchMyVipStatus(uid, { signal: isCurrent.signal });
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

watch(() => userStore.currentUser?.id, () => {
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
  if (!user.value || !vipStatus.value?.nextThreshold) return 100;
  return Math.min(100, (vipStatus.value.points / vipStatus.value.nextThreshold) * 100);
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
  if (requestedUserId === undefined) return;
  const appealLogId = appealTarget.value.id;
  const operation = ++appealWriteVersion;
  const submittedModalVersion = appealModalVersion;
  appealSubmitting.value = true;
  try {
    const r = await pointApi.appealPointLog({ logId: appealLogId, reason });
    if (operation !== appealWriteVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
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
  <div class="points-page shop-container">
    <header class="page-head"><div><span class="eyebrow">MEMBERSHIP POINTS</span><h1>我的积分</h1><p>查看积分变动、申诉记录和当前积分规则。</p></div><Button variant="outline" @click="router.push('/vip')">查看 VIP 权益</Button></header>
    <section v-if="user && vipStatus" class="points-hero"><div class="user-meta"><span :title="user.nickname">{{ user.nickname }}</span><VipBadge :level="user.vipLevel" /></div><div class="points-block"><strong>{{ user.points === undefined ? '—' : formatPoints(user.points) }}</strong><span>积分</span></div><div v-if="vipStatus.nextThreshold" class="progress-block">距 {{ vipStatus.vipLevel === 'VIP0' ? 'VIP1' : 'VIP2' }} 还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 分<Progress :model-value="progressPct" class="points-progress" /></div></section>
    <Tabs v-model="activeTab" class="tabs-panel page-tabs"><TabsList><TabsTrigger value="logs">积分流水</TabsTrigger><TabsTrigger value="appeals">申诉记录</TabsTrigger><TabsTrigger value="rules">积分规则</TabsTrigger></TabsList></Tabs>
    <template v-if="activeTab === 'logs'">
      <form class="panel filter-panel" novalidate @submit.prevent="current = 1; syncQuery()" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div class="field"><span class="field-label">行为</span><DropdownMenu><DropdownMenuTrigger as-child><Button type="button" variant="outline" class="behavior-trigger">{{ filter.behaviors.length ? '已选 ' + filter.behaviors.length + ' 种行为' : '全部行为' }}<Icon icon="lucide:chevron-down" width="15" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" :collision-padding="8" class="behavior-menu"><DropdownMenuItem @select="filter.behaviors = []">不限 · 清除全部行为</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuCheckboxItem v-for="b in ALL_BEHAVIORS" :key="b" :model-value="filter.behaviors.includes(b)" @update:model-value="setBehavior(b, $event)" @select.prevent><PointBehaviorTag :behavior="b" /></DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu></div>
        <div class="field date-field"><span class="field-label">日期范围</span><div class="date-range"><Input v-model="fromDate" type="date" aria-label="开始日期" :max="toDate || undefined" /><span>—</span><Input v-model="toDate" type="date" aria-label="结束日期" :min="fromDate || undefined" /></div></div>
        <div class="filter-actions"><Button type="submit" :disabled="loading">查询</Button><Button type="button" variant="outline" :disabled="loading" @click="reset">重置</Button></div>
      </form>
      <p v-if="!loading && !logLoadError" class="record-count">共 {{ total }} 条积分流水</p>
      <section class="panel list-panel" :aria-busy="loading"><div v-if="loading && !logs.length" class="skeletons"><Skeleton v-for="n in 4" :key="n" class="h-20" /></div><div v-else-if="logs.length" :class="{ refreshing: loading }"><PointLogRow v-for="l in logs" :key="l.id" :log="l" @appeal="openAppeal" /></div><EmptyState v-else :title="logLoadError || '暂无匹配的积分流水'" :description="logLoadError ? '请稍后重试。' : '完成订单 / 评价 / KYC 等可获得积分'" :action-text="logLoadError ? '重新加载' : undefined" @action="loadLogs" /></section>
      <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="(p: number) => { current = p; syncQuery(); }" />
    </template>
    <template v-else-if="activeTab === 'appeals'">
      <form class="panel filter-panel appeals-filter" novalidate @submit.prevent="appealCurrent = 1; syncQuery()" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }"><div class="field"><Label for="point-appeal-keyword">关键词</Label><Input id="point-appeal-keyword" v-model="appealFilter.keyword" placeholder="行为或申诉原因" /></div><div class="field"><Label for="point-appeal-status">状态</Label><Select v-model="appealStatusFilter"><SelectTrigger id="point-appeal-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="PENDING">待审核</SelectItem><SelectItem value="APPROVED">已通过</SelectItem><SelectItem value="REJECTED">已驳回</SelectItem></SelectContent></Select></div><div class="filter-actions"><Button type="submit" :disabled="appealLoading">查询</Button><Button type="button" variant="outline" :disabled="appealLoading" @click="resetAppeals">重置</Button></div></form>
      <section class="panel list-panel" :aria-busy="appealLoading"><div v-if="appealLoading && !appeals.length" class="skeletons"><Skeleton v-for="n in 4" :key="n" class="h-16" /></div><div v-else-if="appeals.length" class="table-scroll" :class="{ refreshing: appealLoading }"><table><thead><tr><th scope="col">行为</th><th scope="col">原积分</th><th scope="col">申诉原因</th><th scope="col">状态</th><th scope="col">审核意见</th><th scope="col">提交时间</th></tr></thead><tbody><tr v-for="record in appeals" :key="record.id"><td><PointBehaviorTag :behavior="record.behaviorCode || ''" :label="record.behaviorName" /></td><td>{{ record.originalScore }}</td><td class="long-text">{{ record.reason }}</td><td><span class="status" :class="appealStatusColor(record.status)">{{ appealStatusText(record.status) }}</span></td><td class="long-text">{{ record.reviewComment || record.decision || '—' }}</td><td>{{ record.createdAt }}</td></tr></tbody></table></div><EmptyState v-else :title="appealLoadError || '暂无申诉记录'" :description="appealLoadError ? '请稍后重试。' : undefined" :action-text="appealLoadError ? '重新加载' : undefined" @action="loadAppeals" /></section>
      <BusinessPagination v-if="appealTotal > appealSize" :total="appealTotal" :current="appealCurrent" :page-size="appealSize" :loading="appealLoading" @change="(p: number) => { appealCurrent = p; syncQuery(); }" />
    </template>
    <template v-else>
      <EmptyState v-if="rulesLoadError" :title="rulesLoadError" description="请稍后重试。" action-text="重新加载" @action="loadRules" />
      <div v-else-if="rulesLoading || !rulesReadComplete" class="rules-grid"><Skeleton v-for="n in 3" :key="n" class="h-48" /></div>
      <div v-else-if="filteredRules.length" class="rules-grid"><article v-for="r in filteredRules" :key="r.code" class="panel rule-card"><header><PointBehaviorTag :behavior="r.code" /><span class="audience-label">{{ r.audience === 'all' ? '通用' : r.audience === 'buyer' ? '买手' : '顾客' }}</span></header><h2>{{ r.label }}</h2><p>{{ r.description }}</p><footer><strong :class="{ minus: r.pointsPerUnit < 0 }">{{ r.pointsPerUnit > 0 ? '+' : '' }}{{ r.pointsPerUnit }} 分 / {{ r.unitLabel || '次' }}</strong><span v-if="r.capDaily">每日上限 {{ r.capDaily }}</span></footer></article></div>
      <EmptyState v-else title="暂无可用积分规则" action-text="重新读取" @action="loadRules" />
    </template>
    <a-modal v-model:visible="appealModalOpen" title="积分申诉" :ok-loading="appealSubmitting" :mask-closable="!appealSubmitting" :esc-to-close="!appealSubmitting" :closable="!appealSubmitting" :on-before-ok="() => { void submitAppeal(); return false; }"><div class="field"><Label for="point-appeal-reason">申诉原因 <span class="required">*</span></Label><Textarea id="point-appeal-reason" v-model="appealForm.reason" :disabled="appealSubmitting" :maxlength="500" :rows="5" placeholder="请说明申诉原因，至少 10 个字" /><span class="counter">{{ appealForm.reason.length }}/500</span></div></a-modal>
  </div>
</template>

<style scoped>
.points-page { padding-top:32px; padding-bottom:48px; }.page-head { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom:26px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { margin:5px 0 10px; font-size:28px; font-weight:650; }.page-head p { color:var(--yb-muted); margin:0; font-size:14px; }.points-hero { display:grid; grid-template-columns:minmax(180px,1fr) auto minmax(240px,1fr); align-items:center; gap:24px; padding:24px; border:1px solid var(--yb-hairline); border-radius:8px; background:var(--yb-paper); color:var(--yb-ink); margin-bottom:24px; }.user-meta { display:flex; align-items:center; gap:16px; }.user-meta>span { max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:17px; }.points-block { display:flex; align-items:baseline; gap:12px; margin:0; }.points-block strong { font-size:32px; font-weight:600; font-variant-numeric:tabular-nums; }.points-block>span { color:var(--yb-muted); font-size:14px; }.progress-block { font-size:13px; max-width:420px; }.points-progress { margin-top:12px; background:var(--yb-fill); height:4px; }.points-progress :deep(div) { background:var(--yb-primary); }.tabs-panel { margin-bottom:20px; }.panel { background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; padding:24px; }.filter-panel { display:grid; grid-template-columns:minmax(200px,1fr) minmax(300px,1.6fr) auto; gap:20px; align-items:end; margin-bottom:20px; }.field { display:grid; gap:10px; }.field-label { font-size:14px; font-weight:500; }.behavior-trigger { justify-content:space-between; }:global(.behavior-menu) { max-height:min(420px,70dvh,var(--reka-dropdown-menu-content-available-height,70dvh)); min-width:min(240px,calc(100vw - 32px)); overflow-y:auto; }.date-range { display:flex; align-items:center; gap:8px; }.date-range input { min-width:0; }.date-range>span { color:var(--yb-muted); }.filter-actions { display:flex; gap:12px; }.record-count { color:var(--yb-muted); font-size:13px; margin:18px 0; }.list-panel { padding:10px 16px; }.skeletons { display:grid; gap:16px; padding:16px 0; }.refreshing { opacity:.65; }.table-scroll { overflow-x:auto; }table { border-collapse:collapse; min-width:850px; width:100%; text-align:left; }th { padding:14px 16px; font-size:13px; font-weight:500; background:var(--yb-fill); color:var(--yb-muted); }td { padding:20px 16px; border-bottom:1px solid var(--yb-hairline); font-size:14px; vertical-align:top; }.long-text { max-width:300px; overflow-wrap:anywhere; white-space:pre-wrap; }.status,.audience-label { display:inline-flex; padding:4px 9px; border-radius:4px; font-size:12px; white-space:nowrap; }.orange { color:#9a5709; background:#fff3df; }.green { color:#326b43; background:#e9f3eb; }.red { color:#ad453e; background:#fcecea; }.rules-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; }.rule-card header,.rule-card footer { display:flex; align-items:center; justify-content:space-between; gap:12px; }.audience-label { color:var(--yb-muted); background:var(--yb-fill); }.rule-card h2 { font-size:18px; font-weight:600; margin:22px 0 10px; }.rule-card p { color:var(--yb-muted); font-size:14px; line-height:1.8; min-height:50px; }.rule-card footer { padding-top:20px; border-top:1px solid var(--yb-hairline); }.rule-card footer strong { color:var(--yb-success); font-size:15px; font-weight:600; }.rule-card footer .minus { color:var(--yb-danger); }.rule-card footer>span { color:var(--yb-muted); font-size:12px; }.required { color:var(--yb-danger); }.counter { color:var(--yb-muted); text-align:right; font-size:12px; }@media(max-width:1100px) { .filter-panel { grid-template-columns:1fr 1.5fr; }.filter-actions { grid-column:1/-1; }.appeals-filter { grid-template-columns:1fr 1fr; }.rules-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }@media(max-width:700px) { .points-hero,.filter-panel,.rules-grid { grid-template-columns:1fr; }.points-hero { gap:16px; }.page-head { flex-direction:column; align-items:start; } }
</style>
