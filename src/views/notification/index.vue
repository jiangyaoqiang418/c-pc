<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import UmIcon from '@/components/common/um-icon.vue';
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
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
let readAllVersion = 0;
let deleteVersion = 0;
let clearVersion = 0;
let navigationVersion = 0;
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
  const requestedSession = userStore.sessionVersion;
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
    if (!isCurrent() || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
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
  if (code.startsWith('product_')) return 'box';
  if (code.startsWith('demand_')) return 'search';
  if (code.includes('paid') || code.includes('settled')) return 'wallet';
  if (code.includes('ship')) return 'truck';
  if (code.includes('refund')) return 'return';
  return 'bell';
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

async function markNotificationRead(notification: Api.RealNotify.NotificationVO, refreshList = true) {
  if (disposed || notification.readFlag) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedSession = userStore.sessionVersion;
  const read = await notifyStore.readNotification(notification.id);
  if (!read || disposed || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
  notification.readFlag = true;
  const current = records.value.find(item => sameBusinessId(item.id, notification.id));
  if (current) current.readFlag = true;
  if (refreshList && unreadOnly.value) void load();
}

async function openNotification(notification: Api.RealNotify.NotificationVO) {
  if (disposed) return;
  const navigation = ++navigationVersion;
  const requestedUserId = userStore.currentUser?.id;
  const requestedSession = userStore.sessionVersion;
  const isCurrentNavigation = () => !disposed && navigation === navigationVersion
    && userStore.sessionVersion === requestedSession && String(userStore.currentUser?.id) === String(requestedUserId);
  let target = notificationRoute(notification);
  if (notification.templateCode === 'demand_taken' && notification.bizId != null) {
    try {
      const demand = await fetchPurchaseProgress(notification.bizId);
      if (disposed || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
      target = demand.orderId
        ? { name: 'order-detail' as const, params: { id: String(demand.orderId) } }
        : target;
    } catch {
      // 成交结果暂时无法读取时仍进入求购详情，绝不把求购 ID 当订单 ID。
    }
  }
  if (!isCurrentNavigation()) return;
  // 先确定本次跳转；标读触发的未读末页校正不能取消用户刚点击的详情。
  if (!notification.readFlag) void markNotificationRead(notification, !target);
  if (target) void router.push(target);
  else Message.info('该通知暂无详情');
}

async function readAll() {
  if (readingAll.value) return;
  const requestedUserId = userStore.currentUser?.id;
  const requestedSession = userStore.sessionVersion;
  if (requestedUserId === undefined) return;
  const operation = ++readAllVersion;
  readingAll.value = true;
  try {
    await notifyApi.markAllNotificationsRead();
    if (operation !== readAllVersion || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
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
  const requestedSession = userStore.sessionVersion;
  if (requestedUserId === undefined) return;
  const operation = ++deleteVersion;
  deletingId.value = notification.id;
  try {
    await notifyApi.deleteNotification(notification.id);
    if (operation !== deleteVersion || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
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
  const requestedSession = userStore.sessionVersion;
  if (requestedUserId === undefined) return;
  const operation = ++clearVersion;
  const isCurrent = () => !disposed && operation === clearVersion && userStore.sessionVersion === requestedSession && String(userStore.currentUser?.id) === String(requestedUserId);
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
  navigationVersion += 1;
  clearVersion += 1;
  readAllVersion += 1;
  deleteVersion += 1;
  clearModal?.close();
  requestGuard.invalidate();
});
watch(() => route.fullPath, () => {
  if (disposed) return;
  navigationVersion += 1;
  if (syncFromQuery()) {
    void router.replace({ query: { ...route.query, unread: undefined } });
    return;
  }
  void load();
});
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], (next, previous) => {
  if (disposed) return;
  if (String(next[0]) === String(previous[0]) && next[1] === previous[1]) return;
  navigationVersion += 1;
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
  <div class="notification-page">
    <div class="page-heading compact"><h1>站内通知</h1><span v-if="!loading && !loadError" class="heading-meta">共 {{ total }} 条</span><div class="notification-actions"><button class="outline" :disabled="!hasUnread || readingAll || clearing" @click="readAll"><UmIcon name="check" />{{ readingAll ? '正在标记…' : '全部已读' }}</button><button class="outline notification-danger" :disabled="!records.length || clearing || clearConfirmationOpen" @click="clearAll"><UmIcon name="trash" />{{ clearing ? '正在清空…' : '清空通知' }}</button></div></div>
    <nav class="tabs" aria-label="通知筛选"><button :class="{ active: notificationFilter === 'all' }" :aria-pressed="notificationFilter === 'all'" @click="notificationFilter = 'all'">全部通知</button><button :class="{ active: notificationFilter === 'unread' }" :aria-pressed="notificationFilter === 'unread'" @click="notificationFilter = 'unread'">仅未读</button></nav>
    <section class="paper" :aria-busy="loading">
      <div v-if="loading && !records.length" class="notification-skeletons"><Skeleton v-for="n in 4" :key="n" class="h-28" /></div>
      <div v-else-if="records.length" :class="{ 'notification-refreshing': loading }"><article v-for="notification in records" :key="notification.id" class="notice-item" :class="{ unread: !notification.readFlag }"><UmIcon :name="iconFor(notification)" /><div class="notification-copy"><button class="notification-main" @click="openNotification(notification)"><h3>{{ notification.title || '平台通知' }}<span v-if="!notification.readFlag" class="notification-unread" aria-label="未读" /></h3><p>{{ notification.content || '—' }}</p><small>{{ formatTime(notification.createdAt) }}</small></button><span class="notification-category">{{ categoryFor(notification).label }}</span></div><div class="notification-item-actions"><button v-if="!notification.readFlag" class="text-link" @click="markNotificationRead(notification)">标记已读</button><button class="text-link notification-danger" :disabled="deletingId !== undefined || clearing" @click="remove(notification)">{{ sameBusinessId(deletingId, notification.id) ? '删除中…' : '删除' }}</button></div></article></div>
      <EmptyState v-else :title="loadError || '暂无站内通知'" :description="loadError ? '请稍后重试。' : '订单和退款状态变化后会在这里提醒你。'" :action-text="loadError ? '重新读取' : undefined" @action="load" />
      <BusinessPagination v-if="total > pageSize" :current="pageNo" :total="total" :page-size="pageSize" :loading="loading" @change="changePage" />
    </section>
  </div>
</template>

<style scoped>
.notification-page { padding-bottom:48px; }
.notification-actions { display:flex; gap:12px; margin-left:auto; flex-wrap:wrap; }
.notification-danger { color:var(--yb-danger); }
.notification-skeletons { display:grid; gap:20px; }
.notification-refreshing { opacity:.65; }
.notification-copy { min-width:0; flex:1; }
.notification-main { display:block; width:100%; text-align:left; }
.notification-main p { overflow-wrap:anywhere; white-space:pre-wrap; }
.notification-unread { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--green); margin-left:10px; vertical-align:middle; }
.notification-category { display:inline-block; margin-top:8px; padding:3px 8px; border:1px solid var(--line); border-radius:5px; background:var(--soft); color:var(--muted); font-size:11px; }
.notification-item-actions { display:flex; gap:14px; align-items:center; margin-left:auto; flex-shrink:0; }
.notification-item-actions button { font-size:12px; }
@media(max-width:700px) { .notification-actions { margin-left:0; }.notice-item { flex-wrap:wrap; }.notification-copy { flex-basis:calc(100% - 44px); }.notification-item-actions { margin-left:44px; } }
</style>
