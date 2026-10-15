<script setup lang="ts">
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import DescriptionList from '@/components/common/description-list.vue';
import ImagePreview from '@/components/common/image-preview.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useUnsavedForm } from '@/composables/use-unsaved-form';
import { Icon } from '@iconify/vue';
import { Message } from '@/lib/feedback';
import { enums } from '@shared';
import * as realKycApi from '@/service/api/kyc';
import { getAccessToken } from '@/service/request';
import IdCardUploader from '@/components/kyc/id-card-uploader.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { parseDateValue } from '@/utils/date-range';

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const uploadStates = reactive({ front: false, back: false, holding: false });
const uploading = computed(() => Object.values(uploadStates).some(Boolean));
const uploadContext = computed(() => `${String(userStore.currentUser?.id)}:${form.idType}`);
const kycDetail = ref<Api.RealKyc.KycVO | null>();
const schema = ref<Api.RealKyc.Schema>();
const loadError = ref('');
const formDisabled = computed(() => submitting.value || loading.value || !!loadError.value || !schema.value
  || status.value === 'pending' || status.value === 'approved'
  || (status.value === 'rejected' && !schema.value.resubmitAfterRejectAllowed));
const form = reactive<Api.RealKyc.SubmitParams>({
  realName: '',
  idType: 'ID_CARD',
  idNo: '',
  idCardFrontFileId: '',
  idCardBackFileId: '',
  holdingPhotoFileId: '',
  nationality: '中国'
});
const requestGuard = createLatestRequestGuard();
const { markInteracted, markSaved } = useUnsavedForm(() => form, () => userStore.currentUser?.id);

function toDisplayStatus(value?: string): Api.User.KycStatus {
  if (value === 'PASSED') {
    const expiry = parseDateValue(kycDetail.value?.expireAt);
    return expiry !== undefined && expiry <= Date.now() ? 'expired' : 'approved';
  }
  if (value === 'PENDING') return 'pending';
  if (value === 'REJECTED') return 'rejected';
  return userStore.currentUser?.kycStatus || 'none';
}

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

const status = computed<Api.User.KycStatus>(() => toDisplayStatus(kycDetail.value?.status));
const meta = computed(() => enums.KYC_STATUS_META[status.value]);
const statusView = computed(() => {
  if (status.value === 'approved') {
    return {
      icon: 'lucide:badge-check',
      title: '您已通过 KYC 实名认证',
      description: '账号认证已通过，认证资料可在下方查看。'
    };
  }
  if (status.value === 'pending') {
    return {
      icon: 'lucide:clock-3',
      title: '您的认证正在审核中',
      description: '审核进度以平台返回的最新状态为准。'
    };
  }
  if (status.value === 'rejected') {
    return {
      icon: 'lucide:circle-x',
      title: '您的认证未通过审核',
      description: kycDetail.value?.reviewRemark || '认证未通过，请按审核意见补充资料。'
    };
  }
  if (status.value === 'expired') {
    return {
      icon: 'lucide:calendar-x-2',
      title: 'KYC 认证已过期',
      description: '请按当前认证配置重新提交资料。'
    };
  }
  return {
    icon: 'lucide:user-round-search',
    title: '尚未提交 KYC 认证',
    description: '完成认证后可使用需要实名校验的功能；买手身份以平台审核结果为准。'
  };
});

const previewUrls = ref<Record<string, string>>({});
const previewKeys = computed(() => {
  const detail = kycDetail.value;
  if (!detail) return [];
  return [
    'front',
    ...(detail.idCardBack || detail.idCardBackFileId || schema.value?.idCardBackRequired ? ['back'] : []),
    ...(detail.holdingPhoto || detail.holdingPhotoFileId || schema.value?.holdingPhotoRequired ? ['holding'] : [])
  ];
});
let writeVersion = 0;

async function refreshPrivatePreviews(detail: Api.RealKyc.KycVO | null, signal?: AbortSignal, isCurrent?: () => boolean) {
  previewUrls.value = {};
  if (!detail) return;
  const entries = [
    ['front', detail.idCardFrontFileId],
    ['back', detail.idCardBackFileId],
    ['holding', detail.holdingPhotoFileId]
  ] as const;
  const results = await Promise.all(entries.map(async ([key, fileId]) => {
    if (!fileId) return [key, ''] as const;
    try {
      // 单个私有文件不可用时由页面保留无预览状态；避免请求层再弹出脱离上下文的全局错误。
      const access = await realKycApi.refreshKycFileAccess(fileId, { signal, showError: false });
      return [key, access.url] as const;
    } catch {
      return [key, ''] as const;
    }
  }));
  if (!isCurrent || isCurrent()) previewUrls.value = Object.fromEntries(results.filter(([, url]) => url));
}

