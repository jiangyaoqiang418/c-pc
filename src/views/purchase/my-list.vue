<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { Icon } from '@iconify/vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { resolvePageSize } from '@/service/api/page';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.PurchaseRequest.RequestStatus[];
}

const TABS: TabDef[] = [
  { key: 'all',       label: '全部' },
  { key: 'pending',   label: '待审核', statuses: ['pending_audit'] },
  { key: 'pushing',   label: '推送中', statuses: ['pushing'] },
  { key: 'claimed',   label: '已接单', statuses: ['claimed'] },
  { key: 'rejected',  label: '已驳回', statuses: ['rejected'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled'] }
];

const activeKey = ref('all');
const current = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Api.RealPurchase.Record[]>([]);
const loading = ref(false);
const counts = ref<Record<string, number | undefined>>({});
const countError = ref('');
const countsGuard = createLatestRequestGuard();
const loadError = ref('');
const cancelingId = ref<string | number>();
const listGuard = createLatestRequestGuard();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
let disposed = false;

function readQuery() {
  const matchedTab = typeof route.query.tab === 'string'
    ? TABS.find(tab => tab.key === route.query.tab)
    : undefined;
  activeKey.value = matchedTab?.key || 'all';
  const rawPage = route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return (route.query.tab !== undefined && !matchedTab)
    || (rawPage !== undefined && (Array.isArray(rawPage) || !Number.isSafeInteger(page) || page <= 0));
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  const location = { query: { ...route.query, tab: activeKey.value === 'all' ? undefined : activeKey.value, page: current.value > 1 ? String(current.value) : undefined } };
  void (replace ? router.replace(location) : router.push(location)).then(() => {
    if (!disposed && route.fullPath === before) void load();
  });
}

function changeTab(key: string) {
  activeKey.value = key;
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

async function load() {
  await userStore.init();
  if (disposed) return;
  const user = userStore.currentUser;
  const isCurrent = listGuard.begin();
  if (!user || disposed) {
    loading.value = false;
    list.value = [];
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  void loadCounts(user.id);
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await purchaseApi.fetchMyPurchases(user.id, tab?.statuses, { current: current.value, size: pageSize.value, signal: isCurrent.signal });
    if (!isCurrent()) return;
    pageSize.value = resolvePageSize(r, pageSize.value);
    const maxPage = Math.max(1, Math.ceil(r.total / pageSize.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    total.value = r.total;
    list.value = r.records;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '求购列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(() => {
  if (readQuery()) void router.replace({ query: { ...route.query, tab: activeKey.value === 'all' ? undefined : activeKey.value, page: current.value > 1 ? String(current.value) : undefined } });
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  writeVersion += 1;
  confirmationModal?.close();
  listGuard.invalidate();
  countsGuard.invalidate();
});
watch(() => userStore.currentUser?.id, async (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  confirmationModal?.close();
  current.value = 1;
  total.value = 0;
  listGuard.invalidate();
  countsGuard.invalidate();
  counts.value = {};
  countError.value = '';
  list.value = [];
  loadError.value = '';
  cancelingId.value = undefined;
  syncQuery(true);
});
watch(() => route.fullPath, () => {
  if (disposed) return;
  if (readQuery()) {
    void router.replace({ query: { ...route.query, tab: activeKey.value === 'all' ? undefined : activeKey.value, page: current.value > 1 ? String(current.value) : undefined } });
    return;
  }
  void load();
});

async function loadCounts(userId: string | number) {
  const isCurrent = countsGuard.begin();
  counts.value = {};
  countError.value = '';
  await Promise.all(TABS.map(async tab => {
    try {
      const page = await purchaseApi.fetchMyPurchases(userId, tab.statuses, { current: 1, size: 1, signal: isCurrent.signal });
      if (isCurrent() && String(userStore.currentUser?.id) === String(userId)) counts.value[tab.key] = page.total;
    } catch { if (isCurrent()) countError.value = '部分状态数量未取得，请重新加载核对'; }
  }));
}

function onCancel(req: Api.RealPurchase.Record) {
  if (cancelingId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestId = req.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancelingId.value = requestId;
  confirmationModal = Modal.confirm({
    title: '撤销求购？',
    content: '撤销后该求购将不可恢复',
    okText: '确认撤销',
    okButtonProps: { status: 'danger' },
    onCancel() {
      if (!isCurrentWrite()) return;
      writeVersion += 1;
      cancelingId.value = undefined;
    },
    async onOk() {
      if (!isCurrentWrite()) {
        return;
      }
      try {
        const r = await purchaseApi.cancelPurchase(requestId);
        if (!isCurrentWrite()) return;
        if (r.ok) {
          Message.success('已撤销');
          await load();
        } else {
          Message.error(r.message || '撤销求购失败');
        }
      } catch {
        // 请求层已展示错误，保留当前求购，避免撤销失败却从列表消失。
      } finally {
        if (operation === writeVersion) cancelingId.value = undefined;
      }
    }
  });
}


function selectTab(value: string | number) {
  const tab = TABS.find(item => item.key === value);
  if (tab) changeTab(tab.key);
}

</script>

<template>

  <div class="my-purchase-page">
    <header class="page-heading"><div><span class="eyebrow">YOUR WISH LIST</span><h1>我的求购</h1><p>查看审核、接单进度与关联订单。</p></div><div class="button-row"><Button variant="outline" @click="router.push('/purchase/hall')">求购大厅</Button><Button @click="router.push('/purchase/create')"><Icon icon="lucide:plus" width="17" />发起求购</Button></div></header>
    <nav class="page-links" aria-label="求购导航"><RouterLink to="/purchase/hall">求购大厅</RouterLink><RouterLink to="/purchase" aria-current="page">我的求购</RouterLink></nav>
    <div v-if="countError" class="notice" role="alert"><Icon icon="lucide:info" width="18" /><span>{{ countError }}</span><Button variant="outline" size="sm" :disabled="loading" @click="load">重新加载</Button></div>
    <Tabs :model-value="activeKey" @update:model-value="selectTab">
      <TabsList class="status-tabs"><TabsTrigger v-for="t in TABS" :key="t.key" :value="t.key">{{ t.label }}<span v-if="(counts[t.key] ?? 0) > 0" class="tab-count">{{ counts[t.key] }}</span></TabsTrigger></TabsList>
      <TabsContent :value="activeKey" class="result-panel">
        <p class="result-count">{{ loading || loadError ? '正在核对求购记录' : '共 ' + total + ' 条求购' }}</p>
        <div v-if="loading" class="req-grid" aria-busy="true" aria-label="正在读取求购"><Skeleton v-for="n in 6" :key="n" class="request-skeleton" /></div>
        <EmptyState v-else-if="loadError" :title="loadError" description="未展示不完整的记录，请重新加载。" action-text="重新加载" @action="load" />
        <div v-else-if="list.length" class="req-grid"><PurchaseRequestCard v-for="r in list" :key="r.id" :request="r" mode="mine" :canceling="String(cancelingId) === String(r.id)" @cancel="onCancel" /></div>
        <EmptyState v-else icon="lucide:search" title="暂无该状态下的求购" description="告诉买手你想要什么，让期待有回应。" action-text="发起求购" @action="router.push('/purchase/create')" />
        <BusinessPagination v-if="!loading && !loadError && total > pageSize" :current="current" :page-size="pageSize" :total="total" @change="changePage" />
      </TabsContent>
    </Tabs>
  </div>

</template>

<style scoped>

.my-purchase-page { padding-bottom:32px; }.page-heading { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom:24px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.page-heading h1 { font-size:30px; font-weight:650; margin:6px 0; }.page-heading p { color:var(--yb-muted); font-size:14px; margin:0; }.button-row { display:flex; gap:12px; align-items:center; }.page-links { display:flex; gap:28px; border-bottom:1px solid var(--yb-hairline); margin-bottom:24px; }.page-links a { padding-bottom:13px; color:var(--yb-muted); text-decoration:none; font-size:14px; }.page-links [aria-current] { border-bottom:2px solid var(--yb-brand-primary); color:var(--yb-brand-primary); }.notice { display:flex; gap:12px; align-items:center; padding:16px 20px; border-radius:14px; background:var(--yb-primary-soft); margin-bottom:20px; font-size:13px; }.notice span { flex:1; }.status-tabs { width:100%; justify-content:flex-start; gap:8px; height:auto; padding:8px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:16px; }.status-tabs :deep(button) { padding:10px 18px; }.tab-count { font-size:12px; margin-left:6px; color:var(--yb-brand-primary); }.result-panel { margin-top:20px; }.result-count { font-size:13px; color:var(--yb-muted); margin:0 0 16px; }.req-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }.request-skeleton { height:330px; border-radius:20px; }@media(max-width:1150px) { .req-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }

</style>
