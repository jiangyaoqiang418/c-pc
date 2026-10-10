<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import { getUsdtCnyRate } from '@shared/utils/currency';
import * as financeApi from '@/service/api/finance';
import { useUserStore, useWalletStore } from '@/stores';
import InfoTooltip from '@/components/common/info-tooltip.vue';
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

const currentBalance = computed(() => walletStore.account?.lockedFinance);
const cnyEquiv = computed(() => currentBalance.value === undefined
  ? '—'
  : formatAmount((Number(currentBalance.value) * getUsdtCnyRate()).toFixed(2)));

const bestApy = computed(() => {
  const rates = products.value
    .map(p => Number(p.annualRate) * 100)
    .filter(rate => Number.isFinite(rate));
  return rates.length ? Math.max(...rates) : 0;
});

const totalAccruedInterest = computed(() => {
  const pendingInterest = overview.value?.pendingInterest;
  if (pendingInterest === undefined || pendingInterest === null || String(pendingInterest).trim() === '') return undefined;
  const value = Number(pendingInterest);
  return Number.isFinite(value) ? value.toFixed(2) : '—';
});

const availableProducts = computed(() => products.value.filter(p => p.status === 'ON_SALE'));
const featuredProducts = computed(() => availableProducts.value.filter(p => p.lockDays <= 30));
const strategyProducts = computed(() => availableProducts.value.filter(p => p.lockDays > 30));

function goDetail(p: Api.RealFinance.FinanceProductVO) {
  router.push({ name: 'finance-detail', params: { id: String(p.id) } });
}



function knownRate(value: string | number) {
  if (String(value).trim() === '') return '—';
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? (rate * 100).toFixed(2) + '%' : '—';
}
function listIcon(product: Api.RealFinance.FinanceProductVO) {
  return product.lockDays <= 7 ? 'lucide:droplets' : product.lockDays <= 30 ? 'lucide:wallet' : 'lucide:lock-keyhole';
}

</script>

