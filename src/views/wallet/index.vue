<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import BucketCard from '@/components/wallet/bucket-card.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import AssetCompositionChart from '@/components/wallet/asset-composition-chart.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const recentTxns = ref<Api.RealWallet.Ledger[]>([]);
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const drawerOpen = ref(false);
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

async function loadAll() {
  const userId = userStore.currentUser?.id;
  if (!userId) {
    requestGuard.invalidate();
    recentTxns.value = [];
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  const [walletResult, ledgerResult] = await Promise.allSettled([
    walletStore.fetchWallet(userId),
    realWalletApi.fetchWalletLedger({ current: 1, size: 5, signal: isCurrent.signal })
  ]);
  if (!isCurrent()) return;
  // 本次流水读取明确失败时不能继续展示上一次快照；钱包与流水独立结算，
  // 因此余额失败但本次流水成功仍保留本次成功结果。
  recentTxns.value = ledgerResult.status === 'fulfilled' ? ledgerResult.value.records : [];
  if (walletResult.status === 'rejected' || ledgerResult.status === 'rejected') {
    loadError.value = '钱包数据加载失败，请检查网络后重试。';
  }
  loading.value = false;
}

onMounted(loadAll);
watch(() => userStore.currentAudience, loadAll);
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  requestGuard.invalidate();
  recentTxns.value = [];
  drawerTxn.value = undefined;
  drawerOpen.value = false;
  loadError.value = '';
  void loadAll();
});
onBeforeUnmount(requestGuard.invalidate);

import { getUsdtCnyRate } from '@shared/utils/currency';
const cnyRate = getUsdtCnyRate();
const cnyEquiv = computed(() =>
  walletStore.account ? formatAmount((Number(walletStore.totalAssets) * cnyRate).toFixed(2)) : '—'
);

const bucketsWithPct = computed(() => walletStore.bucketsWithPct);

function openDetail(t: Api.RealWallet.DisplayLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}


</script>

