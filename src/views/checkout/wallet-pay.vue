<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { fetchLatestWalletPay, validateWalletPay, type WalletPayOrder } from '@/service/api/wallet-pay';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const requestGuard = createLatestRequestGuard();
const orderGroupNo = computed(() => String(route.params.orderGroupNo || ''));
const pay = ref<WalletPayOrder>();
const loading = ref(false);
const errorMessage = ref('');

function formatExpiry(value: string | number | undefined) {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString() : '请以订单状态为准';
}

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = userStore.currentUser?.id;
  pay.value = undefined;
  errorMessage.value = '';
  if (!walletPayEntryEnabled || !userId || !orderGroupNo.value) {
    errorMessage.value = '钱包直付入口暂未开放，请从订单列表核对待付订单';
    return;
  }
  loading.value = true;
  try {
    const result = await fetchLatestWalletPay(orderGroupNo.value, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    pay.value = validateWalletPay(result, orderGroupNo.value);
  } catch (error) {
    if (isCurrent()) errorMessage.value = error instanceof Error ? error.message : '支付单读取失败，请稍后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(requestGuard.invalidate);
watch([orderGroupNo, () => userStore.currentUser?.id], () => { void load(); });
</script>

<template>
  <div class="wallet-pay-page">
    <a-spin :loading="loading" style="width: 100%">
      <a-card class="wallet-pay-card" :bordered="false">
        <template #title>USDT 钱包直付</template>
        <a-alert type="warning" :closable="false">
          钱包转账功能尚未接入，本页目前只供核对支付参数。请勿自行向下方地址转账；支付成功仍以后端确认结果为准。
        </a-alert>

        <template v-if="pay">
          <a-descriptions :column="1" bordered class="pay-details">
            <a-descriptions-item label="订单组号">{{ pay.orderGroupNo }}</a-descriptions-item>
            <a-descriptions-item label="支付单号">{{ pay.payNo }}</a-descriptions-item>
            <a-descriptions-item label="当前状态">{{ pay.statusText || pay.status }}</a-descriptions-item>
            <a-descriptions-item label="链与网络">{{ pay.chainLabel || pay.chain }} · {{ pay.network }}</a-descriptions-item>
            <a-descriptions-item label="应转 USDT">{{ pay.payAmount }}</a-descriptions-item>
            <a-descriptions-item label="收款地址">{{ pay.toAddress }}</a-descriptions-item>
            <a-descriptions-item label="USDT 合约">{{ pay.tokenContract }}</a-descriptions-item>
            <a-descriptions-item label="有效期至">{{ formatExpiry(pay.expireAt) }}</a-descriptions-item>
            <a-descriptions-item label="钱包账户">待连接（J2 接入）</a-descriptions-item>
          </a-descriptions>
          <p class="gas-tip">正式转账时还需准备相应链的 Gas 币（ETH、BNB 或 TRX）。</p>
        </template>
        <a-result v-else-if="errorMessage" status="info" title="暂无法展示钱包支付单" :subtitle="errorMessage" />
        <a-space class="actions">
          <a-button :disabled="loading" @click="load">重新读取</a-button>
          <a-button type="primary" @click="router.push({ name: 'order-list' })">查看我的订单</a-button>
        </a-space>
      </a-card>
    </a-spin>
  </div>
</template>

<style scoped>
.wallet-pay-page { max-width: 840px; margin: 48px auto 80px; padding: 0 20px; }
.wallet-pay-card { border-radius: 12px; box-shadow: 0 12px 32px rgb(22 33 54 / 8%); }
.pay-details { margin-top: 20px; overflow-wrap: anywhere; }
.gas-tip { margin: 18px 0 0; color: #666f7c; }
.actions { margin-top: 24px; }
</style>
