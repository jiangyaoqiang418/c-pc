<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { financeApi, formatAmount, vipApi } from '@shared';
import InterestPreview from '@/components/finance/interest-preview.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const product = ref<Api.FinanceProduct.ProductRecord>();
const vipStatus = ref<Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>>();
const loading = ref(false);

const id = computed(() => Number(route.params.id));

async function loadAll() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const [p, vip] = await Promise.all([
      financeApi.fetchFinanceProductDetail(id.value),
      vipApi.fetchMyVipStatus(userStore.currentUser.id)
    ]);
    product.value = p;
    vipStatus.value = vip;
    await walletStore.fetchWallet(userStore.currentUser.id);
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
watch(() => route.params.id, loadAll);

const vipBonusRate = computed(() => {
  const cfg = vipStatus.value?.config;
  if (!cfg || vipStatus.value?.audience !== 'customer') return 0;
  return Number(cfg.customerBenefits?.interestRateBonus || 0);
});

async function onSubscribe(amount: string) {
  if (!product.value || !userStore.currentUser) return;
  const r = await financeApi.subscribeFinanceMock({
    userId: userStore.currentUser.id,
    productId: product.value.id,
    principalAmount: amount
  });
  if (r.ok && r.order) {
    Message.success(`订阅成功 · 已锁定 U ${formatAmount(amount)}`);
    await walletStore.refetch();
    router.push({ name: 'finance-lockup-detail', params: { id: String(r.order.id) } });
  } else {
    Message.error(r.message || '订阅失败');
  }
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
                <div class="val rate">{{ product.baseRate }}%</div>
              </div>
              <div class="meta-cell">
                <div class="lbl">锁定期</div>
                <div class="val">{{ product.lockupDays }} 天</div>
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
              <li>每日按日利率累计利息，到期后自动转入「不可提现」桶。</li>
              <li>提前解锁将立即终止本期小金库，损失全部预期利息，本金原路退回「可用余额」。</li>
              <li>本产品不保本不保收益（原型环境模拟）；VIP 加成按订阅时刻冻结。</li>
              <li>每日 0:00 计息，到期自动转出至可用余额。</li>
            </ul>
          </a-card>

          <div class="aside">
            <InterestPreview
              v-if="product && userStore.currentUser"
              :product="product"
              :vip-bonus-rate="vipBonusRate"
              :vip-level="userStore.currentUser.vipLevel"
              :available-balance="walletStore.account?.available || '0'"
              @subscribe="onSubscribe"
            />
          </div>
        </div>
      </template>

      <EmptyState v-else-if="!loading" title="小金库产品不存在" action-text="返回列表" @action="router.push('/finance')" />
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
</style>
