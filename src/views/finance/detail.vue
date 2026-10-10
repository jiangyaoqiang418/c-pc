<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@iconify/vue';
import DescriptionList from '@/components/common/description-list.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { formatAmount, formatRate } from '@shared';
import * as financeApi from '@/service/api/finance';
import InterestPreview from '@/components/finance/interest-preview.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { financialSubmissionIssue, financialSubmissionSnapshot, submitKeyedFinancialOperation, type FinancialSnapshot } from '@/utils/financial-submission';
import { requestPayPassword } from '@/utils/pay-password';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const product = ref<Api.RealFinance.FinanceProductVO>();
const loading = ref(false);
const loadError = ref('');
const walletLoadError = ref('');
const subscribing = ref(false);
const submissionIssue = ref('');
const pendingSnapshot = ref<FinancialSnapshot>();
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

const id = computed(() => String(route.params.id));
const reloadingWallet = ref(false);
const walletUnavailable = computed(() => !!walletLoadError.value || (!loading.value && walletStore.account?.available === undefined));

async function retryWallet() {
  const userId = userStore.currentUser?.id;
  if (userId === undefined || loading.value || subscribing.value || reloadingWallet.value) return;
  const isCurrent = requestGuard.begin();
  reloadingWallet.value = true;
  walletLoadError.value = '';
  try {
    await walletStore.fetchWallet(userId);
  } catch {
    if (isCurrent()) walletLoadError.value = '钱包余额加载失败，已暂时禁用申购。';
  } finally {
    if (isCurrent()) reloadingWallet.value = false;
  }
}
function refreshSubmissionIssue() {
  submissionIssue.value = financialSubmissionIssue(userStore.currentUser?.id, `finance-subscribe:${id.value}`);
  pendingSnapshot.value = financialSubmissionSnapshot(userStore.currentUser?.id, `finance-subscribe:${id.value}`);
}

async function loadAll() {
  const isCurrent = requestGuard.begin();
  reloadingWallet.value = false;
  const user = userStore.currentUser;
  if (!user) {
    loading.value = false;
    product.value = undefined;
    loadError.value = '';
    walletLoadError.value = '';
    return;
  }
  const targetId = id.value;
  if (product.value && String(product.value.id) !== targetId) product.value = undefined;
  loading.value = true;
  loadError.value = '';
  walletLoadError.value = '';
  const current = () => isCurrent() && id.value === targetId && String(userStore.currentUser?.id) === String(user.id);
  void walletStore.fetchWallet(user.id).catch(() => {
    if (current()) walletLoadError.value = '钱包余额加载失败，已暂时禁用申购。';
  });
  try {
    const detail = await financeApi.fetchFinanceProductDetail(targetId, { signal: isCurrent.signal, showError: false });
    if (current()) product.value = detail;
  } catch {
    if (current()) loadError.value = '产品信息加载失败，请检查网络后重试。';
  } finally {
    if (current()) loading.value = false;
  }
}

onMounted(() => {
  refreshSubmissionIssue();
  window.addEventListener('storage', refreshSubmissionIssue);
  window.addEventListener('focus', refreshSubmissionIssue);
  void loadAll();
});
onBeforeUnmount(() => {
  window.removeEventListener('storage', refreshSubmissionIssue);
  window.removeEventListener('focus', refreshSubmissionIssue);
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  refreshSubmissionIssue();
  writeVersion += 1;
  subscribing.value = false;
  void loadAll();
});

async function onSubscribe(amount: string) {
  refreshSubmissionIssue();
  if (submissionIssue.value) return;
  if (!product.value || !userStore.currentUser || subscribing.value || loading.value || reloadingWallet.value || walletStore.loading || loadError.value || walletUnavailable.value) return;
  const statusIssue = financeApi.financeSubscriptionIssue(product.value);
  if (statusIssue) { Message.warning(statusIssue); return; }
  const requestedUserId = userStore.currentUser.id;
  const requestedProductId = product.value.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && String(product.value?.id) === String(requestedProductId);
  subscribing.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrentWrite()) return;
    activePayPassword = payPassword;
    let orderId: string | number;
    try {
      orderId = await submitKeyedFinancialOperation(requestedUserId, `finance-subscribe:${requestedProductId}`,
        { productId: requestedProductId, amount }, subscriptionIntentApi);
      if (isCurrentWrite()) refreshSubmissionIssue();
    } catch (error) {
      if (isCurrentWrite()) {
        refreshSubmissionIssue();
        if (submissionIssue.value) Message.warning(submissionIssue.value);
        else Message.error(error instanceof Error ? error.message : '申购未能提交');
      }
      return;
    }
    if (orderId !== undefined && orderId !== null && isCurrentWrite()) {
      Message.success(`订阅成功 · 已锁定 U ${formatAmount(amount)}`);
      void walletStore.refetch().catch(() => {
        if (isCurrentWrite()) Message.warning('订阅已成功，钱包余额刷新失败，请稍后刷新查看');
      });
      try {
        await router.push({ name: 'finance-lockup-detail', params: { id: String(orderId) } });
      } catch {
        if (isCurrentWrite()) Message.warning('订阅已成功，请前往我的锁仓查看');
      }
    }
  } finally {
    activePayPassword = '';
    if (operation === writeVersion) subscribing.value = false;
  }
}

