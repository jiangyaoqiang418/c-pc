<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();
const form = reactive<Api.RealWallet.WithdrawCreateParams>({ chain: 'TRON', toAddress: '', amount: 0 });
const submitting = ref(false);
const modalOpen = ref(false);
const loadingRecords = ref(false);
const recentWithdrawals = ref<Api.RealWallet.WithdrawVO[]>([]);
const createdWithdrawal = ref<Api.RealWallet.WithdrawVO>();
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.RealWallet.WithdrawVO>();

const chainOptions = [
  { value: 'TRON', label: 'TRC20（USDT-TRON）' },
  { value: 'ETH', label: 'ERC20（USDT-ETH）' },
  { value: 'BSC', label: 'BEP20（USDT-BSC）' }
] as const;

const available = computed(() => Number(walletStore.account?.available || 0));
const errMsg = computed(() => {
  if (form.amount <= 0) return '请输入转出金额';
  if (form.amount < 10) return '单笔最小转出 10 U';
  if (!form.toAddress) return '请输入目标地址';
  if (form.toAddress.length < 26) return '地址格式不合法';
  if (form.amount > available.value) return '可用余额不足';
  return '';
});
const canSubmit = computed(() => !errMsg.value);
const kycTipNeeded = computed(() => userStore.currentUser && userStore.currentUser.kycStatus !== 'approved');

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function getId(result: Api.RealWallet.WithdrawVO | string | number) {
  return typeof result === 'object' ? result.id : result;
}

async function loadRecords() {
  loadingRecords.value = true;
  try {
    const result = await realWalletApi.fetchWithdrawPage({ pageNo: 1, pageSize: 10 });
    recentWithdrawals.value = result.records;
  } finally {
    loadingRecords.value = false;
  }
}

async function loadAll() {
  if (!userStore.currentUser) return;
  await Promise.all([walletStore.fetchWallet(userStore.currentUser.id), loadRecords()]);
}

function fillAll() {
  form.amount = Math.max(0, available.value);
}

function openConfirm() {
  if (!canSubmit.value) {
    Message.warning(errMsg.value || '请完善表单');
    return;
  }
  modalOpen.value = true;
}

async function confirm() {
  submitting.value = true;
  try {
    const created = await realWalletApi.createWithdraw({ ...form, toAddress: form.toAddress.trim() });
    const id = getId(created);
    createdWithdrawal.value = typeof created === 'object' ? created : await realWalletApi.fetchWithdrawDetail(id);
    modalOpen.value = false;
    Message.success('转出申请已提交，请等待平台审核');
    await Promise.all([walletStore.refetch(), loadRecords()]);
  } finally {
    submitting.value = false;
  }
}

