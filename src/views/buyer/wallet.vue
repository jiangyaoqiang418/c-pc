<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import BucketCard from '@/components/wallet/bucket-card.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
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
const requestGuard = createLatestRequestGuard();
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
  [() => userStore.currentAudience, () => userStore.currentUser?.id],
  ([nextAudience, nextUserId], [previousAudience, previousUserId]) => {
    if (nextAudience === previousAudience && String(nextUserId) === String(previousUserId)) return;
    requestGuard.invalidate();
    txns.value = [];
    drawerTxn.value = undefined;
    drawerOpen.value = false;
    loadError.value = '';
    void loadAll();
  }
);

import { getUsdtCnyRate } from '@shared/utils/currency';
const cnyRate = getUsdtCnyRate();
const cnyEquiv = computed(() =>
  walletStore.account ? formatAmount((Number(walletStore.totalAssets) * cnyRate).toFixed(2)) : '—'
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
    <header class="page-heading"><span class="eyebrow">UMAOMAO / BUYER WALLET</span><h1>买手钱包</h1><p>清晰掌握资产分布与经营流水。</p></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="notice-row"><span>{{ loadError }}</span><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">{{ loading ? '加载中…' : '重新加载' }}</Button></AlertDescription></Alert>
    <Alert v-if="walletStore.partialData"><AlertDescription class="notice-row"><span>部分钱包金额尚未取得，已知金额继续显示；“—”不代表零余额。</span><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">重新读取</Button></AlertDescription></Alert>
    <section class="wallet-hero"><div><span class="eyebrow">TOTAL ASSETS / USDT</span><div class="hero-total">U <strong>{{ totalAssets }}</strong></div><p class="reference">≈ ¥{{ cnyEquiv }} · 本地参考折算 · 1 USDT = ¥{{ cnyRate.toFixed(2) }}（非实时，以 USDT 结算）</p><small>含押金 · 钱包 · 冻结 · 利息</small></div><div class="hero-actions"><Button @click="router.push('/wallet/deposit')"><Icon icon="lucide:arrow-down-to-line" />链上充值</Button><Button variant="outline" @click="router.push('/wallet/withdraw')"><Icon icon="lucide:arrow-up-from-line" />转出</Button><Button variant="outline" @click="router.push('/buyer/deposit')"><Icon icon="lucide:shield-check" />押金管理</Button></div></section>
    <section class="paper"><div class="section-heading"><div><span class="eyebrow">ASSET BUCKETS</span><h2>资产桶（买手视角）</h2></div></div><div class="bucket-list"><BucketCard v-for="bucket in bucketsWithPct" :key="bucket.key" :bucket-key="bucket.key" :amount="bucket.value" :pct="bucket.pct" variant="row" /></div></section>
    <section class="paper"><div class="section-heading"><div><span class="eyebrow">BUYER TRANSACTIONS</span><h2>买手资金流水</h2><p>最近 30 条 · 押金 / 接单结算 / 利息</p></div><Button variant="ghost" size="sm" @click="router.push({ name: 'wallet-history', query: { types: buyerLedgerTypes.join(',') } })">查看全部<Icon icon="lucide:arrow-right" /></Button></div>
      <div v-if="loading && !txns.length" class="loading-list" aria-busy="true" aria-label="正在读取买手资金流水"><Skeleton v-for="n in 4" :key="n" class="row-skeleton" /></div><div v-else-if="txns.length"><TxnRow v-for="txn in txns" :key="txn.id" :txn="txn" @detail="openTxn" /></div><EmptyState v-else icon="lucide:receipt" :title="loadError || '暂无买手专属流水'" :description="loadError ? '请稍后重试。' : '接单完成 / 押金变动 / 利息发放后这里会显示'" :action-text="loadError ? '重新加载' : undefined" @action="loadError && loadAll()" />
    </section><TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.buyer-wallet .wallet-hero { position: relative; display: grid; grid-template-columns: minmax(0,1fr) auto; background: var(--yb-brand-primary); color: var(--yb-paper); padding: 32px; gap: 20px; }
.buyer-wallet .wallet-hero > div:first-child { grid-column: 1 / -1; }
.buyer-wallet .hero-total { font-family: var(--yb-font-body); margin: 12px 0 8px; }
.buyer-wallet .hero-total strong { font-size: 48px; font-weight: 650; }
.buyer-wallet .reference,.buyer-wallet .wallet-hero small { color: var(--yb-paper); opacity: .7; }
.buyer-wallet .hero-actions { justify-content: flex-start; }
.buyer-wallet .hero-actions button:first-child { color: var(--yb-ink); background: var(--yb-gold); }
.buyer-wallet .hero-actions button:not(:first-child) { background: transparent; color: var(--yb-paper); border-color: rgba(255,255,255,.3); }
.buyer-wallet .wallet-hero::after { content: 'U'; position: absolute; top: 30px; right: 44px; width: 116px; height: 116px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.15); border-radius: 50%; font-size: 48px; color: var(--yb-gold); opacity: .55; pointer-events: none; }
.buyer-wallet .section-heading .eyebrow { display: none; }
.buyer-wallet { display:grid; gap:24px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.page-heading h1 { font-size:28px; margin:8px 0; font-weight:650; }.page-heading p { color:var(--yb-muted); font-size:13px; margin:0; }.notice-row,.section-heading { display:flex; align-items:center; justify-content:space-between; gap:18px; }.wallet-hero,.paper { border:1px solid var(--yb-hairline); border-radius:12px; background:var(--yb-surface); padding:28px; }.wallet-hero { display:flex; align-items:center; justify-content:space-between; gap:26px; }.hero-total { font-size:22px; margin:12px 0; font-family:var(--yb-font-mono); }.hero-total strong { font-size:40px; font-weight:550; }.reference,.wallet-hero small { font-size:12px; color:var(--yb-muted); }.reference { margin:0 0 14px; }.hero-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:10px; }.section-heading { margin-bottom:24px; }.section-heading h2 { font-size:21px; font-weight:600; margin:5px 0 0; }.section-heading p { color:var(--yb-muted); font-size:12px; margin:8px 0 0; }.bucket-list,.loading-list { display:grid; gap:10px; }.row-skeleton { height:68px; }@media(max-width:1150px) { .wallet-hero { display:grid; }.hero-actions { justify-content:flex-start; } }
</style>
