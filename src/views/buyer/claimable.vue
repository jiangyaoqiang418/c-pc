<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import { enums, formatAmount } from '@shared';
import { getAftersaleMeta } from '@/service/api/product';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { formatDateValue } from '@/utils/date-range';
import VipBadge from '@/components/common/vip-badge.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();
const claimOpen = ref(false);
const claimCandidate = ref<Api.RealPurchase.Record>();
function openClaim(request: Api.RealPurchase.Record) {
  if (claimingId.value !== undefined || request.status !== 'pushing') return;
  claimCandidate.value = request;
  claimOpen.value = true;
}
async function confirmClaim() {
  if (claimCandidate.value) await onClaim(claimCandidate.value);
  return false;
}
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
  claimOpen.value = false;
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => user.value?.id, () => userStore.currentAudience, () => userStore.sessionVersion, () => userStore.isBuyerActive], () => {
  claimOpen.value = false;
  claimCandidate.value = undefined;
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
  if (!user.value || !userStore.isBuyerActive || claimingId.value !== undefined) return;
  const requestedUserId = user.value.id;
  const requestedRequestId = req.id;
  const operation = ++writeVersion;
  const requestedSession = userStore.sessionVersion;
  const isCurrentWrite = () => operation === writeVersion && userStore.sessionVersion === requestedSession
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive
    && String(req.id) === String(requestedRequestId);
  claimingId.value = requestedRequestId;
  try {
    const r = await purchaseApi.claimRequest(requestedRequestId);
    if (!isCurrentWrite()) return;
    if (r.ok) {
      claimOpen.value = false;
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
    if (operation === writeVersion && userStore.sessionVersion === requestedSession) claimingId.value = undefined;
  }
}


</script>

<template>
  <div class="claimable-page shop-container">
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>求购接单</h1><p>用你的好眼光，为心愿找到合适的商品。</p></div><div class="heading-actions"><VipBadge v-if="user" :level="user.vipLevel" /><Button class="outline" variant="outline" @click="router.push('/purchase/hall')">查看求购大厅</Button></div></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="error-row"><span>{{ loadError }}</span><Button class="outline" variant="outline" size="sm" :disabled="loading" @click="load">重新加载</Button></AlertDescription></Alert>
    <div class="results-bar"><span>当前可接 <strong>{{ loading || loadError ? '—' : total }}</strong> 单</span><Button variant="ghost" size="sm" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新需求' }}</Button></div>
    <div v-if="list.length" class="buyer-demand-list"><article v-for="request in list" :key="request.id" class="paper buyer-demand"><div><span class="buyer-status" :class="request.status">{{ enums.PURCHASE_STATUS_META[request.status]?.label || '状态待核对' }}</span><small>{{ request.categoryPath }} · {{ request.code }}</small></div><div class="buyer-demand-body"><img :src="request.evidenceUrls?.[0] || PRODUCT_IMAGE_PLACEHOLDER" :alt="request.productTitle" @error="setImageFallback" /><div><h2>{{ request.productTitle }}</h2><p>{{ request.appeal || request.productDescription || '暂无补充说明' }}</p><div class="buyer-tags"><span>期望 {{ request.expectedDays }} 天</span><span>{{ getAftersaleMeta(request.aftersaleType).label }}</span><span v-if="request.overseasCustoms">海外过关后不可退</span><span v-if="request.claimExpiresAt">接单截止 {{ formatDateValue(request.claimExpiresAt) }}</span></div></div></div><footer><span><small>求购预算</small><b>{{ formatAmount(request.budgetAmount) }} <em>USDT</em></b></span><div><button type="button" class="outline" @click="router.push({ name:'purchase-detail', params:{ id:String(request.id) } })">查看详情</button><button v-if="request.status === 'pushing'" type="button" class="primary" :disabled="claimingId !== undefined" @click="openClaim(request)">{{ String(claimingId) === String(request.id) ? '接单中…' : '我接此单' }}<UmIcon name="arrow" /></button></div></footer></article></div>
    <div v-else-if="loading" class="loading-list" aria-busy="true" aria-label="正在读取可接求购"><Skeleton v-for="n in 3" :key="n" class="request-skeleton" /></div>
    <EmptyState v-else :title="loadError || '暂无可接求购'" :description="loadError ? '请稍后重试。' : '当前求购大厅没有可接需求'" :action-text="loadError ? '重新加载' : '查看求购大厅'" @action="loadError ? load() : router.push('/purchase/hall')" />
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="(page: number) => { current = page; syncQuery(); }" />
    <a-modal content-class="buyer-dialog" v-model:visible="claimOpen" title="确认接单" ok-text="确认接单" :ok-loading="claimingId !== undefined" :closable="claimingId === undefined" :mask-closable="claimingId === undefined" :esc-to-close="claimingId === undefined" :on-before-ok="confirmClaim"><template v-if="claimCandidate"><p>{{ claimCandidate.productTitle }}</p><div class="buyer-check-summary"><span>求购预算</span><strong>{{ formatAmount(claimCandidate.budgetAmount) }} USDT</strong><span>期望 {{ claimCandidate.expectedDays }} 天 · {{ getAftersaleMeta(claimCandidate.aftersaleType).label }}</span></div><p>确认后由平台核对接单资格与保证金，并关联采购订单。实际担保金额与处理结果以平台返回为准。</p></template></a-modal>
  </div>
</template>

<style scoped>
.heading-actions,.error-row,.results-bar { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.results-bar { margin:16px 0; }
.loading-list { display:grid; gap:18px; }
.request-skeleton { height:210px; }
.buyer-demand h2,.buyer-demand p { overflow-wrap:anywhere; }
.buyer-demand p { white-space:pre-wrap; }
@media(max-width:700px) {
  .buyer-page-top { flex-direction:column; align-items:stretch; }
  .buyer-page-top > div { width:100%; min-width:0; }
  .heading-actions { flex-wrap:wrap; justify-content:flex-start; }
}
</style>
