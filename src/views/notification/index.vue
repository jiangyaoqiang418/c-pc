<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Message, Modal } from '@/lib/feedback';
import EmptyState from '@/components/common/empty-state.vue';
import { useNotifyStore, useUserStore } from '@/stores';
import * as notifyApi from '@/service/api/notify';
import { sameBusinessId } from '@/utils/im';
import { notificationRoute } from '@/utils/notification';
import { fetchPurchaseProgress } from '@/service/api/purchase';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { resolvePageSize } from '@/service/api/page';

const router = useRouter();
const route = useRoute();
const notifyStore = useNotifyStore();
const userStore = useUserStore();
const records = ref<Api.RealNotify.NotificationVO[]>([]);
const loading = ref(false);
const loadError = ref('');
const unreadOnly = ref(false);
const pageNo = ref(1);
const pageSize = ref(20);
const total = ref(0);
const readingAll = ref(false);
const clearing = ref(false);
const clearConfirmationOpen = ref(false);
const deletingId = ref<string | number>();
const requestGuard = createLatestRequestGuard();
let readAllVersion = 0;
let deleteVersion = 0;
let clearVersion = 0;
let disposed = false;

function syncFromQuery() {
  const rawUnread = Array.isArray(route.query.unread) ? route.query.unread[0] : route.query.unread;
  unreadOnly.value = rawUnread === '1';
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = Number(rawPage);
  pageNo.value = Number.isInteger(page) && page > 0 ? page : 1;
  return rawUnread !== undefined && rawUnread !== '1';
}

function currentQuery() {
  return {
    ...(unreadOnly.value ? { unread: '1' } : {}),
    ...(pageNo.value > 1 ? { page: String(pageNo.value) } : {})
  };
}

function syncQuery() {
  const before = route.fullPath;
  void router.push({ query: currentQuery() }).then(() => {
    if (!disposed && route.fullPath === before) void load();
  });
}

const hasUnread = computed(() => notifyStore.notificationUnreadCount > 0);
let clearModal: ReturnType<typeof Modal.warning> | undefined;

function decreaseUnreadCount() {
  notifyStore.setNotificationUnreadCount(Math.max(0, notifyStore.notificationUnreadCount - 1));
}