async function load() {
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    await userStore.init();
    await userStore.refreshCurrentUser({ signal: isCurrent.signal, deferAccount: true });
    if (!isCurrent()) return;
    const userId = String(userStore.currentUser?.id || '');
    if (!userId) return;
    if (getAccessToken()) {
      try {
        // 页面已有可重试的资料读取错误态，避免请求层重复弹出后端文件错误。
        const [nextDetail, nextSchema] = await Promise.all([
          realKycApi.fetchMyKycDetail({ signal: isCurrent.signal, showError: false }),
          realKycApi.fetchKycSchema({ signal: isCurrent.signal, showError: false })
        ]);
        if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
        kycDetail.value = nextDetail;
        schema.value = nextSchema;
        if (!form.realName && !form.idNo && !nextSchema.allowedIdTypes.includes(form.idType)) form.idType = nextSchema.allowedIdTypes[0];
        void refreshPrivatePreviews(kycDetail.value, isCurrent.signal, isCurrent);
      } catch {
        if (!isCurrent()) return;
        kycDetail.value = null;
        schema.value = undefined;
        loadError.value = '实名认证资料加载失败，当前状态以账号信息为准。请稍后重试。';
      }
    }
  } catch {
    if (!isCurrent()) return;
    loadError.value = '实名认证信息加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch(() => userStore.currentUser?.id, () => {
  writeVersion += 1;
  submitting.value = false;
  requestGuard.invalidate();
  kycDetail.value = null;
  schema.value = undefined;
  previewUrls.value = {};
  loadError.value = '';
  form.realName = '';
  form.idNo = '';
  form.idCardFrontFileId = '';
  form.idCardBackFileId = '';
  form.holdingPhotoFileId = '';
  form.idType = 'ID_CARD';
  form.nationality = '中国';
  Object.assign(uploadStates, { front: false, back: false, holding: false });
  void load();
});

watch(() => form.idType, () => {
  form.idNo = '';
  form.idCardFrontFileId = '';
  form.idCardBackFileId = '';
  form.holdingPhotoFileId = '';
  Object.assign(uploadStates, { front: false, back: false, holding: false });
});

