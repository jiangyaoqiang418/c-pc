<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import * as buyerApi from '@/service/api/buyer';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { isDefinitiveRejection } from '@/service/request/type';

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
      if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '申请被拒绝，请核对填写内容');
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
    <h1 class="page-title">申请成为买手</h1>
    <p class="hint">提交后由平台审核。KYC 状态及买手资格以后台审核结果为准。</p>
    <a-alert v-if="submissionUnknown" type="warning" :closable="false">
      上次申请结果待核实，本页已暂停重复提交。请读取申请状态；仍无法核实时联系平台，刷新页面不代表原申请失败。
      <template #action><a-button :loading="loading" @click="loadApplication">核对申请状态</a-button></template>
    </a-alert>

    <a-spin :loading="loading">
      <a-alert v-if="loadError" type="error" class="reject-alert" :title="loadError">
        <template #action><a-button size="mini" @click="loadApplication">重新加载</a-button></template>
      </a-alert>
      <a-card v-if="application && !canApply" class="status-card" :body-style="{ padding: '24px 28px' }" :bordered="false">
        <div class="status-head">
          <a-tag :color="statusMeta.color" size="large">{{ statusMeta.label }}</a-tag>
          <span class="status-time">申请时间：{{ formatTime(application.appliedAt) }}</span>
        </div>
        <p class="status-text">{{ statusMeta.text }}</p>
        <a-descriptions :column="2" :data="[
          { label: '真实姓名', value: application.realName },
          { label: '联系方式', value: application.contact },
          { label: '审核时间', value: formatTime(application.reviewedAt) }
        ]" />
        <div class="reason-block">
          <span>申请说明</span>
          <p>{{ application.reason }}</p>
        </div>
      </a-card>

      <a-card v-else class="form-card" :body-style="{ padding: '24px 28px' }" :bordered="false">
        <a-alert v-if="application?.status === 'REJECTED'" type="error" class="reject-alert" :title="statusMeta.text" />
        <a-form :model="form" layout="vertical">
          <a-form-item label="真实姓名" required>
            <a-input v-model="form.realName" :max-length="64" placeholder="请输入真实姓名" />
          </a-form-item>
          <a-form-item label="联系方式" required>
            <a-input v-model="form.contact" :max-length="64" placeholder="请输入手机号或常用联系方式" />
          </a-form-item>
          <a-form-item label="申请说明" required extra="请说明您的采购经验、可服务的品类或地区。">
            <a-textarea v-model="form.reason" :max-length="500" show-word-limit :auto-size="{ minRows: 5, maxRows: 8 }" placeholder="至少 10 个字" />
          </a-form-item>
          <a-button type="primary" :disabled="!canApply" :loading="submitting" @click="submit">提交申请</a-button>
        </a-form>
      </a-card>
    </a-spin>
  </div>
</template>

<style scoped>
.buyer-apply-page {
  max-width: 820px;
  margin: 0 auto;
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.hint {
  margin: 0 0 16px;
  color: #86909c;
  font-size: 13px;
}
.status-card,
.form-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.status-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.status-time {
  color: #86909c;
  font-size: 13px;
}
.status-text {
  margin: 0 0 20px;
  color: #4e5969;
}
.reason-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f2f3f5;
  color: #4e5969;
  font-size: 13px;
}
.reason-block p {
  margin: 8px 0 0;
  color: #1d2129;
  white-space: pre-wrap;
}
.reject-alert {
  margin-bottom: 16px;
}
@media (max-width: 640px) {
  .buyer-apply-page { margin: 0; }
  .status-head { align-items: flex-start; flex-direction: column; gap: 6px; }
}
</style>
