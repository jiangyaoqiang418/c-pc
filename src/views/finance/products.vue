<script setup lang="ts">
import memeCat from '@/assets/images/v47/umaomao-meme-cat.svg';
import UmIcon from '@/components/common/um-icon.vue';
import V47VaultHeader from '@/components/finance/v47-vault-header.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { formatAmount } from '@shared';
import * as financeApi from '@/service/api/finance';
import { useUserStore, useWalletStore } from '@/stores';
import EmptyState from '@/components/common/empty-state.vue';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const products = ref<Api.RealFinance.FinanceProductVO[]>([]);
const overview = ref<Api.RealFinance.FinanceOverviewVO>();
const loading = ref(false);
const loadError = ref('');
const productLoadError = ref(false);
const requestGuard = createLatestRequestGuard();

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    products.value = [];
    overview.value = undefined;
    productLoadError.value = false;
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loading.value = true;
  loadError.value = '';
  productLoadError.value = false;
  try {
    const [productsResult, overviewResult, walletResult] = await Promise.allSettled([
      financeApi.fetchFinanceProducts({ signal: isCurrent.signal, showError: false }),
      financeApi.fetchFinanceOverview({ signal: isCurrent.signal, showError: false }),
      walletStore.fetchWallet(userId)
    ]);
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    if (productsResult.status === 'fulfilled') products.value = productsResult.value;
    productLoadError.value = productsResult.status === 'rejected';
    overview.value = overviewResult.status === 'fulfilled' ? overviewResult.value : undefined;
    const failedSections = [
      productsResult.status === 'rejected' ? '产品列表' : '',
      overviewResult.status === 'rejected' ? '收益概览' : '',
      walletResult.status === 'rejected' ? '钱包余额' : ''
    ].filter(Boolean);
    if (failedSections.length) {
      loadError.value = `${failedSections.join('、')}加载失败，请稍后重试。${productLoadError.value && products.value.length ? '当前产品为上次读取结果。' : ''}`;
    }
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(loadAll);
onBeforeUnmount(requestGuard.invalidate);
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  products.value = [];
  overview.value = undefined;
  void loadAll();
});

const showBalance = ref(true);
const period = ref('全部');
const availableProducts = computed(() => products.value.filter(p => p.status === 'ON_SALE'));
const shownProducts = computed(() => availableProducts.value.filter(p => period.value === '全部'
  || period.value === '30 天以内' && p.lockDays <= 30 || period.value === '90 天' && p.lockDays === 90));
const currentBalance = computed(() => overview.value?.holdingPrincipal ?? walletStore.account?.lockedFinance);
const balanceUnavailable = computed(() => loadError.value.includes('钱包余额'));
function planTone(product: Api.RealFinance.FinanceProductVO) {
  return product.lockDays <= 7 ? 'sage' : product.lockDays <= 30 ? 'forest' : 'gold';
}
function planLabel(product: Api.RealFinance.FinanceProductVO) {
  return product.lockDays <= 7 ? '短期规划' : product.lockDays <= 30 ? '月度规划' : '长期规划';
}
function goDetail(p: Api.RealFinance.FinanceProductVO) {
  router.push({ name: 'finance-detail', params: { id: String(p.id) } });
}



function knownRate(value: string | number) {
  if (String(value).trim() === '') return '—';
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? (rate * 100).toFixed(2) + '%' : '—';
}
</script>