async function submit() {
  if (formDisabled.value) return;
  const issue = realKycApi.kycSubmissionIssue(schema.value, form, status.value);
  if (issue) {
    Message.warning(issue);
    return;
  }
  if (uploading.value) {
    Message.warning('证件图片上传中，请稍候');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    const snapshot = { ...form, realName: form.realName.trim(), idNo: form.idNo.trim(), nationality: form.nationality?.trim() || undefined };
    try {
      const latest = await realKycApi.fetchKycSchema({ showError: false });
      if (!isCurrentWrite()) return;
      const changed = schema.value?.version !== latest.version;
      schema.value = latest;
      const latestIssue = realKycApi.kycSubmissionIssue(latest, snapshot, status.value);
      if (latestIssue || changed) {
        Message.warning(latestIssue || '认证配置已更新，请核对资料后重新提交');
        return;
      }
      await realKycApi.submitKyc(snapshot);
    } catch (error) {
      if (!isCurrentWrite()) return;
      Message.warning(error instanceof Error ? error.message : '认证提交未完成，请核对后重试');
      try {
        const latest = await realKycApi.fetchKycSchema({ showError: false });
        if (isCurrentWrite()) schema.value = latest;
      } catch {
        if (isCurrentWrite()) { schema.value = undefined; loadError.value = '认证配置读取失败，草稿已保留，请重新加载'; }
      }
      return;
    }
    if (!isCurrentWrite()) return;
    markSaved();
    let refreshFailed = false;
    try {
      // load() 已包含一次带取消信号的当前用户刷新，避免重复并发刷新造成旧状态覆盖。
      await load();
    } catch {
      refreshFailed = true;
    }
    if (!isCurrentWrite()) return;
    Message.success('实名认证已提交，请等待平台审核');
    if (refreshFailed || loadError.value) {
      Message.warning('认证已提交，但账号状态刷新失败，请稍后重新加载');
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}


const previewVisible = ref(false);
const previewIndex = ref(0);
const previewImages = computed(() => previewKeys.value.map(key => previewUrls.value[key]).filter(Boolean));
function previewPrivate(url: string) {
  previewIndex.value = Math.max(0, previewImages.value.indexOf(url));
  previewVisible.value = true;
}
watch(() => userStore.currentUser?.id, () => { previewVisible.value = false; });
const submitDisabledReason = computed(() => {
  if (uploading.value) return '证件图片正在上传，请稍候';
  if (submitting.value) return '认证资料正在提交，请稍候';
  if (loading.value) return '正在读取认证配置';
  if (loadError.value || !schema.value) return '认证配置暂不可用，请重新加载';
  if (status.value === 'rejected' && !schema.value.resubmitAfterRejectAllowed) return '当前配置不允许驳回后重新提交，请联系平台';
  if (status.value === 'approved') return '认证已通过，无需重复提交';
  if (status.value === 'pending') return '认证正在审核中';
  return '';
});
</script>

<template>
  <div class="kyc-page v47-kyc">

    <div v-if="loading" class="skeletons"><Skeleton class="h-40" /><Skeleton class="h-56" /></div>
    <section v-else class="paper narrow"><h1>实名认证</h1><p class="kyc-intro">认证资料、必填项和重新提交条件以平台当前配置为准。</p>
      <header class="status-head"><div class="status-icon" :data-status="status"><Icon :icon="statusView.icon" width="32" /></div><div><span class="status-tag" :class="meta.color">{{ meta.label }}</span><h2>{{ statusView.title }}</h2><p>{{ statusView.description }}</p></div></header>
      <div v-if="loadError" class="status-banner notice warning" role="alert"><Icon icon="lucide:triangle-alert" /><span>{{ loadError }}<div class="notice-actions"><button :disabled="submitting" @click="load" class="outline">重新加载</button></div></span></div>
      <DescriptionList :columns="2" :items="[{ label: '当前账号', value: userStore.currentUser?.nickname || userStore.currentUser?.email || '—' }, { label: '手机号', value: userStore.currentUser?.phone || '—' }, { label: '账号身份', value: userStore.currentUser?.isBuyer ? '买手' : '顾客' }, { label: '认证姓名', value: kycDetail?.realName || '—' }, { label: '认证证件', value: kycDetail?.idNo || '—' }, { label: '提交时间', value: formatTime(kycDetail?.submittedAt) }, { label: '审核时间', value: formatTime(kycDetail?.reviewedAt) }, { label: '证件预览有效期', value: formatTime(kycDetail?.photoUrlExpireAt) }]" />
      <div v-if="kycDetail" class="private-previews"><div v-for="key in previewKeys" :key="key" class="private-preview"><span>{{ key === 'front' ? '证件人像面' : key === 'back' ? '证件国徽面' : '手持证件照' }}</span><button v-if="previewUrls[key]" type="button" :aria-label="key === 'front' ? '预览证件人像面' : key === 'back' ? '预览证件国徽面' : '预览手持证件照'" @click="previewPrivate(previewUrls[key])"><img :src="previewUrls[key]" :alt="key === 'front' ? '证件人像面' : key === 'back' ? '证件国徽面' : '手持证件照'" @error="previewUrls[key] = ''" /><Icon icon="lucide:expand" width="16" /></button><span v-else class="preview-unavailable">暂无可用预览</span></div></div>
      <template v-if="status !== 'approved' && status !== 'pending'">
        <div class="form-divider"></div>
        <div class="status-banner notice" role="alert"><Icon :icon="status === 'rejected' ? 'lucide:circle-alert' : 'lucide:info'" /><span>{{ status === 'rejected' ? statusView.description : '请填写真实资料并上传清晰的证件图片；提交后由平台审核。' }}</span></div>
        <div v-if="schema?.noticeText" class="status-banner notice" role="alert"><Icon icon="lucide:info" /><span>{{ schema.noticeText }}</span></div>
        <div v-if="status === 'rejected' && schema && !schema.resubmitAfterRejectAllowed" class="status-banner notice warning" role="alert"><Icon icon="lucide:triangle-alert" /><span>当前配置不允许驳回后重新提交，请联系平台。</span></div>
        <form class="kyc-form" novalidate @submit.prevent="submit" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
          <div class="fields"><div class="field"><Label for="kyc-real-name">真实姓名 <span class="required">*</span></Label><Input id="kyc-real-name" v-model="form.realName" placeholder="请输入证件上的真实姓名" :maxlength="64" :disabled="formDisabled" /></div><div class="field"><Label for="kyc-nationality">国籍 <span v-if="schema?.nationalityRequired" class="required">*</span></Label><Input id="kyc-nationality" v-model="form.nationality" placeholder="如：中国" :maxlength="64" :disabled="formDisabled" /></div><div class="field"><Label for="kyc-id-type">证件类型 <span class="required">*</span></Label><Select v-model="form.idType" :disabled="formDisabled"><SelectTrigger id="kyc-id-type"><SelectValue placeholder="请选择证件类型" /></SelectTrigger><SelectContent><SelectItem v-for="type in schema?.allowedIdTypes || []" :key="type" :value="type">{{ type === 'ID_CARD' ? '身份证' : type === 'PASSPORT' ? '护照' : type }}</SelectItem></SelectContent></Select></div><div class="field"><Label for="kyc-id-number">证件号码 <span class="required">*</span></Label><Input id="kyc-id-number" v-model="form.idNo" placeholder="请输入证件号码" :maxlength="64" :disabled="formDisabled" /></div></div>
          <div class="upload-section"><h3>证件图片 <span class="required">*</span></h3><p>资料页必填；背面{{ schema?.idCardBackRequired ? '必填' : '选填' }}；手持照{{ schema?.holdingPhotoRequired ? '必填' : '选填' }}。请勿上传与本人无关的证件。</p><div class="uploaders"><IdCardUploader v-model="form.idCardFrontFileId" :context-key="uploadContext" :disabled="formDisabled" :label="form.idType === 'PASSPORT' ? '护照资料页' : '身份证人像面'" side="front" @uploading="uploadStates.front = $event" /><IdCardUploader v-model="form.idCardBackFileId" :context-key="uploadContext" :disabled="formDisabled" label="证件背面" side="back" @uploading="uploadStates.back = $event" /><IdCardUploader v-model="form.holdingPhotoFileId" :context-key="uploadContext" :disabled="formDisabled" side="face" @uploading="uploadStates.holding = $event" /></div></div>
          <footer class="actions"><Tooltip><TooltipTrigger as-child><span tabindex="0"><button type="submit" :disabled="uploading || formDisabled" class="primary">{{ submitting ? '正在提交…' : '提交认证' }}</button></span></TooltipTrigger><TooltipContent v-if="uploading || formDisabled">{{ submitDisabledReason }}</TooltipContent></Tooltip></footer>
        </form>
      </template>
    </section>
    <ImagePreview v-model="previewVisible" :images="previewImages" :start-index="previewIndex" />
  </div>
</template>

<style scoped>
.kyc-page { padding-bottom:48px; }
.kyc-intro { margin-bottom:22px; font-size:13px; color:var(--muted); }
.skeletons { display:grid; gap:22px; max-width:670px; margin:20px auto; }
.status-head { display:flex; gap:18px; align-items:center; border-bottom:1px solid var(--line); margin-bottom:22px; padding-bottom:22px; }
.status-icon { display:grid; place-items:center; width:54px; height:54px; border-radius:10px; background:var(--soft); color:var(--green); flex-shrink:0; }
.status-icon[data-status='rejected'],.status-icon[data-status='expired'] { color:var(--yb-danger); background:color-mix(in srgb,var(--yb-danger) 10%,var(--paper)); }
.status-head h2 { font-size:21px; margin:8px 0; }
.status-head p { color:var(--muted); font-size:13px; }
.status-tag { padding:4px 9px; border-radius:5px; font-size:12px; background:var(--soft); color:var(--muted); }
.status-tag.green { color:var(--yb-success); }.status-tag.red { color:var(--yb-danger); }.status-tag.orange { color:var(--yb-warning); }
.notice { margin-bottom:20px; align-items:flex-start; flex-wrap:wrap; }
.notice>span { flex:1; min-width:160px; }
.notice-actions { margin-top:12px; }
.private-previews { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; margin-top:24px; }
.private-preview { display:grid; gap:10px; min-width:0; font-size:12px; color:var(--muted); }
.private-preview button,.preview-unavailable { width:100%; aspect-ratio:1.6; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--soft); }
.private-preview button { position:relative; }.private-preview img { width:100%; height:100%; object-fit:cover; }
.private-preview button svg { position:absolute; right:10px; bottom:10px; padding:3px; background:var(--paper); color:var(--ink); border-radius:4px; }
.preview-unavailable { display:grid; place-items:center; font-size:12px; }
.form-divider { height:1px; background:var(--line); margin:28px 0; }
.fields,.uploaders { display:grid; grid-template-columns:1fr; }
.required { color:var(--yb-danger); }
.upload-section { margin-top:24px; }
.upload-section h3 { font-size:16px; margin-bottom:10px; }
.upload-section>p { font-size:13px; color:var(--muted); margin-bottom:18px; }
.uploaders { gap:20px; }
.actions { margin-top:24px; }.actions>span,.actions :deep(button) { width:100%; }
.field :deep(input),.field :deep(button[role='combobox']) { height:auto; min-height:44px; padding:12px 14px; border:1px solid var(--line); border-radius:6px; background:var(--paper); box-shadow:none; }
@media(max-width:700px) { .private-previews { grid-template-columns:1fr; }.status-head { align-items:flex-start; }.status-head h2 { font-size:20px; } }
</style>
