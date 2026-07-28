<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { buyerApi } from '@shared';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

const list = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const total = ref(0);
const loading = ref(false);

const user = computed(() => userStore.currentUser);

async function load() {
  if (!user.value) return;
  loading.value = true;
  try {
    const r = await buyerApi.fetchClaimableRequests(user.value.id);
    list.value = r.records;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function onClaim(req: Api.PurchaseRequest.PurchaseRequest) {
  if (!user.value) return;
  const r = await buyerApi.claimRequestAsBuyerMock(req.id, user.value.id);
  if (r.ok) {
    Message.success('接单成功！请在 12h 内完成采购');
    load();
    router.push({ name: 'purchase-detail', params: { id: String(req.id) } });
  } else {
    Message.error(r.message || '接单失败');
  }
}
</script>

<template>
  <div class="claimable-page shop-container">
    <a-card class="hero-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
      <div class="hero-row">
        <div class="hero-left">
          <div class="hero-title">🙋 求购接单</div>
          <div class="hero-sub">按 VIP 等级阶梯推送 · 高 VIP 优先接单</div>
        </div>
        <div class="hero-right">
          <VipBadge v-if="user" :level="user.vipLevel" />
          <div class="stat">推送 <strong>{{ total }}</strong> 单</div>
          <a-button @click="router.push('/purchase/hall')">查看公开大厅 ›</a-button>
        </div>
      </div>
    </a-card>

    <a-alert type="info" class="tip" closable>
      💡 提示：接单后系统在 12h 内自动创建订单并通知顾客；超时未确认订单可能被平台撤回，影响接单评分
    </a-alert>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="list.length" class="list">
        <PurchaseRequestCard
          v-for="r in list"
          :key="r.id"
          :request="r"
          mode="hall"
          :can-claim="true"
          @claim="onClaim"
        />
      </div>
      <EmptyState
        v-else
        title="暂无推送给您的求购"
        description="您的 VIP 等级越高，推送优先级越靠前；可在「VIP 特权」页查看升级路径"
        action-text="VIP 特权"
        @action="router.push('/vip')"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.claimable-page {
  padding-top: 16px;
}
.hero-card {
  background: linear-gradient(135deg, #ff7d00 0%, #f53f3f 100%);
  color: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.hero-card :deep(.arco-card-body) {
  color: #fff;
}
.hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.hero-title {
  font-size: 22px;
  font-weight: 700;
}
.hero-sub {
  opacity: 0.85;
  font-size: 13px;
  margin-top: 4px;
}
.hero-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat strong {
  font-family: ui-monospace, monospace;
  font-size: 22px;
  font-weight: 700;
}
.tip {
  margin-bottom: 12px;
}
.list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
</style>
