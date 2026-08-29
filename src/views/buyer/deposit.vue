<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import DepositMeter from '@/components/buyer/deposit-meter.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as realBuyerApi from '@/service/api/buyer';
import * as realOrderApi from '@/service/api/order';
import * as realWalletApi from '@/service/api/wallet';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const walletStore = useWalletStore();

const txns = ref<Api.RealBuyer.DepositLedger[]>([]);
const orderCounts = ref<Record<string, number>>({});
const loading = ref(false);
const loadError = ref('');
const drawerOpen = ref(false);
const drawerTxn = ref<Api.RealBuyer.DepositLedger>();
const account = computed(() => walletStore.account);
const transferOpen = ref(false);
const transferKind = ref<'pay' | 'refund'>('pay');
const transferAmount = ref<number>();
const transferring = ref(false);
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
const maxTransferAmount = computed(() => {
  const value = transferKind.value === 'pay' ? account.value?.available : account.value?.depositAvailable;
  return Number(value || 0);
});

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    txns.value = [];
    orderCounts.value = {};
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loading.value = true;
  loadError.value = '';
  try {
    const [walletResult, txnResult, countsResult] = await Promise.allSettled([
      walletStore.fetchWallet(userId),
      realBuyerApi.fetchBuyerDepositLedger({ pageNo: 1, pageSize: 20 }, { signal: isCurrent.signal }),
      realOrderApi.countMySoldOrdersByStatus({ showError: false, signal: isCurrent.signal })
    ]);
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    txns.value = txnResult.status === 'fulfilled' ? txnResult.value.records : [];
    orderCounts.value = countsResult.status === 'fulfilled' ? countsResult.value : {};
    if (walletResult.status === 'rejected' || walletStore.account === undefined) {
      loadError.value = '押金账户加载失败，请检查网络后重试。';
    } else if (txnResult.status === 'rejected' || countsResult.status === 'rejected') {
      loadError.value = '押金流水或订单统计加载失败，请检查网络后重试。';
    }
  } catch {
    if (!isCurrent()) return;
    txns.value = [];
    orderCounts.value = {};
    loadError.value = '押金信息加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(loadAll);
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => userStore.currentUser?.id, () => userStore.currentAudience], ([nextUserId, nextAudience], [previousUserId, previousAudience]) => {
  if (String(nextUserId) === String(previousUserId) && nextAudience === previousAudience) return;
  writeVersion += 1;
  transferring.value = false;
  transferOpen.value = false;
  txns.value = [];
  orderCounts.value = {};
  void loadAll();
});

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

function openDepositTransfer(kind: 'pay' | 'refund') {
  transferKind.value = kind;
  transferAmount.value = undefined;
  transferOpen.value = true;
}

function createIdempotencyKey() {
  return crypto.randomUUID();
}

async function submitDepositTransfer() {
  if (transferring.value) return;
  if (!transferAmount.value || transferAmount.value <= 0) {
    Message.warning('请输入正确的保证金金额');
    return;
  }
  if (transferAmount.value > maxTransferAmount.value) {
    Message.warning(transferKind.value === 'pay' ? '缴纳金额不能超过钱包可用余额' : '退还金额不能超过可用保证金');
    return;
  }

  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive;
  transferring.value = true;
  try {
    const params = { amount: transferAmount.value, idempotencyKey: createIdempotencyKey() };
    try {
      if (transferKind.value === 'pay') await realBuyerApi.payBuyerDeposit(params);
      else await realBuyerApi.refundBuyerDeposit(params);
      if (!isCurrentWrite()) return;
      Message.success(transferKind.value === 'pay' ? '保证金缴纳成功' : '保证金已退还至钱包');
      transferOpen.value = false;
      await loadAll();
    } catch {
      if (isCurrentWrite()) {
        Message.error(transferKind.value === 'pay' ? '保证金缴纳失败，请稍后重试' : '保证金退还失败，请稍后重试');
      }
    }
  } finally {
    if (operation === writeVersion) transferring.value = false;
  }
}

function openTxn(t: Api.RealBuyer.DepositLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="deposit-page shop-container">
    <h1 class="page-title">押金管理</h1>

    <a-alert v-if="loadError" type="error" :closable="false" class="load-alert">
      {{ loadError }}
      <template #action><a-button size="mini" :loading="loading" @click="loadAll">重新加载</a-button></template>
    </a-alert>

    <a-spin :loading="loading" style="width: 100%">
      <a-card v-if="account" class="hero-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
        <DepositMeter :available="account.depositAvailable" :guaranteed="account.depositGuaranteed" size="lg" />
        <a-divider />
        <a-alert type="info" class="alert">保证金从钱包可用余额划入或退还；提交后将刷新余额和流水。</a-alert>
        <div class="actions">
          <a-button type="primary" @click="openDepositTransfer('pay')">充值押金</a-button>
          <a-button @click="openDepositTransfer('refund')">转出至钱包</a-button>
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
        <EmptyState
          v-else
          :title="loadError || '暂无押金流水'"
          :description="loadError ? '不会把请求失败显示成没有流水。' : undefined"
          :action-text="loadError ? '重新加载' : undefined"
          @action="loadError && loadAll()"
        />
      </a-card>
      <EmptyState v-if="!account && !loading" :title="loadError ? '押金信息加载失败' : '暂无押金账户'" :description="loadError" :action-text="loadError ? '重新加载' : undefined" @action="loadAll" />
    </a-spin>

    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />

    <a-modal
      v-model:visible="transferOpen"
      :title="transferKind === 'pay' ? '缴纳保证金' : '退还保证金至钱包'"
      :ok-loading="transferring"
      @ok="submitDepositTransfer"
    >
      <a-form :model="{ amount: transferAmount }" layout="vertical">
        <a-form-item label="金额 (USDT)" required>
          <a-input-number
            v-model="transferAmount"
            :min="0.01"
            :max="maxTransferAmount"
            :precision="2"
            placeholder="请输入金额"
            style="width: 100%"
          />
        </a-form-item>
        <a-alert
          :type="transferKind === 'pay' ? 'warning' : 'info'"
          :title="transferKind === 'pay' ? '将从钱包可用余额划入保证金。' : '将从可用保证金退还至钱包余额。'"
        />
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.deposit-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
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
@media (max-width: 640px) {
  .hero-card :deep(.arco-card-body), .stat-card :deep(.arco-card-body) { padding: 20px !important; }
  .actions { flex-wrap: wrap; }
  .stat-row { grid-template-columns: 1fr; gap: 12px; }
}
</style>
