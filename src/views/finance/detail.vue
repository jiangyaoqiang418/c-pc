<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { formatAmount, formatRate } from '@shared';
import * as financeApi from '@/service/api/finance';
import InterestPreview from '@/components/finance/interest-preview.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { financialSubmissionIssue, financialSubmissionSnapshot, submitFinancialOperation, type FinancialSnapshot } from '@/utils/financial-submission';

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
    let orderId: string | number;
    try {
      orderId = await submitFinancialOperation(requestedUserId, `finance-subscribe:${requestedProductId}`,
        () => financeApi.subscribeFinance({ productId: requestedProductId, amount }, { showError: false }), result => result,
        { productId: requestedProductId, amount });
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

function handleEmptyAction() {
  if (loadError.value) {
    loadAll();
    return;
  }
  router.push('/finance');
}
</script>

<template>
  <div class="detail-page shop-container">
    <a-alert v-if="submissionIssue" type="warning" :closable="false" class="wallet-alert">
      {{ submissionIssue }}。请在我的锁仓核对记录；本页不会自动重新申购。
      <div v-if="pendingSnapshot">待核对申购：产品 {{ pendingSnapshot.productId }} · U {{ formatAmount(pendingSnapshot.amount) }}</div>
      <template #action><a-button size="mini" @click="router.push('/finance/my-lockups')">查看我的锁仓</a-button></template>
    </a-alert>
    <a-alert v-if="loadError && product" type="error" :closable="false" class="wallet-alert">
      {{ loadError }} 当前展示上次读取的产品信息，已暂停申购。
      <template #action><a-button size="mini" :loading="loading" @click="loadAll">重新加载</a-button></template>
    </a-alert>
    <a-alert v-if="walletUnavailable" type="warning" :closable="false" class="wallet-alert">
      {{ walletLoadError || '可用余额尚未取得，已暂时禁用申购。' }} 投入金额保持不变。
      <template #action><a-button size="mini" :loading="reloadingWallet" :disabled="loading || subscribing" @click="retryWallet">重新读取余额</a-button></template>
    </a-alert>
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="product">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item role="link" tabindex="0" @click="router.push('/finance')" @keydown.enter="router.push('/finance')" @keydown.space.prevent="router.push('/finance')">小金库</a-breadcrumb-item>
          <a-breadcrumb-item>{{ product.name }}</a-breadcrumb-item>
        </a-breadcrumb>

        <div class="layout">
          <a-card class="info-card" :body-style="{ padding: '28px 32px' }" :bordered="false">
            <div class="head">
              <h1 class="title">{{ product.name }}</h1>
              <a-tag color="purple" size="medium">{{ product.code }}</a-tag>
            </div>
            <div class="big-meta">
              <div class="meta-cell">
                <div class="lbl">基准年化利率</div>
                <div class="val rate">{{ formatRate(Number(product.annualRate)) }}</div>
              </div>
              <div class="meta-cell">
                <div class="lbl">锁定期</div>
                <div class="val">{{ product.lockDays }} 天</div>
              </div>
              <div class="meta-cell">
                <div class="lbl">起投金额</div>
                <div class="val">U {{ formatAmount(product.minAmount) }}</div>
              </div>
              <div class="meta-cell">
                <div class="lbl">单笔上限</div>
                <div class="val">{{ product.maxAmount ? 'U ' + formatAmount(product.maxAmount) : '不限' }}</div>
              </div>
            </div>

            <a-divider />

            <div class="section-title">产品说明</div>
            <p class="desc">{{ product.description || '—' }}</p>

            <div class="section-title">收益规则</div>
            <ul class="rules">
              <li>按日单利计息，具体收益以订单详情为准。</li>
              <li>提前赎回本金全额退回，已产生利息按产品费率扣除违约费。</li>
              <li>到期后由系统自动结算本金与利息。</li>
            </ul>
          </a-card>

          <div class="aside">
            <InterestPreview
              v-if="product && userStore.currentUser"
              :product="product"
              :available-balance="walletUnavailable || loadError || loading || reloadingWallet || walletStore.loading ? undefined : walletStore.account?.available"
              :submitting="subscribing"
              :disabled-reason="submissionIssue"
              @subscribe="onSubscribe"
            />
          </div>
        </div>
      </template>

      <EmptyState
        v-else-if="!loading"
        :title="loadError ? '产品加载失败' : '小金库产品不存在'"
        :description="loadError || undefined"
        :action-text="loadError ? '重新加载' : '返回列表'"
        @action="handleEmptyAction"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.detail-page {
  padding-top: 16px;
}
.wallet-alert {
  margin-bottom: 12px;
}
.bread {
  margin-bottom: 12px;
}
.layout {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: 16px;
  align-items: start;
}
.info-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}
.big-meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.meta-cell {
  text-align: center;
}
.lbl {
  font-size: 12px;
  color: #86909c;
}
.val {
  font-size: 22px;
  font-weight: 700;
  color: #1d2129;
  font-family: ui-monospace, monospace;
  margin-top: 4px;
}
.val.rate {
  color: #00A88A;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin: 16px 0 8px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.desc {
  color: #4e5969;
  font-size: 13px;
  line-height: 1.7;
}
.rules {
  padding-left: 20px;
  color: #4e5969;
  font-size: 13px;
  line-height: 1.8;
}
.rules li {
  margin-bottom: 4px;
}
@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .head { align-items: flex-start; flex-direction: column; gap: 6px; }
  .big-meta { grid-template-columns: repeat(2, 1fr); gap: 14px 10px; }
  .info-card :deep(.arco-card-body), .aside :deep(.arco-card-body) { padding: 20px !important; }
  .val { font-size: 18px; }
}
</style>
