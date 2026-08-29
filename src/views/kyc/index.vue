<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Message } from '@arco-design/web-vue';
import { enums } from '@shared';
import * as realKycApi from '@/service/api/kyc';
import { getAccessToken } from '@/service/request';
import IdCardUploader from '@/components/kyc/id-card-uploader.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const uploading = ref(false);
const kycDetail = ref<Api.RealKyc.KycVO | null>();
const loadError = ref('');
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

function toDisplayStatus(value?: string): Api.User.KycStatus {
  if (value === 'PASSED') return 'approved';
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
      description: '当前认证状态来自登录用户信息接口。'
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
      description: '当前接口未提供重新认证入口。'
    };
  }
  return {
    icon: 'lucide:user-round-search',
    title: '尚未提交 KYC 认证',
    description: '完成认证后可使用需要实名校验的功能；买手身份以平台审核结果为准。'
  };
});

const previewUrls = ref<Record<string, string>>({});
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
      const access = await realKycApi.refreshKycFileAccess(fileId, { signal });
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
    await userStore.refreshCurrentUser({ signal: isCurrent.signal });
    if (!isCurrent()) return;
    const userId = String(userStore.currentUser?.id || '');
    if (!userId) return;
    if (getAccessToken()) {
      try {
        const nextDetail = await realKycApi.fetchMyKycDetail({ signal: isCurrent.signal });
        if (!isCurrent() || String(userStore.currentUser?.id || '') !== userId) return;
        kycDetail.value = nextDetail;
        await refreshPrivatePreviews(kycDetail.value, isCurrent.signal, isCurrent);
      } catch {
        if (!isCurrent()) return;
        kycDetail.value = null;
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
  previewUrls.value = {};
  loadError.value = '';
  form.realName = '';
  form.idNo = '';
  form.idCardFrontFileId = '';
  form.idCardBackFileId = '';
  form.holdingPhotoFileId = '';
  void load();
});