let activePayPassword = '';
const subscriptionIntentApi = {
  lookup: financeApi.fetchFinanceOrderByKey,
  submit: (snapshot: FinancialSnapshot, idempotencyKey: string) => financeApi.subscribeFinance({ productId: snapshot.productId!, amount: snapshot.amount, idempotencyKey, payPassword: activePayPassword }, { showError: false })
};

async function restoreSubscription() {
  const userId = userStore.currentUser?.id;
  const productId = id.value;
  if (userId === undefined || subscribing.value) return;
  const operation = ++writeVersion;
  subscribing.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword) return;
    activePayPassword = payPassword;
    const orderId = await submitKeyedFinancialOperation(userId, `finance-subscribe:${productId}`, undefined, subscriptionIntentApi, true);
    if (operation !== writeVersion || id.value !== productId || String(userStore.currentUser?.id) !== String(userId)) return;
    refreshSubmissionIssue();
    await router.push({ name: 'finance-lockup-detail', params: { id: String(orderId) } });
  } catch (error) {
    if (operation === writeVersion) Message.warning(error instanceof Error ? error.message : '原申购核对失败');
  } finally {
    activePayPassword = '';
    if (operation === writeVersion) { subscribing.value = false; refreshSubmissionIssue(); }
  }
}

function handleEmptyAction() {
  if (loadError.value) {
    loadAll();
    return;
  }
  router.push('/finance');
}


</script>

<template>

  <div class="detail-page">
    <nav class="bread" aria-label="面包屑"><RouterLink to="/finance">小金库</RouterLink><span>/</span><span>{{ product?.name || '产品详情' }}</span></nav>
    <div v-if="submissionIssue" class="notice" role="alert"><Icon icon="lucide:circle-alert" width="20" /><div><p>{{ submissionIssue }}。恢复先查原单，仅明确未落地才按原键原参重试；旧无键记录不会重发。</p><small v-if="pendingSnapshot">待核对申购：产品 {{ pendingSnapshot.productId }} · U {{ formatAmount(pendingSnapshot.amount) }}</small><div class="button-row"><Button variant="outline" size="sm" :disabled="subscribing" @click="restoreSubscription">恢复原申购</Button><Button variant="outline" size="sm" @click="router.push('/finance/my-lockups')">查看我的锁仓</Button></div></div></div>
    <div v-if="loadError && product" class="notice error-notice" role="alert"><span>{{ loadError }} 当前展示上次读取的产品信息，已暂停申购。</span><Button variant="outline" size="sm" :disabled="loading" @click="loadAll">重新加载</Button></div>
    <div v-if="walletUnavailable" class="notice" role="alert"><span>{{ walletLoadError || '可用余额尚未取得，已暂时禁用申购。' }} 投入金额保持不变。</span><Button variant="outline" size="sm" :disabled="loading || subscribing || reloadingWallet" @click="retryWallet">{{ reloadingWallet ? '正在读取…' : '重新读取余额' }}</Button></div>
    <div v-if="loading && !product" class="layout" aria-busy="true" aria-label="正在读取理财产品"><Skeleton class="product-skeleton" /><Skeleton class="preview-skeleton" /></div>
    <div v-else-if="product" class="layout">
      <section class="paper product-info"><div class="product-title"><span class="asset-icon"><Icon icon="lucide:lock-keyhole" width="28" /></span><div><span class="eyebrow">USDT LOCKED VAULT</span><h1>{{ product.name }}</h1><small>{{ product.code }}</small></div></div>
        <p class="description">{{ product.description || '—' }}</p>
        <div class="product-rate"><small>参考年化 · 按日单利</small><strong>{{ formatRate(Number(product.annualRate)) }}</strong></div>
        <DescriptionList :columns="2" :items="[{ label: '锁仓期限', value: product.lockDays + ' 天' }, { label: '起投金额', value: formatAmount(product.minAmount) + ' USDT' }, { label: '单笔上限', value: product.maxAmount ? formatAmount(product.maxAmount) + ' USDT' : '不限' }, { label: '提前赎回', value: product.earlyRedeemEnabled ? '以订单报价为准' : '不支持提前赎回' }]" />
        <div class="rules"><h2>每一步，提前看清</h2><p><Icon icon="lucide:clock" width="18" />按日单利计息，具体收益以订单详情为准。</p><p><Icon icon="lucide:wallet" width="18" />锁仓期间本金不可用于购物或转出。</p><p><Icon icon="lucide:undo-2" width="18" />提前赎回是否开放、违约费及净利息，以订单最新报价为准。</p><p><Icon icon="lucide:circle-check" width="18" />到期本金与利息由系统结算，到账状态以订单为准。</p></div>
      </section>
      <aside><InterestPreview v-if="userStore.currentUser" :product="product" :available-balance="walletUnavailable || loadError || loading || reloadingWallet || walletStore.loading ? undefined : walletStore.account?.available" :submitting="subscribing" :disabled-reason="submissionIssue" @subscribe="onSubscribe" /></aside>
    </div>
    <EmptyState v-else :title="loadError ? '产品加载失败' : '小金库产品不存在'" :description="loadError || undefined" :action-text="loadError ? '重新加载' : '返回列表'" @action="handleEmptyAction" />
  </div>