<template>

  <div class="finance-page">
    <header class="page-heading"><div><span class="eyebrow">UMAOMAO EARN</span><h1>小金库</h1></div><Button variant="outline" @click="router.push('/finance/my-lockups')"><Icon icon="lucide:clock" width="17" />我的锁仓</Button></header>
    <nav class="page-links" aria-label="小金库导航"><RouterLink to="/finance" aria-current="page">锁仓产品</RouterLink><RouterLink to="/finance/my-lockups">我的锁仓</RouterLink></nav>
    <div v-if="loadError" class="notice" role="alert"><Icon icon="lucide:circle-alert" width="20" /><span>{{ loadError }}</span><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">重新加载</Button></div>
    <div v-if="loading" class="overview-grid" aria-busy="true" aria-label="正在读取理财资产"><Skeleton class="overview-skeleton" /><Skeleton class="overview-skeleton" /></div>
    <div v-else class="overview-grid">
      <section class="balance-card"><small>锁仓资产 · USDT</small><strong>{{ loadError.includes('钱包余额') ? '—' : formatAmount(currentBalance) }} <span>USDT</span></strong><p>≈ ¥{{ loadError.includes('钱包余额') ? '—' : cnyEquiv }} · 非实时参考折算</p><div class="balance-bottom"><div><small>待结算利息</small><b>{{ formatAmount(totalAccruedInterest) }} <span>USDT</span></b></div><Button variant="outline" class="balance-action" @click="router.push('/finance/my-lockups')">查看锁仓<Icon icon="lucide:arrow-right" width="16" /></Button></div></section>
      <section class="paper available-card"><span class="asset-icon"><Icon icon="lucide:wallet" width="28" /></span><small>钱包可用余额</small><strong>{{ loadError.includes('钱包余额') ? '—' : formatAmount(walletStore.account?.available) }} <span>USDT</span></strong><p>锁仓金额从可用余额划入，<br>到期结算以订单结果为准。</p><Button variant="link" @click="router.push('/wallet')">查看钱包<Icon icon="lucide:arrow-right" width="16" /></Button></section>
    </div>
    <section class="list-section">
      <div class="section-heading"><h2>锁仓产品</h2><span v-if="!loading && !productLoadError && bestApy > 0">当前产品最高参考年化 {{ bestApy.toFixed(2) }}%<InfoTooltip text="采用当前产品列表返回的年化利率，测算不是收益保证，实际以订单为准。" :size="14" /></span></div>
      <div v-if="loading" class="product-grid" aria-busy="true"><Skeleton v-for="n in 3" :key="n" class="product-skeleton" /></div>
      <template v-else>
        <template v-for="group in [{ label: '30 天以内', products: featuredProducts }, { label: '30 天以上', products: strategyProducts }]" :key="group.label">
          <h3 v-if="group.products.length" class="group-label">{{ group.label }}</h3>
          <div v-if="group.products.length" class="product-grid"><article v-for="p in group.products" :key="p.id" class="product-card">
            <div class="product-head"><span class="product-icon"><Icon :icon="listIcon(p)" width="23" /></span><div><h3>{{ p.name }}</h3><small>{{ p.code }} · USDT</small></div></div>
            <div class="rate"><small>参考年化 · 按日单利<InfoTooltip text="年化利率由产品接口返回，实际收益以锁仓订单为准。" :size="13" /></small><strong>{{ knownRate(p.annualRate) }}</strong></div>
            <div class="product-facts"><span>锁仓周期<b>{{ p.lockDays }} <small>天</small></b></span><span>起投金额<b>{{ formatAmount(p.minAmount) }} <small>USDT</small></b></span></div>
            <p class="product-rule"><Icon icon="lucide:clock" width="15" />到期结算以订单结果为准</p>
            <Button variant="outline" class="full" @click="goDetail(p)">查看产品<Icon icon="lucide:arrow-right" width="16" /></Button>
          </article></div>
        </template>
        <EmptyState v-if="!featuredProducts.length && !strategyProducts.length" :title="productLoadError ? '小金库产品加载失败' : '暂无可申购产品'" :description="productLoadError ? '产品列表请求失败，请检查网络后重试。' : '当前没有上架产品，已有锁仓仍可正常查看。'" :action-text="productLoadError ? '重新加载' : '查看我的锁仓'" @action="productLoadError ? loadAll() : router.push('/finance/my-lockups')" />
      </template>
    </section>
    <section class="how-it-works"><div><small>01</small><h3>选择周期</h3><p>核对年化、起投金额与期限</p></div><div><small>02</small><h3>确认锁仓</h3><p>预览收益，输入支付密码确认</p></div><div><small>03</small><h3>查看结算</h3><p>追踪锁仓进度与实际到账结果</p></div></section>
    <details class="rules"><summary>计息与提前赎回规则</summary><p>按日单利：本金 × 年化利率 ÷ 365 × 计息天数。每日计息不等于每日到账；提前赎回是否开放、违约费及可到账利息，以订单最新返回结果为准。</p></details>
  </div>

</template>

<style scoped>