async function submit() {
  if (submitting.value) return;
  if (!form.realName.trim() || !form.idNo.trim() || !form.idCardFrontFileId) {
    Message.warning('请填写真实姓名、证件号码并上传证件人像面');
    return;
  }
  if (form.idType === 'ID_CARD' && !form.idCardBackFileId) {
    Message.warning('身份证认证请上传证件国徽面');
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
    try {
      await realKycApi.submitKyc({
        ...form,
        realName: form.realName.trim(),
        idNo: form.idNo.trim(),
        nationality: form.nationality?.trim() || undefined
      });
    } catch {
      // 请求层已展示业务错误，保留表单供用户修正后重试。
      return;
    }
    if (!isCurrentWrite()) return;
    const [, userRefresh] = await Promise.allSettled([load(), userStore.refreshCurrentUser()]);
    if (!isCurrentWrite()) return;
    Message.success('实名认证已提交，请等待平台审核');
    if (userRefresh.status === 'rejected') {
      Message.warning('认证已提交，但账号状态刷新失败，请稍后重新加载');
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="kyc-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <a-card class="status-card" :body-style="{ padding: '32px' }" :bordered="false">
        <div class="status-head">
          <div class="status-icon" :data-status="status">
            <Icon :icon="statusView.icon" width="32" />
          </div>
          <div>
            <a-tag :color="meta.color" size="large">{{ meta.label }}</a-tag>
            <h1 class="status-title">{{ statusView.title }}</h1>
            <p class="status-sub">{{ statusView.description }}</p>
          </div>
        </div>

        <a-alert v-if="loadError" type="warning" class="load-alert" :closable="false">
          {{ loadError }}
          <template #action><a-button size="mini" @click="load">重新加载</a-button></template>
        </a-alert>

        <a-divider />

        <a-descriptions
          :column="2"
          :data="[
            { label: '当前账号', value: userStore.currentUser?.nickname || userStore.currentUser?.email || '—' },
            { label: '手机号', value: userStore.currentUser?.phone || '—' },
            { label: '账号身份', value: userStore.currentUser?.isBuyer ? '买手' : '顾客' },
            { label: '认证姓名', value: kycDetail?.realName || '—' },
            { label: '认证证件', value: kycDetail?.idNo || '—' },
            { label: '提交时间', value: formatTime(kycDetail?.submittedAt) },
            { label: '审核时间', value: formatTime(kycDetail?.reviewedAt) },
            { label: '证件地址有效期', value: formatTime(kycDetail?.photoUrlExpireAt) },
            { label: '状态来源', value: kycDetail ? '实名认证详情接口' : '当前用户信息接口' }
          ]"
        />
        <div v-if="Object.keys(previewUrls).length" class="private-previews">
          <div v-for="([key, url]) in Object.entries(previewUrls)" :key="key" class="private-preview">
            <span>{{ key === 'front' ? '证件人像面' : key === 'back' ? '证件国徽面' : '手持证件照' }}</span>
            <a-image :src="url" width="120" height="80" fit="cover" />
          </div>
        </div>

        <template v-if="status !== 'approved' && status !== 'pending'">
          <a-divider />
          <a-alert :type="status === 'rejected' ? 'error' : 'info'" :title="status === 'rejected' ? statusView.description : '请填写真实资料并上传清晰的证件图片；提交后由平台审核。'" />
          <a-form :model="form" layout="vertical" class="kyc-form">
            <a-row :gutter="16">
              <a-col :span="12"><a-form-item label="真实姓名" required><a-input v-model="form.realName" placeholder="请输入证件上的真实姓名" :max-length="64" /></a-form-item></a-col>
              <a-col :span="12"><a-form-item label="国籍"><a-input v-model="form.nationality" placeholder="如：中国" :max-length="64" /></a-form-item></a-col>
            </a-row>
            <a-row :gutter="16">
              <a-col :span="12"><a-form-item label="证件类型" required><a-select v-model="form.idType"><a-option value="ID_CARD">身份证</a-option><a-option value="PASSPORT">护照</a-option></a-select></a-form-item></a-col>
              <a-col :span="12"><a-form-item label="证件号码" required><a-input v-model="form.idNo" placeholder="请输入证件号码" :max-length="64" /></a-form-item></a-col>
            </a-row>
            <a-form-item label="证件图片" required extra="身份证须上传正反面；护照至少上传资料页。请勿上传与本人无关的证件。">
              <div class="uploaders">
                <IdCardUploader v-model="form.idCardFrontFileId" side="front" @uploading="uploading = $event" />
                <IdCardUploader v-if="form.idType === 'ID_CARD'" v-model="form.idCardBackFileId" side="back" @uploading="uploading = $event" />
                <IdCardUploader v-model="form.holdingPhotoFileId" side="face" @uploading="uploading = $event" />
              </div>
            </a-form-item>
            <div class="actions"><a-button type="primary" :loading="submitting" :disabled="uploading" @click="submit">提交认证</a-button></div>
          </a-form>
        </template>
      </a-card>
    </a-spin>
  </div>
</template>

<style scoped>
.kyc-page {
  padding-top: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.status-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.load-alert { margin-top: 20px; }
.private-previews { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; }
.private-preview { display: flex; flex-direction: column; gap: 6px; color: #4e5969; font-size: 12px; }
.status-head {
  display: flex;
  gap: 16px;
  align-items: center;
}
.status-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4e5969;
  background: #f2f3f5;
  flex-shrink: 0;
}
.status-icon[data-status='approved'] {
  color: #00b42a;
  background: #e8ffea;
}
.status-icon[data-status='pending'] {
  color: #ff7d00;
  background: #fff7e8;
}
.status-icon[data-status='rejected'] {
  color: #f53f3f;
  background: #ffece8;
}
.status-title {
  font-size: 18px;
  margin: 8px 0 4px;
}
.status-sub {
  margin: 0;
  color: #86909c;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.kyc-form { margin-top: 20px; }
.uploaders { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
</style>