<template>
  <div class="vault-workspace">
    <V47VaultHeader section="products" :holding-count="overview?.holdingCount" />
    <div v-if="loadError" class="status-banner vault-production-notice" role="alert"><UmIcon name="return" /><span>{{ loadError }}</span><button class="outline" :disabled="loading" @click="loadAll">重新读取</button></div>
    <div v-if="loading" class="vault-overview" aria-busy="true" aria-label="正在读取理财资产"><Skeleton class="vault-overview-skeleton" /><Skeleton class="vault-overview-skeleton" /></div>
    <div v-else class="vault-overview">
      <section class="vault-balance-card"><div class="vault-card-top"><span><UmIcon name="shield" />锁仓资产 · USDT</span><button :aria-label="showBalance ? '隐藏资产金额' : '显示资产金额'" :aria-pressed="!showBalance" @click="showBalance = !showBalance"><UmIcon name="eye" /></button></div><div class="vault-total">{{ showBalance ? formatAmount(currentBalance) : '••••••' }}<small>USDT</small></div><div class="vault-balance-bottom"><span>待结算利息<strong>{{ showBalance ? overview ? '+ ' + formatAmount(overview.pendingInterest, { decimals: 4 }) : '—' : '••••' }}</strong></span><span>每日预估利息<strong>{{ showBalance ? '待确认' : '••••' }}</strong></span><button aria-label="查看锁仓资产" @click="router.push('/finance/my-lockups')"><UmIcon name="arrow" /></button></div><div class="vault-orbit" aria-hidden="true"><img :src="memeCat" alt="" /></div></section>
      <section class="vault-available"><span class="vault-token">₮</span><div><small>钱包可用余额</small><strong>{{ balanceUnavailable ? '—' : formatAmount(walletStore.account?.available) }} <em>USDT</em></strong></div><p>锁仓金额从可用余额划入，<br />到期自动结算本金与利息。</p><button class="text-link" @click="router.push('/wallet')">查看钱包<UmIcon name="arrow" /></button></section>
    </div>
    <div class="vault-section-heading"><div><h2>锁仓产品</h2></div><div class="vault-periods" role="group" aria-label="筛选锁仓期限"><button v-for="value in ['全部', '30 天以内', '90 天']" :key="value" :class="{ active: period === value }" :aria-pressed="period === value" @click="period = value">{{ value }}</button></div></div>
    <div v-if="loading" class="vault-plans" aria-busy="true"><Skeleton v-for="n in 3" :key="n" class="vault-plan-skeleton" /></div>
    <div v-else-if="shownProducts.length" class="vault-plans"><article v-for="p in shownProducts" :key="p.id" class="vault-plan" :class="'vault-tone-' + planTone(p)"><div class="vault-plan-top"><span class="vault-token">₮</span><div><h3>{{ p.name }}</h3><small>USDT · {{ planLabel(p) }}</small></div><span class="vault-plan-tag">在售</span></div><div class="vault-plan-yield" style="display:contents"><div class="vault-rate"><span>参考年化 · APR</span><strong>{{ knownRate(p.annualRate).replace('%', '') }}<small>%</small></strong></div><div class="vault-term-badge" hidden><span>锁仓周期</span><strong>{{ p.lockDays }}<small>天</small></strong><UmIcon name="clock" /></div></div><div class="vault-plan-meta"><span class="vault-legacy-term">锁仓周期<b>{{ p.lockDays }} <small>天</small></b></span><span>起投金额<b>{{ formatAmount(p.minAmount) }} <small>USDT</small></b></span></div><div class="vault-plan-rule"><UmIcon name="clock" />每日计息 · 到期自动结算</div><button @click="goDetail(p)">查看产品<UmIcon name="arrow" /></button></article></div>
    <EmptyState v-else :title="productLoadError ? '小金库产品加载失败' : '暂无可申购产品'" :description="productLoadError ? '产品列表请求失败，请检查网络后重试。' : period === '全部' ? '当前没有上架产品，已有锁仓仍可正常查看。' : '当前期限没有上架产品，可以切换其他期限查看。'" :action-text="productLoadError ? '重新读取' : '查看我的锁仓'" @action="productLoadError ? loadAll() : router.push('/finance/my-lockups')" />
    <section class="vault-how"><div><span>01</span><h3>选择周期</h3><p>核对年化、起投金额与期限</p></div><div><span>02</span><h3>确认锁仓</h3><p>预览收益，确认资金安排</p></div><div><span>03</span><h3>按日计息</h3><p>追踪进度，到期自动结算</p></div></section>
    <details class="vault-rules"><summary>计息与提前赎回规则<UmIcon name="chevron" /></summary><p>按日单利：本金 × 年化利率 ÷ 365 × 计息天数。每日计息不等于每日到账；到期后系统自动结算本金与利息。提前赎回是否开放、违约费及可到账利息，以订单最新确认结果为准。实际利率以产品及申购确认参数为准。</p></details>
  </div>
</template>

<style scoped src="./v47-vault.css"></style>