.finance-page { padding-bottom:32px; }.page-heading,.section-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; }.page-heading { margin-bottom:24px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.page-heading h1 { font-size:30px; font-weight:650; margin:6px 0 0; }.page-links { display:flex; gap:28px; margin-bottom:24px; border-bottom:1px solid var(--yb-hairline); }.page-links a { color:var(--yb-muted); padding-bottom:13px; font-size:14px; text-decoration:none; }.page-links [aria-current] { color:var(--yb-brand-primary); border-bottom:2px solid var(--yb-brand-primary); }.notice { display:flex; align-items:center; gap:14px; padding:18px 24px; border-radius:16px; background:var(--yb-primary-soft); font-size:13px; margin-bottom:20px; }.notice span { flex:1; }.overview-grid { display:grid; grid-template-columns:1.5fr 1fr; gap:24px; margin-bottom:32px; }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:8px; }.balance-card { border-radius:8px; padding:32px; background:var(--yb-brand-primary); color:var(--primary-foreground); display:flex; flex-direction:column; }.balance-card>small { font-size:13px; opacity:.8; }.balance-card>strong { font-family:var(--yb-font-body); font-size:44px; font-weight:500; margin-top:12px; line-height:1.3; }.balance-card strong span { font-size:14px; font-weight:400; opacity:.8; }.balance-card>p { font-size:12px; opacity:.75; margin:10px 0 24px; }.balance-bottom { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; margin-top:auto; padding-top:20px; border-top:1px solid rgb(255 255 255 / 18%); }.balance-bottom div { display:flex; flex-direction:column; gap:4px; }.balance-bottom small { font-size:12px; opacity:.8; }.balance-bottom b { font-family:var(--yb-font-mono); font-size:20px; font-weight:500; }.balance-bottom b span { font-size:12px; }.balance-action { background:transparent; color:var(--primary-foreground); border-color:rgb(255 255 255 / 40%); }.available-card { padding:28px 32px; display:flex; flex-direction:column; align-items:flex-start; }.asset-icon { display:inline-flex; padding:13px; border-radius:16px; background:var(--yb-primary-soft); color:var(--yb-brand-primary); margin-bottom:16px; }.available-card>small { font-size:12px; color:var(--yb-muted); }.available-card>strong { font-size:28px; font-family:var(--yb-font-mono); font-weight:500; margin-top:5px; }.available-card>strong span { font-size:12px; color:var(--yb-muted); }.available-card p { font-size:13px; color:var(--yb-muted); margin:12px 0; }.available-card>button { padding-left:0; }.section-heading h2 { font-size:24px; font-weight:600; margin:0; }.section-heading>span { display:flex; align-items:center; color:var(--yb-muted); font-size:13px; }.group-label { font-size:14px; font-weight:500; margin:20px 0 14px; color:var(--yb-muted); }.product-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }.product-card { border:1px solid var(--yb-hairline); background:var(--yb-surface); padding:24px; border-radius:20px; transition:transform .2s,box-shadow .2s; }.product-card:hover { transform:translateY(-2px); box-shadow:var(--yb-shadow-1); }.product-head { display:flex; gap:14px; align-items:center; }.product-head h3 { font-size:17px; font-weight:600; margin:0 0 4px; }.product-head small { font-size:12px; color:var(--yb-muted); overflow-wrap:anywhere; }.product-icon { display:inline-flex; flex:none; padding:12px; border-radius:14px; color:var(--yb-brand-primary); background:var(--yb-primary-soft); }.rate { margin:24px 0; display:flex; flex-direction:column; gap:5px; }.rate>small { font-size:12px; color:var(--yb-muted); display:flex; align-items:center; }.rate>strong { font-family:var(--yb-font-mono); font-size:36px; font-weight:500; color:var(--yb-brand-primary); }.product-facts { display:grid; grid-template-columns:1fr 1fr; gap:20px; }.product-facts span { display:flex; flex-direction:column; gap:6px; font-size:12px; color:var(--yb-muted); }.product-facts b { font-size:18px; color:var(--yb-ink); font-family:var(--yb-font-mono); font-weight:500; }.product-facts b small { font-size:12px; color:var(--yb-muted); }.product-rule { display:flex; align-items:center; gap:6px; color:var(--yb-muted); font-size:12px; padding:16px 0; margin:16px 0 0; border-top:1px solid var(--yb-hairline); }.full { width:100%; }.how-it-works { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; margin:36px 0; padding:24px 0; border-top:1px solid var(--yb-hairline); border-bottom:1px solid var(--yb-hairline); }.how-it-works small { font-size:12px; color:var(--yb-gold); }.how-it-works h3 { font-size:17px; font-weight:600; margin:6px 0; }.how-it-works p,.rules p { font-size:13px; color:var(--yb-muted); line-height:1.8; margin:0; }.rules summary { font-size:14px; cursor:pointer; }.rules p { margin-top:12px; }.overview-skeleton { height:300px; border-radius:22px; }.product-skeleton { height:320px; border-radius:20px; margin-top:24px; }@media(prefers-reduced-motion:reduce) { .product-card { transition:none; }.product-card:hover { transform:none; } }

</style>
