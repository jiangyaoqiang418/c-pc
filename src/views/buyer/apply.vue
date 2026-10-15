<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
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
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>申请成为买手</h1><p>买手身份、KYC 状态及发布资格以平台审核结果为准。</p></div></header>
    <Alert v-if="submissionUnknown" class="notice"><AlertDescription><p>上次申请结果待核实，本页已暂停重复提交。请读取申请状态；仍无法核实时联系平台，刷新页面不代表原申请失败。</p><Button class="outline" variant="outline" size="sm" :disabled="loading" @click="loadApplication">{{ loading ? '正在核对…' : '核对申请状态' }}</Button></AlertDescription></Alert>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="error-row"><span>{{ loadError }}</span><Button class="outline" variant="outline" size="sm" :disabled="loading" @click="loadApplication">重新加载</Button></AlertDescription></Alert>
    <div v-if="loading" class="paper loading" aria-busy="true" aria-label="正在读取申请状态"><Skeleton v-for="n in 4" :key="n" class="field-skeleton" /></div>
    <section v-else-if="application && !canApply" class="paper buyer-application">
      <div class="status-head"><span class="buyer-status" :class="application.status">{{ statusMeta.label }}</span><small>申请时间：{{ formatTime(application.appliedAt) }}</small></div><p class="status-text">{{ statusMeta.text }}</p>
      <dl class="buyer-dl"><dt>姓名</dt><dd>{{ application.realName }}</dd><dt>联系方式</dt><dd>{{ application.contact }}</dd><dt>申请说明</dt><dd>{{ application.reason }}</dd><dt>审核时间</dt><dd>{{ formatTime(application.reviewedAt) }}</dd></dl>
      <RouterLink v-if="application.status === 'APPROVED' && userStore.currentUser?.isBuyer" to="/buyer/dashboard" class="primary">进入买手工作台 →</RouterLink>
    </section>
    <form v-else class="paper buyer-application apply-form" @submit.prevent="submit">
      <Alert v-if="application?.status === 'REJECTED'" variant="destructive"><AlertDescription>{{ statusMeta.text }}</AlertDescription></Alert>
      <div class="buyer-field"><Label for="buyer-real-name">真实姓名 <span>*</span></Label><Input id="buyer-real-name" v-model="form.realName" maxlength="64" autocomplete="name" placeholder="请输入真实姓名" :disabled="submitting || !canApply" /></div>
      <div class="buyer-field"><Label for="buyer-contact">联系方式 <span>*</span></Label><Input id="buyer-contact" v-model="form.contact" maxlength="64" placeholder="请输入手机号或常用联系方式" :disabled="submitting || !canApply" /></div>
      <div class="buyer-field"><Label for="buyer-reason">申请说明 <span>*</span></Label><Textarea id="buyer-reason" v-model="form.reason" maxlength="500" :rows="6" placeholder="至少 10 个字" :disabled="submitting || !canApply" /><small class="counter">{{ form.reason.length }}/500</small><p class="helper">请说明您的采购经验、可服务的品类或地区。</p></div>
      <Button type="submit" class="full primary" :disabled="!canApply || submitting">{{ submitting ? '正在提交…' : '提交申请' }}</Button>
    </form>
  </div>
</template>

<style scoped>
.apply-form { display:grid; gap:20px; }
.counter { text-align:right; color:var(--muted); }
.status-head,.error-row { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.status-text { margin:20px 0; }
.buyer-dl dd { white-space:pre-wrap; overflow-wrap:anywhere; }
.notice p { margin-bottom:14px; }
.loading { display:grid; gap:20px; }
.field-skeleton { height:55px; }
</style>
