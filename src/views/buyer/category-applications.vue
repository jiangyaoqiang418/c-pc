<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import CategoryPicker from '@/components/common/category-picker.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import EmptyState from '@/components/common/empty-state.vue';
import * as categoryApi from '@/service/api/category';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

interface CategoryOption {
  value: string;
  label: string;
  children?: CategoryOption[];
}

const records = ref<Api.RealCategory.CategoryApplyDTO[]>([]);
const userStore = useUserStore();
const categoryOptions = ref<CategoryOption[]>([]);
const loading = ref(false);
const loadError = ref('');
const categoryLoadError = ref('');
const categoryLoading = ref(false);
const submitting = ref(false);
const modalOpen = ref(false);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const filter = reactive<{
  keyword?: string;
  status?: Api.RealCategory.CategoryApplyStatus;
}>({});
const form = reactive({
  parentId: undefined as string | undefined,
  newName: '',
  reason: ''
});
const requestGuard = createLatestRequestGuard();
const categoriesGuard = createLatestRequestGuard();
let writeVersion = 0;
let modalVersion = 0;
watch(modalOpen, () => { modalVersion += 1; }, { flush: 'sync' });

function mapCategoryOptions(nodes: Api.RealCategory.CategoryNodeDTO[]): CategoryOption[] {
  return nodes.filter(node => node.enabled === true && node.level < 5).map(node => ({
    value: node.id,
    label: node.name,
    children: node.children?.length ? mapCategoryOptions(node.children) : undefined
  }));
}

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = String(userStore.currentUser?.id || '');
  if (!userId) {
    loading.value = false;
    records.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const result = await categoryApi.fetchMyCategoryApplications({
      pageNo: current.value,
      pageSize: size.value,
      keyword: filter.keyword || undefined,
      status: filter.status
    }, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
    size.value = resolvePageSize(result, size.value);
    const maxPage = Math.max(1, Math.ceil(result.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      void load();
      return;
    }
    records.value = result.records;
    total.value = result.total;
  } catch {
    if (!isCurrent()) return;
    records.value = [];
    total.value = 0;
    loadError.value = '分类申请记录加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadCategories() {
  const isCurrent = categoriesGuard.begin();
  categoryLoading.value = true;
  categoryLoadError.value = '';
  try {
    const tree = await categoryApi.fetchRealCategoryTree({ signal: isCurrent.signal });
    if (!isCurrent()) return;
    categoryOptions.value = mapCategoryOptions(tree);
  } catch {
    if (!isCurrent()) return;
    categoryOptions.value = [];
    categoryLoadError.value = '上级分类暂时无法加载；仍可提交顶级分类申请。';
  } finally {
    if (isCurrent()) categoryLoading.value = false;
  }
}

function openSubmit() {
  modalVersion += 1;
  form.parentId = undefined;
  form.newName = '';
  form.reason = '';
  modalOpen.value = true;
}

async function submit() {
  if (submitting.value) return;
  if (!form.newName.trim()) {
    Message.warning('请输入新分类名称');
    return;
  }
  if (!form.reason.trim()) {
    Message.warning('请输入申请理由');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const submittedModalVersion = modalVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    try {
      await categoryApi.submitCategoryApplication({
        parentId: form.parentId || undefined,
        newName: form.newName.trim(),
        reason: form.reason.trim()
      });
      if (!isCurrentWrite()) return;
      Message.success('分类申请已提交');
      if (submittedModalVersion === modalVersion) modalOpen.value = false;
      current.value = 1;
      await load();
    } catch {
      // 请求层已展示错误，保留表单内容供用户修正后重试。
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}

function reset() {
  filter.keyword = undefined;
  filter.status = undefined;
  current.value = 1;
  load();
}

function statusText(status: Api.RealCategory.CategoryApplyStatus) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }[status];
}

function formatTime(value?: string | number) {
  if (!value) return '—';
  const raw = String(value);
  const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

onMounted(() => {
  void load();
  void loadCategories();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
  categoriesGuard.invalidate();
});
watch(() => userStore.currentUser?.id, () => {
  writeVersion += 1;
  requestGuard.invalidate();
  categoriesGuard.invalidate();
  records.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  categoryLoadError.value = '';
  submitting.value = false;
  modalOpen.value = false;
  void load();
  void loadCategories();
});

const filterStatus = computed({
  get: () => filter.status || 'all',
  set: (value: string) => { filter.status = value === 'all' ? undefined : value as Api.RealCategory.CategoryApplyStatus; }
});
</script>

<template>
  <div class="category-page shop-container">
    <header class="page-head"><div><span class="eyebrow">UMAOMAO / CATEGORY REQUESTS</span><h1>分类申请</h1><p>现有分类无法满足商品发布时，可提交新增分类申请。</p></div><Button @click="openSubmit">提交申请</Button></header>
    <form class="filter-bar" @submit.prevent="current = 1; load()"><Input v-model="filter.keyword" aria-label="分类名称或申请理由" placeholder="分类名称或申请理由" /><Select v-model="filterStatus"><SelectTrigger class="status-filter" aria-label="申请状态"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="PENDING">待审核</SelectItem><SelectItem value="APPROVED">已通过</SelectItem><SelectItem value="REJECTED">已驳回</SelectItem></SelectContent></Select><Button type="submit" :disabled="loading">查询</Button><Button type="button" variant="outline" @click="reset">重置</Button></form>
    <section class="paper"><div v-if="loading && !records.length" class="loading-list" aria-busy="true"><Skeleton v-for="n in 4" :key="n" class="row-skeleton" /></div><EmptyState v-else-if="loadError" :title="loadError" action-text="重新加载" @action="load" /><div v-else-if="records.length" class="table-scroll"><table><thead><tr><th>申请分类</th><th>上级分类</th><th>申请理由</th><th>状态</th><th>审核意见</th><th>申请时间</th><th>审核时间</th></tr></thead><tbody><tr v-for="record in records" :key="record.id"><td class="name">{{ record.newName }}</td><td>{{ record.parentPath || '顶级分类' }}</td><td class="long-text">{{ record.reason }}</td><td><span class="status-tag" :class="record.status">{{ statusText(record.status) }}</span></td><td class="long-text">{{ record.reviewComment || '—' }}</td><td>{{ formatTime(record.createdAt) }}</td><td>{{ formatTime(record.reviewedAt) }}</td></tr></tbody></table></div><EmptyState v-else title="暂无分类申请" description="需要新增分类时，可提交申请。" action-text="提交申请" @action="openSubmit" /></section>
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="(page: number) => { current = page; load(); }" />
    <a-modal v-model:visible="modalOpen" :key="modalVersion" title="提交分类申请" :ok-loading="submitting" :closable="!submitting" :mask-closable="!submitting" :esc-to-close="!submitting" :on-before-cancel="() => !submitting" :on-before-ok="() => { void submit(); return false; }"><div class="application-form"><div class="field"><Label for="category-parent">上级分类</Label><CategoryPicker id="category-parent" :model-value="form.parentId" :options="categoryOptions" :loading="categoryLoading" :disabled="submitting" placeholder="不选择则申请顶级分类" @update:model-value="form.parentId = $event === undefined ? undefined : String($event)" /><Alert v-if="categoryLoadError"><AlertDescription>{{ categoryLoadError }}<Button type="button" variant="ghost" size="sm" :disabled="submitting || categoryLoading" @click="loadCategories">重新加载</Button></AlertDescription></Alert></div><div class="field"><Label for="category-new-name">新分类名称 <span>*</span></Label><Input id="category-new-name" v-model="form.newName" :disabled="submitting" maxlength="50" placeholder="请输入分类名称" /></div><div class="field"><Label for="category-reason">申请理由 <span>*</span></Label><Textarea id="category-reason" v-model="form.reason" :disabled="submitting" maxlength="500" :rows="5" placeholder="请说明分类申请理由" /><small class="counter">{{ form.reason.length }}/500</small></div></div></a-modal>
  </div>
</template>

<style scoped>
.category-page { display:grid; gap:24px; }.page-head { display:flex; align-items:center; justify-content:space-between; gap:20px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.page-head h1 { font-size:28px; margin:8px 0; font-weight:650; }.page-head p { font-size:13px; color:var(--yb-muted); margin:0; }.filter-bar { display:grid; grid-template-columns:minmax(180px,1fr) 160px auto auto; gap:12px; padding:20px; border:1px solid var(--yb-hairline); background:var(--yb-surface); border-radius:10px; }.status-filter { width:100%; }.paper { border:1px solid var(--yb-hairline); border-radius:12px; background:var(--yb-surface); overflow:hidden; }.table-scroll { overflow-x:auto; }table { width:100%; min-width:1000px; border-collapse:collapse; text-align:left; font-size:13px; }th { color:var(--yb-muted); background:var(--yb-fill); padding:16px; font-size:12px; font-weight:500; }td { padding:20px 16px; border-top:1px solid var(--yb-hairline); line-height:1.8; min-width:120px; }.name { font-weight:600; }.long-text { min-width:180px; max-width:260px; white-space:pre-wrap; overflow-wrap:anywhere; }tbody tr { transition:background 150ms var(--um-ease); }tbody tr:hover { background:color-mix(in srgb,var(--yb-fill) 50%,var(--yb-surface)); }.status-tag { padding:4px 8px; background:var(--yb-champagne); color:var(--yb-gold); border-radius:5px; white-space:nowrap; font-size:12px; }.status-tag.APPROVED { color:var(--yb-success); background:var(--yb-success-soft); }.status-tag.REJECTED { color:var(--yb-danger); background:var(--yb-danger-soft); }.application-form { display:grid; gap:22px; }.field { display:grid; gap:10px; }.field label>span { color:var(--yb-danger); }.counter { font-size:12px; color:var(--yb-muted); text-align:right; }.loading-list { padding:22px; display:grid; gap:16px; }.row-skeleton { height:70px; }@media(max-width:1150px) { .filter-bar { grid-template-columns:minmax(180px,1fr) 160px; } }@media(prefers-reduced-motion:reduce) { tbody tr { transition:none; } }
</style>
