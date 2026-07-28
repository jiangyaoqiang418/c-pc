<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import { buyerApi, formatAmount, walletApi } from '@shared';
import { findAccount, moveBucket } from '@shared/mock/data/wallet-accounts';
import DepositMeter from '@/components/buyer/deposit-meter.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();

const profile = ref<Api.Buyer.BuyerProfile>();
const wallet = ref<Api.Buyer.Wallet>();
const txns = ref<Api.Wallet.Txn[]>([]);
const loading = ref(false);
const drawerOpen = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();

const rechargeOpen = ref(false);
const withdrawOpen = ref(false);
const opAmount = ref(0);
const opSubmitting = ref(false);

async function loadAll() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const [summary, txnRes] = await Promise.all([
      buyerApi.fetchBuyerDepositSummary(userStore.currentUser.id),
      walletApi.fetchMyTxns({
        userId: userStore.currentUser.id,
        types: ['DEPOSIT_PLEDGE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT'],
        size: 20
      })
    ]);
    profile.value = summary.profile;
    wallet.value = summary.wallet;
    txns.value = txnRes.records;
    await walletStore.fetchWallet(userStore.currentUser.id);
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

const availableInWallet = computed(() => Number(walletStore.account?.available || 0));

async function doRecharge() {
  if (opAmount.value <= 0) {
    Message.warning('请输入金额');
    return;
  }
  if (opAmount.value > availableInWallet.value) {
    Message.error('钱包余额不足');
    return;
  }
  if (!userStore.currentUser) return;
  opSubmitting.value = true;
  try {
    const acc = findAccount(userStore.currentUser.id);
    if (acc) {
      moveBucket({ account: acc, fromBucket: 'available', toBucket: 'depositAvailable', amount: opAmount.value.toFixed(2) });
      Message.success(`已充值 U ${opAmount.value.toFixed(2)} 至押金账户`);
      rechargeOpen.value = false;
      opAmount.value = 0;
      await loadAll();
    }
  } finally {
    opSubmitting.value = false;
  }
}

async function doWithdraw() {
  if (opAmount.value <= 0) {
    Message.warning('请输入金额');
    return;
  }
  if (!wallet.value || opAmount.value > Number(wallet.value.depositAvailable)) {
    Message.error('可担保押金不足');
    return;
  }
  if (!userStore.currentUser) return;
  opSubmitting.value = true;
  try {
    const acc = findAccount(userStore.currentUser.id);
    if (acc) {
      moveBucket({ account: acc, fromBucket: 'depositAvailable', toBucket: 'available', amount: opAmount.value.toFixed(2) });
      Message.success(`已转出 U ${opAmount.value.toFixed(2)} 至钱包`);
      withdrawOpen.value = false;
      opAmount.value = 0;
      await loadAll();
    }
  } finally {
    opSubmitting.value = false;
  }
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
      <a-card v-if="wallet" class="hero-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
        <DepositMeter :available="wallet.depositAvailable" :guaranteed="wallet.depositGuaranteed" size="lg" />
        <a-divider />
        <div class="actions">
          <a-button type="primary" @click="rechargeOpen = true">充值押金</a-button>
          <a-button @click="withdrawOpen = true">转出至钱包</a-button>
          <a-tooltip content="规则：在架商品需缴纳的最低押金 = 最贵商品单价。担保中订单完成后押金自动释放。">
            <a-button type="text">📖 规则说明</a-button>
          </a-tooltip>
        </div>
      </a-card>

      <a-card v-if="profile" class="stat-card" :body-style="{ padding: '16px 24px' }" :bordered="false">
        <div class="section-title">担保中订单</div>
        <div class="stat-row">
          <div class="stat">
            <div class="stat-label">担保中订单数</div>
            <div class="stat-val">{{ profile.stats.orderTotal - profile.stats.orderCompleted }} 笔</div>
          </div>
          <div class="stat">
            <div class="stat-label">已担保押金</div>
            <div class="stat-val">U {{ formatAmount(wallet?.depositGuaranteed || '0') }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">担保利用率</div>
            <div class="stat-val">
              {{
                wallet
                  ? ((Number(wallet.depositGuaranteed) / Math.max(1, Number(wallet.depositGuaranteed) + Number(wallet.depositAvailable))) * 100).toFixed(1)
                  : 0
              }}%
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

    <a-modal v-model:visible="rechargeOpen" title="充值押金" :ok-loading="opSubmitting" ok-text="确认充值" @ok="doRecharge">
      <a-alert type="info" class="alert">
        从钱包「可用余额」（U {{ formatAmount(availableInWallet.toFixed(2)) }}）转入「可担保押金」
      </a-alert>
      <a-form :model="{ opAmount }" layout="vertical">
        <a-form-item label="充值金额 (USDT)" required>
          <a-input-number v-model="opAmount" :min="1" :max="availableInWallet" :precision="2" size="large" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:visible="withdrawOpen" title="转出押金" :ok-loading="opSubmitting" ok-text="确认转出" @ok="doWithdraw">
      <a-alert type="warning" class="alert">
        转出后将影响您的商品上架资格（押金 < 最贵商品单价会自动下架）
      </a-alert>
      <a-form :model="{ opAmount }" layout="vertical">
        <a-form-item label="转出金额 (USDT)" required>
          <a-input-number
            v-model="opAmount"
            :min="1"
            :max="Number(wallet?.depositAvailable || 0)"
            :precision="2"
            size="large"
          />
        </a-form-item>
      </a-form>
    </a-modal>

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
