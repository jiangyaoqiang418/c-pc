<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

const list = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(10);
const loading = ref(false);
const loadError = ref('');
const claimingId = ref<string | number>();

const user = computed(() => userStore.currentUser);

async function load() {
  if (!user.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const r = await purchaseApi.fetchHall({ current: current.value, size: size.value });
    list.value = r.records;
    total.value = Number(r.total || 0);
  } catch {
    list.value = [];
    total.value = 0;
    loadError.value = '可接求购加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function onClaim(req: Api.PurchaseRequest.PurchaseRequest) {
  if (!user.value || claimingId.value !== undefined) return;
  claimingId.value = req.id;
  try {
    const r = await purchaseApi.claimRequest(req.id);
    if (r.ok) {
      Message.success('接单成功');
      await load();
      router.push({ name: 'purchase-detail', params: { id: String(req.id) } });
    } else {
      Message.error(r.message || '接单失败');
    }
  } catch {
    // 请求层已展示错误，保留当前求购供用户重试。
  } finally {
    claimingId.value = undefined;
  }
}
</script>

<template>
  <div class="claimable-page shop-container">
    <a-card class="hero-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
      <div class="hero-row">
        <div class="hero-left">
          <div class="hero-title">可接求购</div>
          <div class="hero-sub">查看求购大厅当前可接需求</div>
        </div>
        <div class="hero-right">
          <VipBadge v-if="user" :level="user.vipLevel" />
          <div class="stat">可接 <strong>{{ total }}</strong> 单</div>
          <a-button @click="router.push('/purchase/hall')">查看求购大厅</a-button>
        </div>
      </div>
    </a-card>

    <a-alert type="info" class="tip" closable>
      当前展示求购大厅中的可接需求。后台暂未提供按买手定向推送的独立列表。
    </a-alert>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="list.length" class="list">
        <PurchaseRequestCard
          v-for="r in list"
          :key="r.id"
          :request="r"
          mode="hall"
          :can-claim="true"
          :claiming="String(claimingId) === String(r.id)"
          @claim="onClaim"
        />
      </div>
      <EmptyState
        v-else
        :title="loadError || '暂无可接求购'"
        :description="loadError ? '不会把请求失败误显示为没有可接求购。' : '当前求购大厅没有可接需求'"
        :action-text="loadError ? '重新加载' : '查看求购大厅'"
        @action="loadError ? load() : router.push('/purchase/hall')"
      />
    </a-spin>

    <div v-if="total > size" class="pagination">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="(page: number) => { current = page; load(); }"
      />
    </div>
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
.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
