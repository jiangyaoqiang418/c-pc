<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const list = ref<Api.RealPurchase.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(10);
const loading = ref(false);
const loadError = ref('');
const claimingId = ref<string | number>();

const user = computed(() => userStore.currentUser);
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

function readQuery() {
  const rawPage = route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return rawPage !== undefined && (Array.isArray(rawPage) || !Number.isSafeInteger(page) || page <= 0);
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  void (replace ? router.replace : router.push)({ query: { ...route.query,
    page: current.value > 1 ? String(current.value) : undefined } }).then(() => {
    if (route.fullPath === before) void load();
  });
}

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = String(user.value?.id || '');
  if (!userId) {
    loading.value = false;
    list.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const r = await purchaseApi.fetchHall({ current: current.value, size: size.value, signal: isCurrent.signal });
    if (!isCurrent() || String(user.value?.id || '') !== userId) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    list.value = r.records;
    total.value = Number(r.total || 0);
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '可接求购加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(() => {
  if (readQuery()) {
    syncQuery(true);
    return;
  }
  void load();
});
watch(() => route.query.page, () => {
  if (readQuery()) {
    syncQuery(true);
    return;
  }
  void load();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => user.value?.id, () => userStore.currentAudience], () => {
  requestGuard.invalidate();
  list.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  writeVersion += 1;
  claimingId.value = undefined;
  syncQuery(true);
});

async function onClaim(req: Api.RealPurchase.Record) {
  if (!user.value || claimingId.value !== undefined) return;
  const requestedUserId = user.value.id;
  const requestedRequestId = req.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive
    && String(req.id) === String(requestedRequestId);
  claimingId.value = requestedRequestId;
  try {
    const r = await purchaseApi.claimRequest(requestedRequestId);
    if (!isCurrentWrite()) return;
    if (r.ok) {
      Message.success('接单成功');
      await load();
      if (!isCurrentWrite()) return;
      router.push({ name: 'purchase-detail', params: { id: String(requestedRequestId) } });
    } else {
      Message.error(r.message || '接单失败');
    }
  } catch {
    // 请求层已展示错误，保留当前求购供用户重试。
  } finally {
    if (operation === writeVersion) claimingId.value = undefined;
  }
}


</script>

<template>
  <div class="claimable-page shop-container">
    <header class="page-heading"><div><span class="eyebrow">UMAOMAO / WISHES</span><h1>可接求购</h1><p>用你的好眼光，为心愿找到合适的商品。</p></div><div class="heading-actions"><VipBadge v-if="user" :level="user.vipLevel" /><Button variant="outline" @click="router.push('/purchase/hall')">查看求购大厅</Button></div></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="error-row"><span>{{ loadError }}</span><Button variant="outline" size="sm" :disabled="loading" @click="load">重新加载</Button></AlertDescription></Alert>
    <div class="results-bar"><span>当前可接 <strong>{{ loading || loadError ? '—' : total }}</strong> 单</span><Button variant="ghost" size="sm" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新需求' }}</Button></div>
    <div v-if="list.length" class="list"><PurchaseRequestCard v-for="request in list" :key="request.id" :request="request" mode="hall" :can-claim="true" :claiming="String(claimingId) === String(request.id)" @claim="onClaim" /></div>
    <div v-else-if="loading" class="loading-list" aria-busy="true" aria-label="正在读取可接求购"><Skeleton v-for="n in 3" :key="n" class="request-skeleton" /></div>
    <EmptyState v-else :title="loadError || '暂无可接求购'" :description="loadError ? '请稍后重试。' : '当前求购大厅没有可接需求'" :action-text="loadError ? '重新加载' : '查看求购大厅'" @action="loadError ? load() : router.push('/purchase/hall')" />
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="(page: number) => { current = page; syncQuery(); }" />
  </div>
</template>

<style scoped>
.claimable-page { display:grid; gap:24px; }.page-heading,.heading-actions,.error-row,.results-bar { display:flex; justify-content:space-between; align-items:center; gap:16px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.page-heading h1 { font-size:28px; font-weight:650; margin:8px 0; }.page-heading p { color:var(--yb-muted); font-size:13px; margin:0; }.results-bar { padding:14px 20px; border:1px solid var(--yb-hairline); background:var(--yb-surface); border-radius:10px; font-size:13px; color:var(--yb-muted); }.results-bar strong { color:var(--yb-primary); font-size:18px; margin:0 5px; }.list,.loading-list { display:grid; gap:18px; }.request-skeleton { height:210px; }@media(max-width:900px) { .page-heading { flex-wrap:wrap; } }
</style>
