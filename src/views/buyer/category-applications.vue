<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
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
  parentPath: [] as string[],
  newName: '',
  reason: ''
});
const requestGuard = createLatestRequestGuard();
const categoriesGuard = createLatestRequestGuard();
let writeVersion = 0;

function mapCategoryOptions(nodes: Api.RealCategory.CategoryNodeDTO[]): CategoryOption[] {
  return nodes.filter(node => node.level < 3).map(node => ({
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
  categoryLoadError.value = '';
  try {
    const tree = await categoryApi.fetchRealCategoryTree({ signal: isCurrent.signal });
    if (!isCurrent()) return;
    categoryOptions.value = mapCategoryOptions(tree);
  } catch {
    if (!isCurrent()) return;
    categoryOptions.value = [];
    categoryLoadError.value = '上级分类暂时无法加载；仍可提交顶级分类申请。';
  }
}

function openSubmit() {
  form.parentPath = [];
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
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    try {
      await categoryApi.submitCategoryApplication({
        parentId: form.parentPath[form.parentPath.length - 1],
        newName: form.newName.trim(),
        reason: form.reason.trim()
      });
      if (!isCurrentWrite()) return;
      Message.success('分类申请已提交');
      modalOpen.value = false;
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

function statusColor(status: Api.RealCategory.CategoryApplyStatus) {
  return { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red' }[status];
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
</script>

<template>
  <div class="page shop-container">
    <div class="page-head">
      <div>
        <h1>分类申请</h1>
        <p>现有分类无法满足商品发布时，可提交新增分类申请。</p>
      </div>
      <a-button type="primary" @click="openSubmit">提交申请</a-button>
    </div>

    <a-card :bordered="false" class="filter-card">
      <a-form :model="filter" layout="inline">
        <a-form-item label="关键词">
          <a-input v-model="filter.keyword" allow-clear placeholder="分类名称或申请理由" style="width: 220px" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model="filter.status" allow-clear placeholder="全部" style="width: 140px">
            <a-option value="PENDING">待审核</a-option>
            <a-option value="APPROVED">已通过</a-option>
            <a-option value="REJECTED">已驳回</a-option>
          </a-select>
        </a-form-item>
        <a-button type="primary" @click="(() => { current = 1; load(); })()">查询</a-button>
        <a-button @click="reset">重置</a-button>
      </a-form>
    </a-card>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <EmptyState v-if="loadError" :title="loadError" action-text="重新加载" @action="load" />
      <a-table v-else :data="records" :loading="loading" :pagination="false" row-key="id">
        <template #columns>
          <a-table-column title="申请分类" data-index="newName" :width="180" />
          <a-table-column title="上级分类" :width="220">
            <template #cell="{ record }">{{ record.parentPath || '顶级分类' }}</template>
          </a-table-column>
          <a-table-column title="申请理由" data-index="reason" />
          <a-table-column title="状态" :width="100">
            <template #cell="{ record }"><a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag></template>
          </a-table-column>
          <a-table-column title="审核意见" :width="220">
            <template #cell="{ record }">{{ record.reviewComment || '-' }}</template>
          </a-table-column>
          <a-table-column title="申请时间" :width="180">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="审核时间" :width="180">
            <template #cell="{ record }">{{ formatTime(record.reviewedAt) }}</template>
          </a-table-column>
        </template>
      </a-table>
    </a-card>

    <div v-if="total > size" class="pagination">
      <a-pagination :total="total" :current="current" :page-size="size" show-total @change="(p: number) => { current = p; load(); }" />
    </div>

    <a-modal v-model:visible="modalOpen" title="提交分类申请" :ok-loading="submitting" @ok="submit">
      <a-form :model="form" layout="vertical">
        <a-form-item label="上级分类">
          <a-cascader
            v-model="form.parentPath"
            :options="categoryOptions"
            placeholder="不选择则申请顶级分类"
            check-strictly
            allow-clear
          />
          <div v-if="categoryLoadError" class="form-hint">{{ categoryLoadError }} <a-link @click="loadCategories">重新加载</a-link></div>
        </a-form-item>
        <a-form-item label="新分类名称" required>
          <a-input v-model="form.newName" :max-length="50" placeholder="请输入分类名称" />
        </a-form-item>
        <a-form-item label="申请理由" required>
          <a-textarea v-model="form.reason" :max-length="500" :rows="4" show-word-limit />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.page { padding-top: 16px; }
.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-head h1 { margin: 0 0 6px; font-size: 20px; }
.page-head p { margin: 0; color: #86909c; font-size: 13px; }
.filter-card { margin-bottom: 12px; }
.pagination { display: flex; justify-content: center; margin-top: 16px; }
</style>
