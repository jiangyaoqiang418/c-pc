<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { fetchBrandDetail, fetchMyBrandApplications, submitBrandApplication } from '@/service/api/brand';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { Message } from '@/lib/feedback';

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ selected: [brand: Api.RealBrand.BrandDTO] }>();
const user = useUserStore();
const open = ref(false);
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const rows = ref<Api.RealBrand.Application[]>([]);
const pageNo = ref(1);
const total = ref(0);
const filter = reactive({ keyword: '', status: '' as '' | Api.RealBrand.ApplyStatus });
const form = reactive({ newName: '', reason: '' });
function time(value?: string) { if (!value) return '—'; const date = new Date(Number(value)); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}); }
const labels = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const guard = createLatestRequestGuard(() => user.sessionVersion);
let alive = true;
let choosing = false;
async function load() {
  if (!open.value || !user.isBuyerActive) return;
  const current = guard.begin(); loading.value = true; error.value = '';
  try {
    const data = await fetchMyBrandApplications({ pageNo: pageNo.value, pageSize: 10, keyword: filter.keyword.trim() || undefined, status: filter.status || undefined }, current.signal);
    if (current()) { rows.value = data.records; total.value = data.total; }
  } catch (e) { if (current()) error.value = e instanceof Error ? e.message : '品牌申请读取失败'; }
  finally { if (current()) loading.value = false; }
}
async function submit() {
  if (submitting.value || !user.isBuyerActive) return;
  const newName = form.newName.trim(), reason = form.reason.trim();
  if (!newName || newName.length > 64 || !reason || reason.length > 500) { Message.warning('请填写品牌名称（最多64字）和申请理由（最多500字）'); return; }
  if (rows.value.some(row => row.status === 'PENDING' && row.newName.toLocaleLowerCase() === newName.toLocaleLowerCase())) { Message.warning('该品牌已有待审核申请，请等待审核'); return; }
  const session = user.sessionVersion;
  submitting.value = true; error.value = '';
  try {
    await submitBrandApplication(newName, reason);
    if (!alive || session !== user.sessionVersion) return;
    form.newName = ''; form.reason = ''; pageNo.value = 1;
    Message.success('品牌申请已提交，审核通过后可选择'); await load();
  } catch (e) { if (alive && session === user.sessionVersion) error.value = `${e instanceof Error ? e.message : '申请暂未确认'}。请先刷新申请记录确认后再提交。`; }
  finally { if (alive && session === user.sessionVersion) submitting.value = false; }
}
async function choose(row: Api.RealBrand.Application) {
  if (choosing || row.status !== 'APPROVED' || row.createdBrandId == null) return;
  const session = user.sessionVersion; choosing = true;
  try {
    const brand = await fetchBrandDetail(row.createdBrandId);
    if (alive && session === user.sessionVersion && open.value) { emit('selected', brand); open.value = false; }
  } catch (e) { if (alive && session === user.sessionVersion) error.value = e instanceof Error ? e.message : '品牌暂不可用'; }
  finally { choosing = false; }
}
watch(open, value => { if (value) { pageNo.value = 1; void load(); } else guard.invalidate(); });
watch(() => user.sessionVersion, () => { guard.invalidate(); open.value = false; rows.value = []; error.value = ''; submitting.value = false; form.newName = ''; form.reason = ''; });
onBeforeUnmount(() => { alive = false; guard.invalidate(); });
</script>

<template>
  <Button type="button" variant="outline" :disabled="disabled" @click="open = true">申请新增品牌 / 查看申请</Button>
  <a-modal v-model:visible="open" title="品牌申请" :footer="false" :mask-closable="!submitting" :closable="!submitting">
    <div class="brand-applications">
      <p>品牌独立于分类，审核通过后才能用于商品。</p>
      <label>品牌名称<Input v-model="form.newName" maxlength="64" :disabled="submitting" /></label>
      <label>申请理由<Textarea v-model="form.reason" maxlength="500" :disabled="submitting" /></label>
      <Button type="button" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '提交申请' }}</Button>
      <form class="filters" @submit.prevent="pageNo = 1; load()"><Input v-model="filter.keyword" aria-label="搜索品牌申请" placeholder="搜索品牌申请" /><select v-model="filter.status" aria-label="品牌申请状态"><option value="">全部状态</option><option v-for="(label, status) in labels" :key="status" :value="status">{{ label }}</option></select><Button type="submit" variant="outline" :disabled="loading">刷新</Button></form>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">正在读取申请…</p>
      <article v-for="row in rows" :key="String(row.id)"><strong>{{ row.newName }}</strong><span>{{ labels[row.status] }}</span><p>{{ row.reason }}</p><p>审核意见：{{ row.reviewComment || '—' }}</p><small>申请时间：{{ time(row.createdAt) }} · 审核时间：{{ time(row.reviewedAt) }}</small><Button v-if="row.status === 'APPROVED' && row.createdBrandId != null" type="button" variant="outline" @click="choose(row)">选用此品牌</Button><Button v-if="row.status === 'REJECTED'" type="button" variant="outline" :disabled="submitting" @click="form.newName = row.newName; form.reason = row.reason">重新填写</Button></article>
      <p v-if="!loading && !rows.length && !error">暂无申请记录</p>
      <BusinessPagination v-if="total > 10" :total="total" :current="pageNo" :page-size="10" :loading="loading" @change="(page: number) => { pageNo = page; load(); }" />
    </div>
  </a-modal>
</template>

<style scoped>
.brand-applications { display:grid; gap:12px; color:var(--ink); }
label { display:grid; gap:6px; } .filters { display:flex; flex-wrap:wrap; gap:8px; }
select { background:var(--paper); color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px; }
article { padding:12px 0; border-top:1px solid var(--line); overflow-wrap:anywhere; } article>span { margin-left:12px; color:var(--muted); } p { white-space:pre-wrap; }
</style>
