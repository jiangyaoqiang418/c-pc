<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import DescriptionList from '@/components/common/description-list.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import * as buyerApi from '@/service/api/buyer';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { isDefinitiveRejection, RequestError } from '@/service/request/type';

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const submissionUnknown = ref(false);
const loadError = ref('');
const applicationLoaded = ref(false);
const application = ref<Api.RealBuyer.BuyerApplicationVO | null>();
const form = reactive<Api.RealBuyer.BuyerApplyParams>({
  realName: '',
  contact: '',
  reason: ''
});
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

const statusMeta = computed(() => {
  const status = application.value?.status;
  if (status === 'APPROVED') return { color: 'green', label: '审核通过', text: userStore.currentUser?.isBuyer ? '您已获得买手身份，请从个人中心进入买手中心。' : '申请已通过，正在核对账号买手权限；若仍未生效请重新加载。' };
  if (status === 'REJECTED') return { color: 'red', label: '审核未通过', text: application.value?.reviewRemark || '请调整申请资料后重新提交。' };
  return { color: 'orange', label: '审核中', text: '平台正在审核您的买手申请。' };
});

const canApply = computed(() => !submissionUnknown.value && applicationLoaded.value && !loading.value && !loadError.value
  && (!application.value || application.value.status === 'REJECTED'));

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

