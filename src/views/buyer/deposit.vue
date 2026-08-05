<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import DepositMeter from '@/components/buyer/deposit-meter.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as realOrderApi from '@/service/api/order';
import * as realWalletApi from '@/service/api/wallet';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();

const txns = ref<Api.Wallet.Txn[]>([]);
const orderCounts = ref<Record<string, number>>({});
const loading = ref(false);
const drawerOpen = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();
const account = computed(() => walletStore.account);

async function loadAll() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const [, txnRes, countsRes] = await Promise.all([
      walletStore.fetchWallet(userStore.currentUser.id),
      realWalletApi.fetchWalletLedgersByTypes({
        types: ['DEPOSIT_PLEDGE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT'],
        size: 20
      }),
      realOrderApi.countMySoldOrdersByStatus()
    ]);
    txns.value = txnRes.records;
    orderCounts.value = countsRes;
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

const guaranteedOrderCount = computed(() =>
  ['PROCURING', 'PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM', 'IN_AFTERSALE']
    .reduce((sum, status) => sum + Number(orderCounts.value[status] || 0), 0)
);
const depositUtilization = computed(() => {
  const available = Number(account.value?.depositAvailable || 0);
  const guaranteed = Number(account.value?.depositGuaranteed || 0);
  const total = available + guaranteed;
  return total > 0 ? ((guaranteed / total) * 100).toFixed(1) : '0.0';
});

function showDepositTransferUnavailable() {
  Message.info('买手押金充值与转出接口暂未提供');
}

function openTxn(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="deposit-page shop-container">
    <h1 class="page-title">押金管理</h1>

    <a-spin :loading="loading" style="width: 100%">
      <a-card v-if="account" class="hero-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
        <DepositMeter :available="account.depositAvailable" :guaranteed="account.depositGuaranteed" size="lg" />
        <a-divider />
        <a-alert type="info" class="alert">当前页面展示真实押金余额与流水，押金充值和转出需等待后台提供划转接口。</a-alert>
        <div class="actions">
          <a-button type="primary" @click="showDepositTransferUnavailable">充值押金</a-button>
          <a-button @click="showDepositTransferUnavailable">转出至钱包</a-button>
          <a-tooltip content="规则：在架商品需缴纳的最低押金 = 最贵商品单价。担保中订单完成后押金自动释放。">
            <a-button type="text">📖 规则说明</a-button>
          </a-tooltip>
        </div>
      </a-card>

      <a-card v-if="account" class="stat-card" :body-style="{ padding: '16px 24px' }" :bordered="false">
        <div class="section-title">担保中订单</div>
        <div class="stat-row">
          <div class="stat">
            <div class="stat-label">担保中订单数</div>
            <div class="stat-val">{{ guaranteedOrderCount }} 笔</div>
          </div>
          <div class="stat">
            <div class="stat-label">已担保押金</div>
            <div class="stat-val">U {{ formatAmount(account.depositGuaranteed || '0') }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">担保利用率</div>
            <div class="stat-val">
              {{ depositUtilization }}%
            </div>
          </div>
        </div>
      </a-card>

      <a-card class="txn-card" :body-style="{ padding: '16px 24px 0' }" :bordered="false">
        <div class="section-title">押金流水</div>
        <template v-if="txns.length">
          <TxnRow v-for="t in txns" :key="t.id" :txn="t" @detail="openTxn" />
        </template>
        <EmptyState v-else title="暂无押金流水" />
      </a-card>
    </a-spin>

    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.deposit-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.hero-card,
.stat-card,
.txn-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid #ff7d00;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.stat-label {
  font-size: 12px;
  color: #86909c;
}
.stat-val {
  font-size: 22px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #1d2129;
  margin-top: 4px;
}
.alert {
  margin-bottom: 16px;
}
</style>
