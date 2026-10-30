<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import V47VaultHeader from '@/components/finance/v47-vault-header.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { formatFinanceAmount as formatAmount, formatFinanceRate as formatRate } from '@/components/finance/v47-interest-math';
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
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
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
watch([() => route.params.id, () => userStore.currentUser?.id, () => userStore.sessionVersion], ([nextId, nextUserId, nextSession], [prevId, prevUserId, prevSession]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId) && nextSession === prevSession) return;
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
    let orderId: string | number;
    try {
      orderId = await submitKeyedFinancialOperation(requestedUserId, `finance-subscribe:${requestedProductId}`,
        { productId: requestedProductId, amount }, createSubscriptionIntentApi(payPassword, isCurrentWrite));
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
    if (operation === writeVersion) subscribing.value = false;
  }
}

function createSubscriptionIntentApi(payPassword: string, isCurrentWrite: () => boolean) {
  return {
    lookup: financeApi.fetchFinanceOrderByKey,
    submit: (snapshot: FinancialSnapshot, idempotencyKey: string) => {
      if (!isCurrentWrite()) throw new Error('页面或账号已变化，原申购保留待核对');
      return financeApi.subscribeFinance({ productId: snapshot.productId!, amount: snapshot.amount, idempotencyKey, payPassword }, { showError: false });
    }
  };
}

async function restoreSubscription() {
  const userId = userStore.currentUser?.id;
  const productId = id.value;
  if (userId === undefined || subscribing.value) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && id.value === productId
    && String(userStore.currentUser?.id) === String(userId);
  subscribing.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrentWrite()) return;
    const orderId = await submitKeyedFinancialOperation(userId, `finance-subscribe:${productId}`, undefined, createSubscriptionIntentApi(payPassword, isCurrentWrite), true);
    if (!isCurrentWrite()) return;
    refreshSubmissionIssue();
    await router.push({ name: 'finance-lockup-detail', params: { id: String(orderId) } });
  } catch (error) {
    if (isCurrentWrite()) Message.warning(error instanceof Error ? error.message : '原申购核对失败');
  } finally {
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
  <div class="vault-workspace">
    <V47VaultHeader section="products" />
    <button class="vault-back" @click="router.push('/finance')"><UmIcon name="chevron" />全部产品</button>
    <div v-if="submissionIssue" class="status-banner vault-production-notice" role="alert"><UmIcon name="shield" /><div><p>{{ submissionIssue }}。请先核实原申购结果，再继续操作。</p><small v-if="pendingSnapshot">待核对申购：产品 {{ pendingSnapshot.productId }} · {{ formatAmount(pendingSnapshot.amount) }} USDT</small><div class="button-row"><button class="outline" :disabled="subscribing" @click="restoreSubscription">恢复原申购</button><button class="outline" @click="router.push('/finance/my-lockups')">查看我的锁仓</button></div></div></div>
    <div v-if="loadError && product" class="status-banner vault-production-notice" role="alert"><UmIcon name="return" /><span>{{ loadError }} 当前展示上次读取的产品信息，已暂停申购。</span><button class="outline" :disabled="loading || subscribing" @click="loadAll">重新加载</button></div>
    <div v-if="walletUnavailable" class="status-banner vault-production-notice" role="alert"><UmIcon name="wallet" /><span>{{ walletLoadError || '余额暂不可用，暂无法申购，请重新加载。' }} 投入金额保持不变。</span><button class="outline" :disabled="loading || subscribing || reloadingWallet" @click="retryWallet">{{ reloadingWallet ? '正在读取…' : '重新加载余额' }}</button></div>
    <div v-if="loading && !product" class="vault-product-layout" aria-busy="true" aria-label="正在读取理财产品"><Skeleton class="vault-detail-skeleton" /><Skeleton class="vault-detail-skeleton" /></div>
    <div v-else-if="product" class="vault-product-layout">
      <section class="vault-product-info"><div class="vault-product-title"><span class="vault-token">₮</span><div><h2>{{ product.name }}</h2></div></div><p>{{ product.description || '—' }}</p><div class="vault-product-rate"><span>参考年化 · APR</span><strong>{{ formatRate(product.annualRate) }}<small>按日单利</small></strong></div><div class="vault-product-facts"><span>锁仓期限<b>{{ product.lockDays }} 天</b></span><span>起投金额<b>{{ formatAmount(product.minAmount) }} USDT</b></span><span>单笔上限<b>{{ product.maxAmount === undefined || product.maxAmount === null ? '不限' : formatAmount(product.maxAmount) + ' USDT' }}</b></span><span>结算方式<b>到期自动结算</b></span></div><div class="vault-product-rules"><h3>计息与赎回规则</h3><p><UmIcon name="clock" />每日累计利息，到期后结算到账。</p><p><UmIcon name="wallet" />锁仓期间本金不可用于购物或转出。</p><p><UmIcon name="return" />{{ product.earlyRedeemEnabled ? '提前赎回按订单报价扣除利息违约费。' : '当前产品不支持提前赎回。' }}</p></div></section>
      <InterestPreview v-if="userStore.currentUser" :product="product" :available-balance="walletUnavailable || loadError || loading || reloadingWallet || walletStore.loading ? undefined : walletStore.account?.available" :submitting="subscribing" :disabled-reason="submissionIssue" @subscribe="onSubscribe" />
    </div>
    <EmptyState v-else :title="loadError ? '产品加载失败' : '小金库产品不存在'" :description="loadError || undefined" :action-text="loadError ? '重新加载' : '返回小金库'" @action="handleEmptyAction" />
  </div>
</template>

<style scoped src="./v47-vault.css"></style>