</template>

<style scoped>

.detail-page { padding-bottom:32px; }.bread { display:flex; gap:12px; font-size:13px; color:var(--yb-muted); margin-bottom:24px; }.bread a { text-decoration:none; color:var(--yb-muted); }.bread a:hover { color:var(--yb-brand-primary); }.notice { display:flex; gap:16px; align-items:flex-start; padding:20px 24px; border-radius:16px; background:var(--yb-primary-soft); margin-bottom:20px; font-size:13px; line-height:1.8; }.notice>svg { flex:none; color:var(--yb-brand-primary); margin-top:4px; }.notice>span,.notice>div { flex:1; min-width:0; }.notice p { margin:0; }.notice small { font-size:12px; overflow-wrap:anywhere; }.error-notice { background:var(--yb-danger-soft); color:var(--yb-danger); }.button-row { display:flex; gap:12px; flex-wrap:wrap; margin-top:14px; }.layout { display:grid; grid-template-columns:minmax(0,1fr) 370px; gap:24px; align-items:start; }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:22px; padding:36px; }.product-title { display:flex; gap:18px; align-items:center; }.asset-icon { display:inline-flex; padding:18px; border-radius:20px; background:var(--yb-primary-soft); color:var(--yb-brand-primary); flex:none; }.eyebrow { font-size:12px; letter-spacing:.1em; color:var(--yb-gold); }.product-title h1 { font-size:28px; font-weight:650; margin:6px 0 4px; overflow-wrap:anywhere; }.product-title small { color:var(--yb-muted); font-size:12px; font-family:var(--yb-font-mono); }.description { font-size:14px; color:var(--yb-muted); line-height:1.8; white-space:pre-wrap; overflow-wrap:anywhere; margin:24px 0; }.product-rate { display:flex; flex-direction:column; gap:4px; margin:28px 0; padding:24px 0; border-top:1px solid var(--yb-hairline); border-bottom:1px solid var(--yb-hairline); }.product-rate small { font-size:13px; color:var(--yb-muted); }.product-rate strong { font-family:var(--yb-font-mono); font-size:44px; font-weight:500; color:var(--yb-brand-primary); }.rules { border-top:1px solid var(--yb-hairline); padding-top:24px; margin-top:28px; }.rules h2 { font-size:20px; font-weight:600; margin:0 0 16px; }.rules p { display:flex; gap:12px; align-items:flex-start; font-size:13px; color:var(--yb-muted); margin:12px 0; line-height:1.8; }.rules p svg { flex:none; margin-top:3px; color:var(--yb-brand-primary); }.layout aside { position:sticky; top:190px; }.product-skeleton { height:650px; border-radius:22px; }.preview-skeleton { height:600px; border-radius:20px; }@media(max-width:1150px) { .layout { grid-template-columns:minmax(0,1fr) 340px; }.paper { padding:28px; } }

</style>
