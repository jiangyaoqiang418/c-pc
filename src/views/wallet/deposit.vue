<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();
const activeTab = ref<'create' | 'address'>('create');
const amount = ref(100);
const chain = ref<'ETH' | 'TRON' | 'BSC'>('TRON');
const submitting = ref(false);
const loadingRecords = ref(false);
const currentRecharge = ref<Api.RealWallet.RechargeVO>();
const recentDeposits = ref<Api.RealWallet.RechargeVO[]>([]);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.RealWallet.RechargeVO>();

const chainOptions = [
  { value: 'TRON', label: 'TRC20（USDT-TRON）' },
  { value: 'ETH', label: 'ERC20（USDT-ETH）' },
  { value: 'BSC', label: 'BEP20（USDT-BSC）' }
] as const;

const statusColor = computed(() => (status?: string) => {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'CANCELED') return 'red';
  return 'orange';
});

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function getId(result: Api.RealWallet.RechargeVO | string | number) {
  return typeof result === 'object' ? result.id : result;
}

async function loadRecords() {
  loadingRecords.value = true;
  try {
    const result = await realWalletApi.fetchRechargePage({ pageNo: 1, pageSize: 10 });
    recentDeposits.value = result.records;
  } finally {
    loadingRecords.value = false;
  }
}

async function loadAll() {
  if (!userStore.currentUser) return;
  await Promise.all([walletStore.fetchWallet(userStore.currentUser.id), loadRecords()]);
}

async function createRecharge() {
  if (amount.value <= 0) {
    Message.warning('请输入正确的充值金额');
    return;
  }
  submitting.value = true;
  try {
    const created = await realWalletApi.createRecharge({ chain: chain.value, amount: amount.value });
    const id = getId(created);
    currentRecharge.value = typeof created === 'object' ? created : await realWalletApi.fetchRechargeDetail(id);
    if (!currentRecharge.value.depositAddress) {
      currentRecharge.value = await realWalletApi.fetchRechargeDetail(id);
    }
    activeTab.value = 'address';
    await loadRecords();
    Message.success('充值订单已创建，请按收款信息完成链上转账');
  } finally {
    submitting.value = false;
  }
}

async function copy(text?: string) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  Message.success('已复制');
}

async function showDetail(record: Api.RealWallet.RechargeVO) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  try {
    detail.value = await realWalletApi.fetchRechargeDetail(record.id);
  } finally {
    detailLoading.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <div class="deposit-page shop-container">
    <h1 class="page-title">钱包链上充值</h1>
    <p class="hint">创建充值订单后，按订单提供的链和收款信息完成 USDT 转账。</p>

    <a-card class="tab-card" :body-style="{ padding: '12px 24px 24px' }" :bordered="false">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="create" title="创建充值订单">
          <a-form :model="{ amount, chain }" layout="vertical" class="recharge-form">
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="充值金额 (USDT)">
                  <a-input-number v-model="amount" :min="0.01" :precision="2" size="large" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="链选择">
                  <a-select v-model="chain" size="large">
                    <a-option v-for="option in chainOptions" :key="option.value" :value="option.value">{{ option.label }}</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
            <a-alert type="warning" class="chain-alert" title="请务必使用所选链转账；到账状态以链上确认和平台审核结果为准。" />
            <a-button type="primary" size="large" :loading="submitting" @click="createRecharge">创建充值订单</a-button>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="address" title="订单收款信息">
          <template v-if="currentRecharge">
            <a-descriptions :column="1" bordered :data="[
              { label: '订单编号', value: String(currentRecharge.id) },
              { label: '充值链', value: currentRecharge.chain },
              { label: '充值金额', value: 'U ' + formatAmount(currentRecharge.amount) },
              { label: '订单状态', value: currentRecharge.statusText || currentRecharge.status || 'PENDING' },
              { label: '创建时间', value: formatTime(currentRecharge.createdAt) }
            ]" />
            <div class="address-block">
              <div class="address-label">收款地址</div>
              <div class="address-value">{{ currentRecharge.depositAddress || '后台暂未返回收款地址' }}</div>
              <a-button v-if="currentRecharge.depositAddress" size="small" @click="copy(currentRecharge.depositAddress)">复制地址</a-button>
            </div>
            <div v-if="currentRecharge.memo" class="address-block">
              <div class="address-label">Memo / Tag</div>
              <div class="address-value">{{ currentRecharge.memo }}</div>
              <a-button size="small" @click="copy(currentRecharge.memo)">复制 Memo</a-button>
            </div>
          </template>
          <EmptyState v-else title="请先创建充值订单以获取收款信息" />
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-card class="txn-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <div class="section-title">最近充值记录</div>
      <a-table :data="recentDeposits" :loading="loadingRecords" :pagination="false" row-key="id" :bordered="false">
        <template #columns>
          <a-table-column title="订单编号" data-index="id" :width="220" />
          <a-table-column title="链" data-index="chain" :width="120" />
          <a-table-column title="金额" :width="140">
            <template #cell="{ record }">U {{ formatAmount(record.amount) }}</template>
          </a-table-column>
          <a-table-column title="状态" :width="130">
            <template #cell="{ record }"><a-tag :color="statusColor(record.status)">{{ record.statusText || record.status || 'PENDING' }}</a-tag></template>
          </a-table-column>
          <a-table-column title="创建时间">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="操作" :width="90">
            <template #cell="{ record }"><a-button type="text" @click="showDetail(record)">详情</a-button></template>
          </a-table-column>
        </template>
        <template #empty><EmptyState title="暂无链上充值记录" /></template>
      </a-table>
    </a-card>

    <a-drawer v-model:visible="detailOpen" title="充值订单详情" width="520" :footer="false">
      <a-spin :loading="detailLoading" style="width: 100%">
        <a-descriptions v-if="detail" :column="1" bordered :data="[
          { label: '订单编号', value: String(detail.id) },
          { label: '链', value: detail.chain },
          { label: '金额', value: 'U ' + formatAmount(detail.amount) },
          { label: '状态', value: detail.statusText || detail.status || 'PENDING' },
          { label: '收款地址', value: detail.depositAddress || '—' },
          { label: 'Memo / Tag', value: detail.memo || '—' },
          { label: '交易哈希', value: detail.txHash || '—' },
          { label: '创建时间', value: formatTime(detail.createdAt) },
          { label: '确认时间', value: formatTime(detail.confirmedAt) }
        ]" />
      </a-spin>
    </a-drawer>
  </div>
</template>

<style scoped>
.deposit-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.hint { color: #86909c; font-size: 13px; margin: 0 0 16px; }
.tab-card, .txn-card { background: #fff; border-radius: var(--bw-card-radius); margin-bottom: 16px; }
.recharge-form { max-width: 720px; padding-top: 12px; }
.chain-alert { margin-bottom: 16px; }
.address-block { margin-top: 16px; padding: 16px; background: #f7f8fa; border-radius: 6px; }
.address-label { color: #86909c; font-size: 12px; margin-bottom: 8px; }
.address-value { color: #1d2129; font-family: var(--yb-font-mono); overflow-wrap: anywhere; margin-bottom: 12px; }
.section-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 14px; padding-left: 8px; border-left: 3px solid var(--bw-brand-primary); }
</style>