async function loadApplication() {
  applicationLoaded.value = false;
  const isCurrent = requestGuard.begin();
  const userId = String(userStore.currentUser?.id || '');
  if (!userId) {
    loading.value = false;
    application.value = undefined;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const nextApplication = await buyerApi.fetchBuyerApplication({ signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
    application.value = nextApplication;
    applicationLoaded.value = true;
    if (nextApplication?.status === 'APPROVED' && !userStore.currentUser?.isBuyer) {
      try {
        await userStore.refreshCurrentUser({ signal: isCurrent.signal });
        if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
        if (!userStore.currentUser?.isBuyer) loadError.value = '申请已通过，但账号权限尚未生效，请重新加载核对';
      } catch {
        if (!isCurrent()) return;
        loadError.value = '申请已通过，账号权限刷新失败，请重新加载';
      }
    }
    if (!application.value && userStore.currentUser) {
      form.contact = userStore.currentUser.phone || '';
    }
  } catch {
    if (!isCurrent()) return;
    application.value = undefined;
    loadError.value = '买手申请状态加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function submit() {
  if (submitting.value || !canApply.value) return;
  if (!form.realName.trim() || !form.contact.trim()) {
    Message.warning('请填写真实姓名和联系方式');
    return;
  }
  if (form.reason.trim().length < 10) {
    Message.warning('申请说明至少填写 10 个字');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    try {
      await buyerApi.submitBuyerApplication({
        realName: form.realName.trim(),
        contact: form.contact.trim(),
        reason: form.reason.trim()
      }, { showError: false });
      if (!isCurrentWrite()) return;
      Message.success('买手申请已提交');
      await loadApplication();
    } catch (error) {
      if (!isCurrentWrite()) return;
      const isBusinessRejection = error instanceof RequestError && error.response?.success === false;
      if (isDefinitiveRejection(error) || isBusinessRejection) {
        Message.error(error instanceof Error ? error.message : '申请被拒绝，请核对填写内容');
      }
      else {
        submissionUnknown.value = true;
        Message.warning('买手申请结果待核实，请重新读取申请状态；未确认前请勿再次提交');
      }
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}

onMounted(loadApplication);
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch(() => userStore.currentUser?.id, () => {
  writeVersion += 1;
  submitting.value = false;
  submissionUnknown.value = false;
  requestGuard.invalidate();
  application.value = undefined;
  loadError.value = '';
  form.realName = '';
  form.contact = '';
  form.reason = '';
  void loadApplication();
});


</script>

<template>
  <div class="buyer-apply-page shop-container">
    <header><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>申请成为买手</h1><p>提交后由平台审核。KYC 状态及买手资格以后台审核结果为准。</p></header>
    <Alert v-if="submissionUnknown" class="notice"><AlertDescription><p>上次申请结果待核实，本页已暂停重复提交。请读取申请状态；仍无法核实时联系平台，刷新页面不代表原申请失败。</p><Button variant="outline" size="sm" :disabled="loading" @click="loadApplication">{{ loading ? '正在核对…' : '核对申请状态' }}</Button></AlertDescription></Alert>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="error-row"><span>{{ loadError }}</span><Button variant="outline" size="sm" :disabled="loading" @click="loadApplication">重新加载</Button></AlertDescription></Alert>
    <div v-if="loading" class="paper loading" aria-busy="true" aria-label="正在读取申请状态"><Skeleton v-for="n in 4" :key="n" class="field-skeleton" /></div>
    <section v-else-if="application && !canApply" class="paper">
      <div class="status-head"><span class="status-tag" :class="application.status">{{ statusMeta.label }}</span><small>申请时间：{{ formatTime(application.appliedAt) }}</small></div><p class="status-text">{{ statusMeta.text }}</p>
      <DescriptionList :columns="2" :items="[{ label: '真实姓名', value: application.realName },{ label: '联系方式', value: application.contact },{ label: '审核时间', value: formatTime(application.reviewedAt) }]" /><div class="reason"><h2>申请说明</h2><p>{{ application.reason }}</p></div>
      <RouterLink v-if="application.status === 'APPROVED' && userStore.currentUser?.isBuyer" to="/buyer/dashboard" class="studio-link">进入买手工作台 →</RouterLink>
    </section>
    <form v-else class="paper apply-form" @submit.prevent="submit">
      <Alert v-if="application?.status === 'REJECTED'" variant="destructive"><AlertDescription>{{ statusMeta.text }}</AlertDescription></Alert>
      <div class="field"><Label for="buyer-real-name">真实姓名 <span>*</span></Label><Input id="buyer-real-name" v-model="form.realName" maxlength="64" autocomplete="name" placeholder="请输入真实姓名" :disabled="submitting || !canApply" /></div>
      <div class="field"><Label for="buyer-contact">联系方式 <span>*</span></Label><Input id="buyer-contact" v-model="form.contact" maxlength="64" placeholder="请输入手机号或常用联系方式" :disabled="submitting || !canApply" /></div>
      <div class="field"><Label for="buyer-reason">申请说明 <span>*</span></Label><Textarea id="buyer-reason" v-model="form.reason" maxlength="500" :rows="6" placeholder="至少 10 个字" :disabled="submitting || !canApply" /><small class="counter">{{ form.reason.length }}/500</small><p class="helper">请说明您的采购经验、可服务的品类或地区。</p></div>
      <Button type="submit" class="full" :disabled="!canApply || submitting">{{ submitting ? '正在提交…' : '提交申请' }}</Button>
    </form>
  </div>
</template>

<style scoped>
.buyer-apply-page { max-width:680px; margin:0 auto; display:grid; gap:22px; }header { text-align:center; padding:10px 0 8px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }h1 { font-size:28px; font-weight:650; margin:12px 0; }header p { color:var(--yb-muted); font-size:13px; line-height:1.8; margin:0; }.paper { padding:30px; border:1px solid var(--yb-hairline); background:var(--yb-surface); border-radius:12px; }.apply-form { display:grid; gap:23px; }.field { display:grid; gap:10px; }.field label>span { color:var(--yb-danger); }.counter { margin-top:-4px; text-align:right; color:var(--yb-muted); font-size:12px; }.helper { color:var(--yb-muted); font-size:12px; margin:0; }.full { width:100%; }.status-head { display:flex; justify-content:space-between; gap:15px; align-items:center; }.status-head small { color:var(--yb-muted); font-size:12px; }.status-tag { color:var(--yb-warning); background:color-mix(in srgb,var(--yb-warning) 10%,var(--yb-surface)); padding:5px 10px; border-radius:5px; font-size:13px; }.status-tag.APPROVED { color:var(--yb-success); background:var(--yb-success-soft); }.status-tag.REJECTED { color:var(--yb-danger); background:var(--yb-danger-soft); }.status-text { font-size:14px; line-height:1.9; margin:24px 0; }.reason { margin-top:25px; }.reason h2 { font-size:14px; color:var(--yb-muted); margin:0 0 12px; font-weight:500; }.reason p { white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; margin:0; }.studio-link { display:inline-flex; margin-top:28px; color:var(--yb-primary); font-size:14px; }.notice p { margin:0 0 14px; line-height:1.8; }.error-row { display:flex; justify-content:space-between; align-items:center; gap:16px; }.loading { display:grid; gap:25px; }.field-skeleton { height:55px; }@media(max-width:700px) { .paper { padding:22px; }.status-head { flex-wrap:wrap; } }
</style>
