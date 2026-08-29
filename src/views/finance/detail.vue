<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as financeApi from '@/service/api/finance';
import InterestPreview from '@/components/finance/interest-preview.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const product = ref<Api.RealFinance.FinanceProductVO>();
const loading = ref(false);
const loadError = ref('');
const requestGuard = createLatestRequestGuard();

const id = computed(() => String(route.params.id));

async function loadAll() {
  const isCurrent = requestGuard.begin();
  const user = userStore.currentUser;
  if (!user) return;
  loading.value = true;
  loadError.value = '';
  try {
    const p = await financeApi.fetchFinanceProductDetail(id.value, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    product.value = p;
    await walletStore.fetchWallet(user.id);
    if (!isCurrent()) return;
  } catch {
    if (!isCurrent()) return;
    product.value = undefined;
    loadError.value = '产品信息加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(loadAll);
onBeforeUnmount(requestGuard.invalidate);
watch(() => route.params.id, loadAll);

async function onSubscribe(amount: string) {
  if (!product.value || !userStore.currentUser) return;
  try {
    const orderId = await financeApi.subscribeFinance({ productId: product.value.id, amount });
    if (orderId !== undefined && orderId !== null) {
      Message.success(`订阅成功 · 已锁定 U ${formatAmount(amount)}`);
      await walletStore.refetch();
      router.push({ name: 'finance-lockup-detail', params: { id: String(orderId) } });
    }
  } catch {
    Message.error('订阅失败，请稍后重试');
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
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="product">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item @click="router.push('/finance')">小金库</a-breadcrumb-item>
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
                <div class="val rate">{{ (Number(product.annualRate) * 100).toFixed(2) }}%</div>
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
              :available-balance="walletStore.account?.available || '0'"
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
