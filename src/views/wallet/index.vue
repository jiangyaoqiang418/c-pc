<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { enums } from '@shared';
import { formatFinanceRate } from '@/components/finance/v47-interest-math';
import { displayWalletAmount } from '@/components/wallet/wallet-amount';
import WalletAssetTabs from '@/components/wallet/wallet-asset-tabs.vue';
import * as realWalletApi from '@/service/api/wallet';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import UmIcon from '@/components/common/um-icon.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';
import type { BucketKey } from '@shared/enums/wallet';
import type { WalletVisualFixture } from '@/components/wallet/v47-types';
const props = defineProps<{ visualFixture?: WalletVisualFixture }>();

const router = useRouter();
const route = useRoute();
const asset = computed<Api.RealWallet.Asset>(() => !props.visualFixture && route.query.asset === 'USDC' ? 'USDC' : 'USDT');
function selectAsset(value: Api.RealWallet.Asset) { void router.replace({ query: { ...route.query, asset: value } }); }
function walletLink(path: string) { void router.push({ path, query: { asset: asset.value } }); }
const userStore = useUserStore();
const walletStore = useWalletStore();

const recentTxns = ref<Api.RealWallet.Ledger[]>(props.visualFixture?.recentTxns || []);
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const drawerOpen = ref(false);
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${asset.value}`);

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
    walletStore.fetchWallet(userId, asset.value),
    realWalletApi.fetchWalletLedger({ currency: asset.value, current: 1, size: 5, signal: isCurrent.signal })
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
watch(asset, () => {
  requestGuard.invalidate();
  recentTxns.value = [];
  drawerTxn.value = undefined;
  drawerOpen.value = false;
  void loadAll();
});
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

const overview = computed(() => walletStore.getOverview(asset.value));
const account = computed(() => props.visualFixture ? props.visualFixture.account : overview.value?.account);
const totalAssets = computed(() => props.visualFixture ? props.visualFixture.totalAssets : overview.value?.total);
const today = computed(() => props.visualFixture ? props.visualFixture.today : overview.value?.today);
const partialData = computed(() => !!overview.value && (overview.value.total == null
  || overview.value.today.depositIn == null || overview.value.today.withdrawOut == null));
const showProductionDetails = computed(() => !props.visualFixture || props.visualFixture.showProductionDetails);
const assetBuckets = computed(() => {
  if (props.visualFixture) {
    const keys: BucketKey[] = ['available', 'nonWithdrawable', 'lockedFinance', 'frozenOrder', 'frozenRisk', 'depositAvailable', 'depositGuaranteed'];
    return keys.map(key => ({ key, ...enums.BUCKET_META[key], value: props.visualFixture!.account?.[key], ratio: undefined as string | number | null | undefined }));
  }
  return (overview.value?.distribution || []).filter(bucket => bucket.key && bucket.key in enums.BUCKET_META)
    .map(bucket => {
      const key = bucket.key as BucketKey;
      return { key, ...enums.BUCKET_META[key], label: bucket.name || enums.BUCKET_META[key].label,
        hint: bucket.description || enums.BUCKET_META[key].hint, value: bucket.amount, ratio: bucket.ratio };
    });
});
const bucketIcons: Record<BucketKey, string> = {
  available: 'wallet', nonWithdrawable: 'sun', lockedFinance: 'vault',
  frozenOrder: 'box', frozenRisk: 'shield', depositAvailable: 'wallet', depositGuaranteed: 'shield'
};
function goBucket(key: BucketKey) {
  if (asset.value === 'USDT' && key === 'frozenOrder') void router.push('/order');
  else if (asset.value === 'USDT' && key === 'lockedFinance') void router.push('/finance/my-lockups');
  else void router.push({ name: 'wallet-history', query: { bucket: key, asset: asset.value } });
}
function transactionLabel(txn: Api.RealWallet.DisplayLedger) {
  return ('bizTypeText' in txn && txn.bizTypeText) || enums.TXN_TYPE_META[txn.type]?.label || '资金变动';
}
function transactionIcon(txn: Api.RealWallet.DisplayLedger) {
  const group = enums.TXN_TYPE_META[txn.type]?.group;
  return group === 'chain' ? 'wallet' : group === 'finance' ? 'vault' : group === 'risk' || group === 'deposit' ? 'shield' : 'bag';
}
function money(value?: string | number | null): string {
  return displayWalletAmount(value);
}
function txnAsset(txn: Api.RealWallet.DisplayLedger) { return 'currency' in txn ? txn.currency || 'USDT' : 'USDT'; }

function openDetail(t: Api.RealWallet.DisplayLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}


</script>

<template>
  <div class="wallet-page" :aria-busy="loading">
    <div class="page-heading compact"><h1>我的钱包</h1><WalletAssetTabs :model-value="asset" :disabled="!!visualFixture" @update:model-value="selectAsset" /></div>
    <div v-if="loadError" class="status-banner wallet-status" role="alert"><UmIcon name="shield" /><span>{{ loadError }}</span><button class="outline" :disabled="loading" @click="loadAll">重新加载</button></div>
    <div v-if="!visualFixture && partialData" class="status-banner wallet-status" role="status"><UmIcon name="clock" /><span>钱包总额或今日收支尚未取得，请重新加载。</span><button class="outline" :disabled="loading" @click="loadAll">重新加载</button></div>
    <section class="wallet-hero">
      <div><span>可用余额 · {{ asset }}</span><h1>{{ money(account?.available) }}</h1><p>USDT、USDC 独立记账，余额不合并</p></div>
      <UmIcon name="wallet" />
      <div class="button-row"><button class="gold" @click="walletLink('/wallet/deposit')">转入 <UmIcon name="plus" /></button><button class="outline" @click="walletLink('/wallet/withdraw')">转出 <UmIcon name="arrow" /></button><button @click="walletLink('/wallet/history')">交易记录 ↗</button></div>
    </section>
    <div class="stats-grid" aria-label="钱包概况">
      <section class="paper"><span>锁仓余额</span><h2>{{ money(account?.lockedFinance) }} <small>{{ asset }}</small></h2></section>
      <section class="paper"><span title="北京时间今日链上转出，不含商品消费、退款、冻结或理财划转">今日链上转出</span><h2>{{ money(today?.withdrawOut) }} <small>{{ asset }}</small></h2></section>
      <section class="paper"><span>资产币种</span><h2>{{ asset }} <small>稳定币</small></h2></section>
    </div>
    <section class="paper">
      <div class="section-heading"><h2>最近交易</h2><button @click="walletLink('/wallet/history')">查看全部 →</button></div>
      <button v-for="txn in recentTxns.slice(0, 4)" :key="txn.id" type="button" class="transaction wallet-transaction" :aria-label="`${transactionLabel(txn)}，${txn.direction === 'in' ? '收入' : '支出'} ${money(txn.amount)} ${txnAsset(txn)}，查看交易详情`" @click="openDetail(txn)">
        <UmIcon :name="transactionIcon(txn)" />
        <span class="transaction-copy"><b>{{ transactionLabel(txn) }}</b><small>{{ formatDateValue(txn.createdAt) }}</small><small v-if="showProductionDetails && txn.remark" class="ledger-caption">{{ txn.remark }}</small><small v-if="showProductionDetails && (txn.bucketFrom || txn.bucketTo)" class="ledger-caption">{{ txn.bucketFrom ? enums.BUCKET_META[txn.bucketFrom]?.label || '未知账户' : '' }}{{ txn.bucketFrom && txn.bucketTo ? ' → ' : '' }}{{ txn.bucketTo ? enums.BUCKET_META[txn.bucketTo]?.label || '未知账户' : '' }}</small></span>
        <b>{{ txn.direction === 'in' ? '+' : '−' }} {{ money(txn.amount) }} {{ txnAsset(txn) }}</b>
      </button>
      <p v-if="!recentTxns.length" class="muted center" role="status">{{ loading ? '正在加载最近交易…' : loadError ? '最近交易暂不可用，请重新加载。' : '暂无资金流水。充值、转出或订单支付后可在此查看。' }}</p>
    </section>
    <!-- v47 production supplement: real buckets and safety entry points have no complete prototype panel. -->
    <section v-if="showProductionDetails" class="paper wallet-assets" :aria-busy="walletStore.loadingByAsset[asset]">
      <div class="section-heading"><h2>资产明细</h2><span class="wallet-total">资产总额 <b>{{ money(totalAssets) }}</b> {{ asset }}</span></div>
      <div class="wallet-cashflow" title="按北京时间自然日统计，仅含链上充值和转出"><span>今日链上充值 <b>{{ money(today?.depositIn) }} {{ asset }}</b></span><span>今日链上转出 <b>{{ money(today?.withdrawOut) }} {{ asset }}</b></span></div>
      <button v-for="bucket in assetBuckets" :key="bucket.key" type="button" class="transaction asset-bucket" @click="goBucket(bucket.key)"><UmIcon :name="bucketIcons[bucket.key]" /><span class="transaction-copy"><b>{{ bucket.label }}</b><small>{{ bucket.hint }}</small></span><b>{{ money(bucket.value) }} <small>{{ asset }}</small><span v-if="bucket.ratio != null" class="bucket-ratio">{{ formatFinanceRate(bucket.ratio, 1, '暂不可用') }}</span></b><UmIcon name="arrow" /></button>
      <div v-if="!assetBuckets.length" class="empty"><UmIcon name="wallet" /><h2>{{ loading ? '正在读取资产…' : '资产暂不可用' }}</h2><p>重新加载后查看完整资产明细。</p><button class="outline" :disabled="loading" @click="loadAll">重新加载</button></div>
    </section>
    <section v-if="showProductionDetails" class="paper wallet-safety">
      <div class="section-heading"><h2>支付安全</h2></div>
      <div v-if="!visualFixture && userStore.currentUser?.status === '2'" class="status-banner" role="status"><UmIcon name="shield" /><span>当前账户受到限制，请核对账户状态后再操作。</span></div>
      <div v-if="!visualFixture && userStore.currentUser?.withdrawRequiresAudit" class="status-banner" role="status"><UmIcon name="clock" /><span>转出申请需要审核，处理结果以申请记录为准。</span></div>
      <div class="wallet-security-links"><button class="outline" @click="router.push('/kyc')"><UmIcon name="shield" />实名认证<UmIcon name="arrow" /></button><button class="outline" @click="router.push('/profile/pay-password')"><UmIcon name="wallet" />支付密码<UmIcon name="arrow" /></button><button class="text-link" @click="walletLink('/wallet/history')">查看完整流水与导出<UmIcon name="arrow" /></button></div>
      <p class="muted">转出申请的认证、支付密码及审核状态，可在对应操作中核对。</p>
    </section>
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped src="../../components/wallet/v47-wallet.css"></style>
