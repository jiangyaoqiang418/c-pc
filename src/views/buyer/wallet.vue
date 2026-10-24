<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import { formatDateValue } from '@/utils/date-range';
import { enums, formatAmount } from '@shared';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import * as realWalletApi from '@/service/api/wallet';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const txns = ref<Api.RealWallet.Ledger[]>([]);
const loading = ref(false);
const loadError = ref('');
const drawerOpen = ref(false);
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const buyerLedgerTypes: Api.Wallet.TxnType[] = ['DEPOSIT_PLEDGE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT', 'ORDER_SETTLE', 'INTEREST_ACCRUE'];

async function loadAll() {
  if (!userStore.currentUser) {
    requestGuard.invalidate();
    txns.value = [];
    drawerTxn.value = undefined;
    drawerOpen.value = false;
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    await walletStore.fetchWallet(userStore.currentUser.id);
    if (!isCurrent()) return;
    const r = await realWalletApi.fetchWalletLedgersByTypes({
      types: buyerLedgerTypes,
      size: 30,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    txns.value = r.records;
  } catch {
    if (!isCurrent()) return;
    loadError.value = '买手钱包数据加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(loadAll);
onBeforeUnmount(requestGuard.invalidate);
watch(
  [() => userStore.currentAudience, () => userStore.currentUser?.id, () => userStore.sessionVersion],
  ([nextAudience, nextUserId, nextSession], [previousAudience, previousUserId, previousSession]) => {
    if (nextAudience === previousAudience && String(nextUserId) === String(previousUserId) && nextSession === previousSession) return;
    requestGuard.invalidate();
    txns.value = [];
    drawerTxn.value = undefined;
    drawerOpen.value = false;
    loadError.value = '';
    void loadAll();
  }
);

import { formatCny, usdtCnyRateLabel } from '@shared/utils/currency';
const cnyEquiv = computed(() =>
  walletStore.account ? formatCny(walletStore.totalAssets).replace(/^¥/, '') : '—'
);
const totalAssets = computed(() => walletStore.account ? formatAmount(walletStore.totalAssets) : '—');
const bucketsWithPct = computed(() => walletStore.bucketsWithPct);

function openTxn(t: Api.RealWallet.DisplayLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}


</script>

<template>
  <div class="buyer-wallet shop-container">
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>买手钱包</h1><p>清晰掌握每一步，从容经营每一天。</p></div></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="notice-row"><span>{{ loadError }}</span><Button class="outline" variant="outline" size="sm" :disabled="loading" @click="loadAll">{{ loading ? '加载中…' : '重新加载' }}</Button></AlertDescription></Alert>
    <Alert v-if="walletStore.partialData"><AlertDescription class="notice-row"><span>部分钱包金额尚未取得，已知金额继续显示；“—”不代表零余额。</span><Button class="outline" variant="outline" size="sm" :disabled="loading" @click="loadAll">重新读取</Button></AlertDescription></Alert>
    <section class="buyer-wallet-hero"><span class="eyebrow">YOUR ASSETS / USDT</span><p>总资产 · 含钱包、押金与冻结资金</p><strong>{{ totalAssets }}<small>USDT</small></strong><div><button type="button" class="gold" @click="router.push('/wallet/deposit')"><UmIcon name="plus" />转入</button><button type="button" class="outline" @click="router.push('/wallet/withdraw')">转出</button><button type="button" class="outline" @click="router.push('/buyer/deposit')">押金管理</button></div><p>≈ ¥{{ cnyEquiv }} · {{ usdtCnyRateLabel() }}</p></section>
    <section class="paper"><div class="buyer-section-title"><h2>资产分布</h2><small>买手视角</small></div><button v-for="bucket in bucketsWithPct" :key="bucket.key" type="button" class="buyer-bucket" @click="router.push(bucket.key === 'frozenOrder' ? '/order' : bucket.key === 'lockedFinance' ? '/finance/my-lockups' : { name:'wallet-history', query:{ bucket:bucket.key } })"><span><UmIcon :name="bucket.key === 'lockedFinance' ? 'clock' : bucket.key.startsWith('deposit') ? 'shield' : 'wallet'" /><span><b>{{ enums.BUCKET_META[bucket.key].label }}</b><small>{{ enums.BUCKET_META[bucket.key].hint }}</small></span></span><strong>{{ bucket.value === undefined ? '—' : formatAmount(bucket.value) }}<small> USDT {{ bucket.pct === undefined ? '' : ' · ' + bucket.pct.toFixed(1) + '%' }}</small><UmIcon name="chevron" /></strong></button></section>
    <section class="paper"><div class="buyer-section-title"><h2>买手资金流水</h2><button type="button" @click="router.push({ name:'wallet-history', query:{ types:buyerLedgerTypes.join(',') } })">查看全部 →</button></div><p class="buyer-inline-hint">最近 30 条 · 押金 / 接单结算 / 利息</p><div v-if="loading && !txns.length" class="loading-list" aria-busy="true"><Skeleton v-for="n in 4" :key="n" class="h-16" /></div><template v-else-if="txns.length"><button v-for="txn in txns" :key="txn.id" type="button" class="buyer-ledger" @click="openTxn(txn)"><span class="buyer-ledger-icon"><UmIcon :name="txn.type === 'DEPOSIT_RELEASE' ? 'return' : 'wallet'" /></span><span><b>{{ txn.testData ? '测试模拟到账' : txn.bizTypeText || enums.TXN_TYPE_META[txn.type]?.label || txn.type }}</b><small>{{ formatDateValue(txn.createdAt) }} · {{ txn.bucketFrom ? enums.BUCKET_META[txn.bucketFrom]?.label : '' }} → {{ txn.bucketTo ? enums.BUCKET_META[txn.bucketTo]?.label : '' }}</small><small v-if="txn.remark || txn.chainTxHash">{{ txn.remark }} {{ txn.chainTxHash }}</small></span><strong>{{ txn.direction === 'in' ? '+' : '−' }}{{ formatAmount(txn.amount) }} <small>USDT</small><UmIcon name="chevron" /></strong></button></template><EmptyState v-else icon="lucide:receipt" :title="loadError || '暂无买手专属流水'" :description="loadError ? '请稍后重试。' : '接单完成 / 押金变动 / 利息发放后这里会显示'" :action-text="loadError ? '重新加载' : undefined" @action="loadError && loadAll()" /></section>
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
:root[data-ui-palette="web3-meme"] .buyer-wallet-hero { background:linear-gradient(120deg,#1c2b1e,#111a15); }
.notice-row { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.loading-list { display:grid; gap:16px; }
.buyer-ledger > span > small { overflow-wrap:anywhere; }
</style>
