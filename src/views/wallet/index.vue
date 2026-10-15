<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { enums, formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import UmIcon from '@/components/common/um-icon.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';
import { getUsdtCnyRate } from '@shared/utils/currency';
import type { BucketKey } from '@shared/enums/wallet';
import type { WalletVisualFixture } from '@/components/wallet/v47-types';
const props = defineProps<{ visualFixture?: WalletVisualFixture }>();

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const recentTxns = ref<Api.RealWallet.Ledger[]>(props.visualFixture?.recentTxns || []);
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const drawerOpen = ref(false);
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

async function loadAll() {
  if (props.visualFixture) return;
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
watch(() => userStore.sessionVersion, () => {
  requestGuard.invalidate();
  recentTxns.value = [];
  drawerTxn.value = undefined;
  drawerOpen.value = false;
  void loadAll();
});
onBeforeUnmount(requestGuard.invalidate);

const cnyRate = getUsdtCnyRate();
const account = computed(() => props.visualFixture ? props.visualFixture.account : walletStore.account);
const totalAssets = computed(() => props.visualFixture ? props.visualFixture.totalAssets : walletStore.account ? walletStore.totalAssets : undefined);
const today = computed(() => props.visualFixture ? props.visualFixture.today : walletStore.today);
const showProductionDetails = computed(() => !props.visualFixture || props.visualFixture.showProductionDetails);
const cnyEquiv = computed(() =>
  account.value?.available === undefined ? '—' : formatAmount((Number(account.value.available) * cnyRate).toFixed(2))
);

// The prototype's three overview cards do not contain all real balance buckets.
// Keep the full production breakdown below its unchanged recent-transactions block.
const assetBuckets = computed(() => {
  if (!props.visualFixture) return walletStore.bucketsArray;
  const keys: BucketKey[] = ['available', 'nonWithdrawable', 'lockedFinance', 'frozenOrder', 'frozenRisk', 'depositAvailable', 'depositGuaranteed'];
  return keys.map(key => ({ key, ...enums.BUCKET_META[key], value: props.visualFixture!.account?.[key] }));
});
const bucketIcons: Record<BucketKey, string> = {
  available: 'wallet', nonWithdrawable: 'sun', lockedFinance: 'vault',
  frozenOrder: 'box', frozenRisk: 'shield', depositAvailable: 'wallet', depositGuaranteed: 'shield'
};
function goBucket(key: BucketKey) {
  if (key === 'frozenOrder') void router.push('/order');
  else if (key === 'lockedFinance') void router.push('/finance/my-lockups');
  else void router.push({ name: 'wallet-history', query: { bucket: key } });
}
function bucketRatio(key: BucketKey, value?: string) {
  if (value === undefined || !account.value || totalAssets.value === undefined) return;
  const percentage = props.visualFixture
    ? Number(totalAssets.value) > 0 ? Number(value) / Number(totalAssets.value) * 100 : Number(value) === 0 ? 0 : undefined
    : walletStore.bucketsWithPct.find(bucket => bucket.key === key)?.pct;
  return percentage === undefined || !Number.isFinite(percentage) ? undefined : Math.min(100, Math.max(0, percentage)).toFixed(1);
}
function transactionLabel(txn: Api.RealWallet.DisplayLedger) {
  if (txn.testData) return '测试模拟到账';
  return ('bizTypeText' in txn && txn.bizTypeText) || enums.TXN_TYPE_META[txn.type]?.label || txn.type;
}
function transactionIcon(txn: Api.RealWallet.DisplayLedger) {
  const group = enums.TXN_TYPE_META[txn.type]?.group;
  return group === 'chain' ? 'wallet' : group === 'finance' ? 'vault' : group === 'risk' || group === 'deposit' ? 'shield' : 'bag';
}
/** Display rounded cents without routing exact API decimals through Number(). */
function money(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '—';
  let text = String(value).trim();
  const exponential = text.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (exponential) {
    const exponent = Number(exponential[4]);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return '—';
    const digits = exponential[2] + (exponential[3] || '');
    const point = exponential[2].length + exponent;
    text = exponential[1] + (point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`);
  }
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return '—';
  const fraction = (match[3] || '').padEnd(3, '0');
  let cents = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= '5') cents += 1n;
  const digits = cents.toString().padStart(3, '0');
  return (match[1] && cents ? '-' : '') + digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + digits.slice(-2);
}

function openDetail(t: Api.RealWallet.DisplayLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}


</script>

<template>
  <div class="wallet-page" :aria-busy="loading">
    <div class="page-heading compact"><h1>我的钱包</h1></div>
    <div v-if="loadError" class="status-banner wallet-status" role="alert"><UmIcon name="shield" /><span>{{ loadError }}</span><button class="outline" :disabled="loading" @click="loadAll">重新加载</button></div>
    <div v-if="!visualFixture && walletStore.partialData" class="status-banner wallet-status" role="status"><UmIcon name="clock" /><span>钱包总额或今日收支尚未取得，请重新加载。</span><button class="outline" :disabled="loading" @click="loadAll">重新加载</button></div>
    <section class="wallet-hero">
      <div><span>可用余额 · USDT</span><h1>{{ money(account?.available) }}</h1><p>≈ ¥{{ cnyEquiv }} · 非实时参考折算</p></div>
      <UmIcon name="wallet" />
      <div class="button-row"><button class="gold" @click="router.push('/wallet/deposit')">转入 <UmIcon name="plus" /></button><button class="outline" @click="router.push('/wallet/withdraw')">转出 <UmIcon name="arrow" /></button><button @click="router.push('/wallet/history')">交易记录 ↗</button></div>
    </section>
    <div class="stats-grid" aria-label="钱包概况">
      <section class="paper"><span>锁仓余额</span><h2>{{ money(account?.lockedFinance) }} <small>USDT</small></h2></section>
      <section class="paper"><span>今日支出</span><h2>{{ money(today?.withdrawOut) }} <small>USDT</small></h2></section>
      <section class="paper"><span>资产币种</span><h2>USDT <small>稳定币</small></h2></section>
    </div>
    <section class="paper">
      <div class="section-heading"><h2>最近交易</h2><button @click="router.push('/wallet/history')">查看全部 →</button></div>
      <button v-for="txn in recentTxns.slice(0, 4)" :key="txn.id" type="button" class="transaction wallet-transaction" :aria-label="`${transactionLabel(txn)}，${txn.direction === 'in' ? '收入' : '支出'} ${money(txn.amount)} USDT，查看交易详情`" @click="openDetail(txn)">
        <UmIcon :name="transactionIcon(txn)" />
        <span class="transaction-copy"><b>{{ transactionLabel(txn) }}</b><small>{{ formatDateValue(txn.createdAt) }}</small><small v-if="showProductionDetails && txn.remark" class="ledger-caption">{{ txn.remark }}</small><small v-if="showProductionDetails && (txn.bucketFrom || txn.bucketTo)" class="ledger-caption">{{ txn.bucketFrom ? enums.BUCKET_META[txn.bucketFrom]?.label || '未知账户' : '' }}{{ txn.bucketFrom && txn.bucketTo ? ' → ' : '' }}{{ txn.bucketTo ? enums.BUCKET_META[txn.bucketTo]?.label || '未知账户' : '' }}</small></span>
        <b>{{ txn.direction === 'in' ? '+' : '−' }} {{ money(txn.amount) }} USDT</b>
      </button>
      <p v-if="!recentTxns.length" class="muted center" role="status">{{ loading ? '正在加载最近交易…' : loadError ? '最近交易暂不可用，请重新加载。' : visualFixture ? '暂无交易。完成一笔模拟余额支付后，这里会显示收支。' : '暂无交易。完成链上充值或商品消费后，这里会显示收支。' }}</p>
    </section>
    <!-- v47 production supplement: real buckets and safety entry points have no complete prototype panel. -->
    <section v-if="showProductionDetails" class="paper wallet-assets" :aria-busy="walletStore.loading">
      <div class="section-heading"><h2>资产明细</h2><span class="wallet-total">资产总额 <b>{{ money(totalAssets) }}</b> USDT</span></div>
      <div class="wallet-cashflow"><span>今日转入 <b>{{ money(today?.depositIn) }} USDT</b></span><span>今日转出 <b>{{ money(today?.withdrawOut) }} USDT</b></span></div>
      <button v-for="bucket in assetBuckets" :key="bucket.key" type="button" class="transaction asset-bucket" @click="goBucket(bucket.key)"><UmIcon :name="bucketIcons[bucket.key]" /><span class="transaction-copy"><b>{{ bucket.label }}</b><small>{{ bucket.hint }}</small></span><b>{{ money(bucket.value) }} <small>USDT</small><span v-if="bucketRatio(bucket.key, bucket.value) !== undefined" class="bucket-ratio">{{ bucketRatio(bucket.key, bucket.value) }}%</span></b><UmIcon name="arrow" /></button>
      <div v-if="!assetBuckets.length" class="empty"><UmIcon name="wallet" /><h2>{{ loading ? '正在读取资产…' : '资产暂不可用' }}</h2><p>重新加载后查看完整资产明细。</p><button class="outline" :disabled="loading" @click="loadAll">重新加载</button></div>
    </section>
    <section v-if="showProductionDetails" class="paper wallet-safety">
      <div class="section-heading"><h2>支付安全</h2></div>
      <div v-if="!visualFixture && userStore.currentUser?.status === '2'" class="status-banner" role="status"><UmIcon name="shield" /><span>当前账户受到限制，请核对账户状态后再操作。</span></div>
      <div v-if="!visualFixture && userStore.currentUser?.withdrawRequiresAudit" class="status-banner" role="status"><UmIcon name="clock" /><span>转出申请需要审核，处理结果以申请记录为准。</span></div>
      <div class="wallet-security-links"><button class="outline" @click="router.push('/kyc')"><UmIcon name="shield" />KYC 认证<UmIcon name="arrow" /></button><button class="outline" @click="router.push('/profile/pay-password')"><UmIcon name="wallet" />支付密码<UmIcon name="arrow" /></button><button class="text-link" @click="router.push('/wallet/history')">查看完整流水与导出<UmIcon name="arrow" /></button></div>
      <p class="muted">转出申请的认证、支付密码及审核状态，可在对应操作中核对。</p>
    </section>
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped src="../../components/wallet/v47-wallet.css"></style>