async function showDetail(record: Api.RealWallet.WithdrawVO) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  try {
    detail.value = await realWalletApi.fetchWithdrawDetail(record.id);
  } finally {
    detailLoading.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <div class="withdraw-page shop-container">
    <h1 class="page-title">钱包转出</h1>
    <p class="hint">将平台可用余额提取到链上 USDT 钱包，到账状态以平台审核和链上确认结果为准。</p>

    <a-alert v-if="kycTipNeeded" type="warning" closable class="kyc-alert">
      您尚未完成 KYC 认证，实际审核结果请以后台规则为准。
      <template #action><a-button size="mini" @click="router.push('/kyc')">前往 KYC</a-button></template>
    </a-alert>

    <a-card class="form-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
      <div class="balance-row"><span class="balance-label">可用余额</span><span class="balance-amount">U {{ formatAmount(available.toFixed(2)) }}</span></div>
      <a-divider />
      <a-form :model="form" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="选择链 / 币种"><a-select v-model="form.chain" size="large"><a-option v-for="option in chainOptions" :key="option.value" :value="option.value">{{ option.label }}</a-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="转出金额 (USDT)"><a-input-number v-model="form.amount" :min="0" :max="available" :precision="2" size="large"><template #suffix>U</template><template #append><a-button size="mini" type="text" @click="fillAll">全部</a-button></template></a-input-number></a-form-item></a-col>
        </a-row>
        <a-form-item label="目标地址"><a-input v-model="form.toAddress" placeholder="请输入所选链对应的 USDT 地址" size="large" /></a-form-item>
        <div v-if="errMsg" class="err">{{ errMsg }}</div>
        <a-button type="primary" size="large" long :disabled="!canSubmit" @click="openConfirm">提交转出申请</a-button>
      </a-form>
    </a-card>

    <a-card v-if="createdWithdrawal" class="result-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <div class="section-title">最新转出申请</div>
      <a-descriptions :column="2" :data="[
        { label: '申请编号', value: String(createdWithdrawal.id) },
        { label: '状态', value: createdWithdrawal.statusText || createdWithdrawal.status || 'REVIEWING' },
        { label: '金额', value: 'U ' + formatAmount(createdWithdrawal.amount) },
        { label: '创建时间', value: formatTime(createdWithdrawal.createdAt) }
      ]" />
    </a-card>

    <a-card class="records-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <div class="section-title">最近转出申请</div>
      <a-table :data="recentWithdrawals" :loading="loadingRecords" :pagination="false" row-key="id" :bordered="false">
        <template #columns>
          <a-table-column title="申请编号" data-index="id" :width="220" />
          <a-table-column title="链" data-index="chain" :width="120" />
          <a-table-column title="金额" :width="130"><template #cell="{ record }">U {{ formatAmount(record.amount) }}</template></a-table-column>
          <a-table-column title="状态" :width="140"><template #cell="{ record }"><a-tag :color="record.status === 'SUCCESS' ? 'green' : record.status === 'REJECTED' ? 'red' : 'orange'">{{ record.statusText || record.status || 'REVIEWING' }}</a-tag></template></a-table-column>
          <a-table-column title="创建时间"><template #cell="{ record }">{{ formatTime(record.createdAt) }}</template></a-table-column>
          <a-table-column title="操作" :width="90"><template #cell="{ record }"><a-button type="text" @click="showDetail(record)">详情</a-button></template></a-table-column>
        </template>
        <template #empty><EmptyState title="暂无转出申请" /></template>
      </a-table>
    </a-card>

    <a-modal v-model:visible="modalOpen" title="确认提交转出申请" :ok-loading="submitting" ok-text="确认提交" @ok="confirm">
      <a-alert type="warning" class="confirm-alert" title="请确认目标地址与所选链一致，提交后将进入平台审核。" />
      <a-descriptions :column="1" :data="[
        { label: '链 / 币种', value: form.chain },
        { label: '转出金额', value: 'U ' + formatAmount(form.amount.toFixed(2)) },
        { label: '目标地址', value: form.toAddress }
      ]" />
    </a-modal>

    <a-drawer v-model:visible="detailOpen" title="转出申请详情" width="520" :footer="false">
      <a-spin :loading="detailLoading" style="width: 100%">
        <a-descriptions v-if="detail" :column="1" bordered :data="[
          { label: '申请编号', value: String(detail.id) },
          { label: '链', value: detail.chain },
          { label: '目标地址', value: detail.toAddress },
          { label: '金额', value: 'U ' + formatAmount(detail.amount) },
          { label: '状态', value: detail.statusText || detail.status || 'REVIEWING' },
          { label: '审核意见', value: detail.reviewComment || '—' },
          { label: '失败原因', value: detail.failReason || '—' },
          { label: '交易哈希', value: detail.txHash || '—' },
          { label: '创建时间', value: formatTime(detail.createdAt) },
          { label: '确认时间', value: formatTime(detail.confirmedAt) }
        ]" />
      </a-spin>
    </a-drawer>
  </div>
</template>

<style scoped>
.withdraw-page { padding-top: 16px; max-width: 880px; margin: 0 auto; }
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.hint { color: #86909c; font-size: 13px; margin: 0 0 16px; }
.kyc-alert, .form-card, .result-card { margin-bottom: 16px; }
.form-card, .result-card, .records-card { background: #fff; border-radius: var(--bw-card-radius); }
.balance-row { display: flex; justify-content: space-between; align-items: baseline; }
.balance-label { color: #4e5969; }
.balance-amount { font-size: 22px; font-weight: 700; color: var(--bw-brand-primary); font-family: ui-monospace, monospace; }
.err { color: #f53f3f; font-size: 12px; margin-bottom: 8px; }
.section-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 14px; padding-left: 8px; border-left: 3px solid var(--bw-brand-primary); }
.confirm-alert { margin-bottom: 16px; }
</style>