async function load() {
  if (disposed) return;
  const isCurrent = requestGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    loading.value = false;
    records.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const response = await notifyApi.fetchNotifications({ pageNo: pageNo.value, pageSize: pageSize.value, unreadOnly: unreadOnly.value }, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    pageSize.value = resolvePageSize(response, pageSize.value);
    const maxPage = Math.max(1, Math.ceil((response.total || 0) / pageSize.value));
    if (pageNo.value > maxPage) {
      pageNo.value = maxPage;
      void router.replace({ query: currentQuery() });
      return;
    }
    records.value = response.records || [];
    total.value = response.total || 0;
    // 角标独立刷新，不能让 IM/未读统计拖住已经返回的通知列表。
    void notifyStore.refreshUnreadCounts();
  } catch {
    if (!isCurrent()) return;
    records.value = [];
    total.value = 0;
    loadError.value = '通知加载失败，请检查网络后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function iconFor(notification: Api.RealNotify.NotificationVO) {
  const code = String(notification.templateCode || '').toLowerCase();
  if (code.startsWith('product_')) return 'lucide:package-check';
  if (code.startsWith('demand_')) return 'lucide:clipboard-list';
  if (code.includes('paid') || code.includes('settled')) return 'lucide:circle-dollar-sign';
  if (code.includes('ship')) return 'lucide:truck';
  if (code.includes('refund')) return 'lucide:rotate-ccw';
  return 'lucide:bell';
}

function categoryFor(notification: Api.RealNotify.NotificationVO) {
  const code = String(notification.templateCode || '').toLowerCase();
  if (code.startsWith('product_')) return { label: '商品审核', color: 'purple' as const };
  if (code.startsWith('demand_')) return { label: '求购通知', color: 'orange' as const };
  if (code.includes('refund')) return { label: '退款售后', color: 'orangered' as const };
  if (code.includes('ship')) return { label: '物流履约', color: 'arcoblue' as const };
  if (code.includes('paid') || code.includes('settled')) return { label: '资金订单', color: 'green' as const };
  if (String(notification.bizType || '').toUpperCase() === 'ORDER') return { label: '订单通知', color: 'blue' as const };
  return { label: '平台通知', color: 'gray' as const };
}

async function openNotification(notification: Api.RealNotify.NotificationVO) {
  if (disposed) return;
  const requestedUserId = userStore.currentUser?.id;
  if (!notification.readFlag) {
    void notifyStore.readNotification(notification.id).then(read => {
      if (!read || disposed || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
      notification.readFlag = true;
      const current = records.value.find(item => sameBusinessId(item.id, notification.id));
      if (current) current.readFlag = true;
      if (unreadOnly.value) void load();
    });
  }
  let target = notificationRoute(notification);
  if (notification.templateCode === 'demand_taken' && notification.bizId != null) {
    try {
      const demand = await fetchPurchaseProgress(notification.bizId);
      if (disposed || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
      target = demand.orderId
        ? { name: 'order-detail' as const, params: { id: String(demand.orderId) } }
        : target;
    } catch {
      // 成交结果暂时无法读取时仍进入求购详情，绝不把求购 ID 当订单 ID。
    }
  }
  if (target) void router.push(target);
  else Message.info('该通知暂无详情');
}

async function readAll() {
  if (readingAll.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++readAllVersion;
  readingAll.value = true;
  try {
    await notifyApi.markAllNotificationsRead();
    if (operation !== readAllVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    records.value.forEach(item => { item.readFlag = true; });
    notifyStore.setNotificationUnreadCount(0);
    Message.success('已全部标记为已读');
    await load();
  } catch {
    // 请求层已展示错误，保留未读状态供用户重试。
  } finally {
    if (operation === readAllVersion) readingAll.value = false;
  }
}

async function remove(notification: Api.RealNotify.NotificationVO) {
  if (deletingId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++deleteVersion;
  deletingId.value = notification.id;
  try {
    await notifyApi.deleteNotification(notification.id);
    if (operation !== deleteVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    records.value = records.value.filter(item => !sameBusinessId(item.id, notification.id));
    total.value = Math.max(0, total.value - 1);
    if (!notification.readFlag) decreaseUnreadCount();
    await load();
  } catch {
    // 请求层已展示错误，保留当前通知，避免把删除失败误显示为成功。
  } finally {
    if (operation === deleteVersion) deletingId.value = undefined;
  }
}

function clearAll() {
  if (disposed || clearing.value || clearConfirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++clearVersion;
  const isCurrent = () => !disposed && operation === clearVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  clearConfirmationOpen.value = true;
  clearModal = Modal.warning({
    title: '清空通知',
    content: '确认清空当前账号的全部站内通知？',
    hideCancel: false,
    onCancel() {
      clearVersion += 1;
      clearConfirmationOpen.value = false;
    },
    onOk: async () => {
      if (clearing.value) return;
      if (!isCurrent()) {
        clearConfirmationOpen.value = false;
        return;
      }
      clearing.value = true;
      try {
        await notifyApi.clearNotifications();
        if (!isCurrent()) return;
        records.value = [];
        total.value = 0;
        notifyStore.setNotificationUnreadCount(0);
        Message.success('通知已清空');
        await load();
      } catch {
        // 请求层已展示错误，保留当前列表供用户重试。
      } finally {
        if (operation === clearVersion) {
          clearing.value = false;
          clearConfirmationOpen.value = false;
        }
      }
    }
  });
}

notifyStore.subscribe(event => {
  if (event.type !== 'NOTIFICATION') return;
  // 由当前查询回读分页和筛选，不能把推送直接插入任意页。
  void load();
});

onMounted(() => {
  if (syncFromQuery()) void router.replace({ query: { ...route.query, unread: undefined } });
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  clearVersion += 1;
  readAllVersion += 1;
  deleteVersion += 1;
  clearModal?.close();
  requestGuard.invalidate();
});
watch(() => route.fullPath, () => {
  if (disposed) return;
  if (syncFromQuery()) {
    void router.replace({ query: { ...route.query, unread: undefined } });
    return;
  }
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  clearModal?.close();
  readAllVersion += 1;
  deleteVersion += 1;
  clearVersion += 1;
  requestGuard.invalidate();
  records.value = [];
  total.value = 0;
  pageNo.value = 1;
  readingAll.value = false;
  clearing.value = false;
  clearConfirmationOpen.value = false;
  deletingId.value = undefined;
  loadError.value = '';
  const before = route.fullPath;
  void router.replace({ query: currentQuery() }).then(() => {
    if (!disposed && route.fullPath === before) void load();
  });
});

function changeUnreadFilter() {
  pageNo.value = 1;
  syncQuery();
}

function changePage(page: number) {
  pageNo.value = page;
  syncQuery();
}


const notificationFilter = computed({
  get: () => unreadOnly.value ? 'unread' : 'all',
  set: (value: string) => { unreadOnly.value = value === 'unread'; changeUnreadFilter(); }
});
</script>

<template>
  <div class="notification-page shop-container">
    <header class="page-header"><div><span class="eyebrow">NOTIFICATIONS</span><h1>站内通知</h1><p>订单状态、退款和资金结算等平台提醒</p></div><div class="header-actions"><Tooltip><TooltipTrigger as-child><span tabindex="0"><Button variant="outline" :disabled="!hasUnread || readingAll || clearing" @click="readAll"><Icon icon="lucide:check-check" width="16" />{{ readingAll ? '正在标记…' : '全部已读' }}</Button></span></TooltipTrigger><TooltipContent v-if="!hasUnread">没有待处理的未读通知</TooltipContent></Tooltip><Button variant="outline" class="danger-button" :disabled="!records.length || clearing || clearConfirmationOpen" @click="clearAll"><Icon icon="lucide:trash-2" width="16" />{{ clearing ? '正在清空…' : '清空通知' }}</Button></div></header>
    <section class="notification-card" :aria-busy="loading">
      <header class="filter-row"><Tabs v-model="notificationFilter"><TabsList><TabsTrigger value="all">全部通知</TabsTrigger><TabsTrigger value="unread">仅未读</TabsTrigger></TabsList></Tabs><span v-if="!loading && !loadError" class="count">共 {{ total }} 条</span></header>
      <div v-if="loading && !records.length" class="skeletons"><Skeleton v-for="n in 4" :key="n" class="h-28" /></div>
      <div v-else-if="records.length" class="notification-list" :class="{ refreshing: loading }"><article v-for="notification in records" :key="notification.id" class="notification-row" :class="{ unread: !notification.readFlag }"><div class="notification-icon"><Icon :icon="iconFor(notification)" width="22" /></div><button type="button" class="notification-main" @click="openNotification(notification)"><span class="title-row"><strong>{{ notification.title || '平台通知' }}</strong><span class="category-tag" :class="categoryFor(notification).color">{{ categoryFor(notification).label }}</span><span v-if="!notification.readFlag" class="unread-dot" aria-label="未读"></span></span><span class="notification-content">{{ notification.content || '—' }}</span><time>{{ formatTime(notification.createdAt) }}</time></button><Button type="button" variant="ghost" size="sm" class="delete-button" :disabled="deletingId !== undefined || clearing" @click="remove(notification)"><Icon :icon="sameBusinessId(deletingId, notification.id) ? 'lucide:loader-circle' : 'lucide:trash-2'" width="15" />{{ sameBusinessId(deletingId, notification.id) ? '删除中…' : '删除' }}</Button></article></div>
      <EmptyState v-else :title="loadError || '暂无站内通知'" :description="loadError ? '请稍后重试。' : '订单和退款状态变化后会在这里提醒你'" :action-text="loadError ? '重新加载' : undefined" @action="load" />
      <BusinessPagination v-if="total > pageSize" :current="pageNo" :total="total" :page-size="pageSize" :loading="loading" @change="changePage" />
    </section>
  </div>
</template>

<style scoped>
.notification-page { padding-top:32px; padding-bottom:48px; }.page-header { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:28px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { margin:5px 0 10px; font-size:28px; font-weight:650; }.page-header p { color:var(--yb-muted); font-size:14px; margin:0; }.header-actions { display:flex; gap:12px; }.danger-button,.delete-button { color:var(--yb-danger); }.notification-card { padding:0 26px 26px; border:1px solid var(--yb-hairline); background:var(--yb-paper); border-radius:10px; }.filter-row { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:0 0 14px; border-bottom:1px solid var(--yb-hairline); }.count { color:var(--yb-muted); font-size:13px; }.skeletons { display:grid; gap:20px; padding-top:24px; }.refreshing { opacity:.65; }.notification-row { display:grid; grid-template-columns:44px minmax(0,1fr) auto; align-items:start; gap:20px; padding:28px 10px; border-bottom:1px solid var(--yb-hairline); transition:background .15s; }.notification-row:last-child { border-bottom:0; }.notification-row:hover { background:var(--yb-primary-soft); }.notification-icon { display:grid; place-items:center; width:44px; height:44px; border-radius:8px; background:var(--yb-fill); color:var(--yb-muted); }.unread .notification-icon { background:var(--yb-primary-soft); color:var(--yb-brand-primary); }.notification-main { display:block; min-width:0; width:100%; padding:0; text-align:left; border:0; background:transparent; cursor:pointer; color:inherit; }.notification-main:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:5px; border-radius:4px; }.title-row { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }.title-row strong { font-size:16px; font-weight:550; }.unread .title-row strong { font-weight:650; }.category-tag { display:inline-flex; padding:3px 8px; background:var(--yb-fill); color:var(--yb-muted); font-size:12px; border-radius:4px; }.purple { color:#704a8d; background:#f2ebf7; }.orange { color:#9a5709; background:#fff3df; }.orangered { color:#ad453e; background:#fcecea; }.arcoblue,.blue { color:#315a96; background:#edf3fc; }.green { color:#326b43; background:#e9f3eb; }.unread-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--yb-brand-primary); flex-shrink:0; }.notification-content { display:block; margin:12px 0; line-height:1.8; color:var(--yb-muted); font-size:14px; overflow-wrap:anywhere; white-space:pre-wrap; }time { color:var(--yb-muted); font-size:12px; }.delete-button { margin-top:2px; }@media(max-width:700px) { .page-header { flex-direction:column; align-items:start; }.notification-card { padding:0 16px 20px; }.notification-row { grid-template-columns:36px minmax(0,1fr); gap:14px; }.notification-icon { width:36px; height:36px; }.delete-button { grid-column:2; justify-self:end; padding-right:0; } }@media(prefers-reduced-motion:reduce) { .notification-row { transition:none; } }
</style>
