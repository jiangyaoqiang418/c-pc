<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { walletApi } from '@shared';
import WalletAddressCard from '@/components/wallet/wallet-address-card.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();

const activeTab = ref<'okx' | 'chain'>('okx');
const chainWallets = ref<Api.Wallet.ChainWallet[]>([]);
const recentDeposits = ref<Api.Wallet.Txn[]>([]);
const submitting = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();
const drawerOpen = ref(false);

const amount = ref<number>(100);
const chain = ref<'TRC20' | 'ERC20' | 'BSC'>('TRC20');

const chainOptions: { value: 'TRC20' | 'ERC20' | 'BSC'; label: string; chain: Api.Wallet.Chain }[] = [
  { value: 'TRC20', label: 'TRC20（推荐 · 手续费低）', chain: 'TRON' },
  { value: 'ERC20', label: 'ERC20（以太坊主网）', chain: 'ETH' },
  { value: 'BSC', label: 'BSC（币安智能链）', chain: 'BSC' }
];

const incomeWallets = computed(() =>
  chainWallets.value.filter(w => w.purpose === 'income' && w.status === '1')
);

async function loadAll() {
  if (!userStore.currentUser) return;
  await walletStore.fetchWallet(userStore.currentUser.id);
  chainWallets.value = await walletApi.fetchPlatformChainWallets();
  const r = await walletApi.fetchMyTxns({ userId: userStore.currentUser.id, types: ['DEPOSIT_IN'], size: 10 });
  recentDeposits.value = r.records;
}

onMounted(loadAll);

async function startOkx() {
  if (!userStore.currentUser) return;
  if (amount.value <= 0) {
    Message.warning('请输入链上充值金额');
    return;
  }
  const target = chainOptions.find(o => o.value === chain.value);
  if (!target) return;
  const wallet = incomeWallets.value.find(w => w.chain === target.chain);
  if (!wallet) {
    Message.error(`暂无 ${target.label} 链上充值通道`);
    return;
  }

  submitting.value = true;
  try {
    await new Promise(r => setTimeout(r, 1200));
    const r = await walletApi.depositMock({
      userId: userStore.currentUser.id,
      amount: amount.value.toFixed(2),
      chain: chain.value,
      fromAddress: 'TFakeOkxUser' + userStore.currentUser.id + 'XXXXXXXXX',
      chainWalletId: wallet.id
    });
    if (r.ok) {
      Message.success(`OKX 链上充值成功 · +U ${amount.value.toFixed(2)}`);
      await loadAll();
    } else {
      Message.error(r.message || '链上充值失败');
    }
  } finally {
    submitting.value = false;
  }
}

function openDetail(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="deposit-page shop-container">
    <h1 class="page-title">钱包链上充值</h1>
    <p class="hint">将外部 USDT 转入平台钱包，支持 OKX 一键链上充值或链上手动转入。</p>

    <a-card class="tab-card" :body-style="{ padding: '12px 24px 24px' }" :bordered="false">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="okx" title="OKX 快速链上充值">
          <div class="okx-block">
            <div class="okx-hero">
              <div class="okx-logo">OKX</div>
              <div>
                <div class="okx-title">OKX 钱包一键链上充值</div>
                <div class="okx-sub">原型阶段模拟唤起，实际接入会拉起 OKX 钱包扩展。</div>
              </div>
            </div>
            <a-form :model="{ amount, chain }" layout="vertical" class="okx-form">
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item label="链上充值金额 (USDT)">
                    <a-input-number v-model="amount" :min="1" :precision="2" size="large" />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="链选择">
                    <a-select v-model="chain" size="large">
                      <a-option v-for="o in chainOptions" :key="o.value" :value="o.value">{{ o.label }}</a-option>
                    </a-select>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-button type="primary" size="large" long :loading="submitting" @click="startOkx">
                {{ submitting ? '正在唤起 OKX 钱包…' : '打开 OKX 钱包链上充值 U ' + amount.toFixed(2) }}
              </a-button>
            </a-form>
          </div>
        </a-tab-pane>
        <a-tab-pane key="chain" title="链上手动转入">
          <div v-if="incomeWallets.length" class="addr-list">
            <WalletAddressCard v-for="w in incomeWallets" :key="w.id" :wallet="w" />
          </div>
          <EmptyState v-else title="平台暂无可用链上充值钱包" />
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-card class="txn-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <div class="section-title">最近链上充值记录</div>
      <template v-if="recentDeposits.length">
        <TxnRow v-for="t in recentDeposits" :key="t.id" :txn="t" @detail="openDetail" />
      </template>
      <EmptyState v-else title="暂无链上充值记录" />
    </a-card>

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
  margin: 0 0 4px;
}
.hint {
  color: #86909c;
  font-size: 13px;
  margin: 0 0 16px;
}
.tab-card,
.txn-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.okx-hero {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff7e6 0%, #fff 60%);
  border-radius: 6px;
  margin-bottom: 20px;
}
.okx-logo {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: #000;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.okx-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}
.okx-sub {
  font-size: 12px;
  color: #86909c;
  margin-top: 2px;
}
.addr-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 14px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
</style>