<template>
  <div class="wallet-page shop-container" :aria-busy="loading">
    <header class="page-heading"><span class="eyebrow">YOUR WALLET</span><h1>我的钱包</h1></header>
    <Alert v-if="loadError" variant="destructive" class="notice"><AlertDescription>{{ loadError }}</AlertDescription><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">重新加载</Button></Alert>
    <Alert v-if="walletStore.partialData" class="notice"><AlertDescription>钱包总额或今日收支尚未取得，请重新加载。</AlertDescription><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">重新加载</Button></Alert>
    <section class="hero"><div><span class="eyebrow">TOTAL ASSETS · USDT</span><Skeleton v-if="loading && !walletStore.account" class="balance-loading" /><div v-else class="hero-total"><span>U</span><strong>{{ walletStore.account ? formatAmount(walletStore.totalAssets) : '—' }}</strong></div><p class="hero-sub">≈ ¥{{ cnyEquiv }}<small>本地参考折算 · 1 USDT = ¥{{ cnyRate.toFixed(2) }}（非实时，以 USDT 结算）</small></p></div><div class="hero-side"><div class="hero-actions"><Button @click="router.push('/wallet/deposit')"><Icon icon="lucide:arrow-down-to-line" width="17" />链上充值</Button><Button variant="outline" @click="router.push('/wallet/withdraw')"><Icon icon="lucide:arrow-up-from-line" width="17" />转出</Button><Button variant="outline" @click="router.push('/wallet/history')"><Icon icon="lucide:list" width="17" />交易记录</Button></div><dl v-if="walletStore.today" class="today"><div><dt>今日入</dt><dd class="inbound">+U {{ formatAmount(walletStore.today.depositIn) }}</dd></div><div><dt>今日出</dt><dd class="outbound">−U {{ formatAmount(walletStore.today.withdrawOut) }}</dd></div></dl></div></section>
    <section class="panel"><header class="section-head"><div><span class="eyebrow">ASSET DISTRIBUTION</span><h2>资产分布</h2></div></header><div class="dist-body"><div class="dist-chart"><AssetCompositionChart v-if="walletStore.compositionReady" :breakdown="walletStore.compositionBreakdown" :total-assets="walletStore.totalAssets" :size="220" /><Skeleton v-else-if="walletStore.loading" class="chart-loading" /><p v-else>{{ walletStore.account ? '资产分布尚不完整，请重新加载' : '资产暂不可用，请重新加载' }}</p></div><div class="dist-list"><BucketCard v-for="b in bucketsWithPct" :key="b.key" :bucket-key="b.key" :amount="b.value" :pct="b.pct" variant="row" /></div></div></section>
    <section class="panel"><header class="section-head"><div><span class="eyebrow">RECENT TRANSACTIONS</span><h2>最近交易</h2></div><Button variant="link" size="sm" @click="router.push('/wallet/history')">查看全部<Icon icon="lucide:arrow-up-right" width="16" /></Button></header><div v-if="loading && !recentTxns.length" class="txn-loading"><Skeleton v-for="n in 3" :key="n" class="h-20" /></div><div v-else-if="recentTxns.length" class="txn-list"><TxnRow v-for="t in recentTxns" :key="t.id" :txn="t" @detail="openDetail" /></div><EmptyState v-else icon="lucide:receipt" :title="loadError || '暂无交易'" :description="loadError ? '请稍后重试。' : '完成链上充值 / 消费后这里会显示资金动态'" :action-text="loadError ? '重新加载' : undefined" @action="loadError ? loadAll() : undefined" /></section>
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.wallet-page { padding-top:32px; padding-bottom:48px; }.page-heading { margin-bottom:24px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { font-size:28px; font-weight:650; margin:5px 0 0; }.notice { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-bottom:18px; }.hero { display:grid; grid-template-columns:1.3fr 1fr; gap:32px; align-items:center; background:var(--yb-primary-soft); border:1px solid var(--yb-hairline); border-radius:10px; padding:36px; margin-bottom:24px; }.hero-total { display:flex; align-items:baseline; gap:10px; margin:18px 0 12px; color:var(--yb-brand-primary); }.hero-total span { font-size:24px; }.hero-total strong { font-size:48px; font-weight:650; line-height:1.2; letter-spacing:-1px; overflow-wrap:anywhere; }.hero-sub { color:var(--yb-muted); font-size:14px; margin:0; }.hero-sub small { display:block; font-size:12px; margin-top:6px; }.hero-side { display:grid; justify-items:end; gap:24px; }.hero-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12px; }.today { display:flex; flex-wrap:wrap; gap:24px; margin:0; }.today>div { display:flex; align-items:center; gap:8px; }dt { color:var(--yb-muted); font-size:12px; }dd { margin:0; font-size:13px; font-weight:500; }.inbound { color:var(--yb-success); }.outbound { color:var(--yb-danger); }.panel { background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; padding:28px; margin-bottom:24px; }.section-head { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:24px; }h2 { margin:6px 0 0; font-size:22px; font-weight:600; }.dist-body { display:grid; grid-template-columns:350px minmax(0,1fr); gap:32px; align-items:center; }.dist-chart { display:flex; justify-content:center; }.dist-chart p { font-size:14px; color:var(--yb-muted); }.dist-list { border-top:1px solid var(--yb-hairline); }.balance-loading { width:280px; height:60px; margin:18px 0 12px; }.chart-loading { width:220px; height:220px; border-radius:50%; }.txn-loading { display:grid; gap:12px; }.txn-list { border-top:1px solid var(--yb-hairline); }@media(max-width:1100px) { .hero { grid-template-columns:1fr; }.hero-side { justify-items:start; }.hero-actions { justify-content:flex-start; }.dist-body { grid-template-columns:270px minmax(0,1fr); } }@media(max-width:800px) { .dist-body { grid-template-columns:1fr; }.hero,.panel { padding:24px; }.hero-total strong { font-size:40px; } }
</style>
