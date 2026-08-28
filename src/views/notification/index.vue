<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Message, Modal } from '@arco-design/web-vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useNotifyStore } from '@/stores';
import * as notifyApi from '@/service/api/notify';
import { sameBusinessId } from '@/utils/im';
import { notificationRoute } from '@/utils/notification';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const notifyStore = useNotifyStore();
const records = ref<Api.RealNotify.NotificationVO[]>([]);
const loading = ref(false);
const loadError = ref('');
const unreadOnly = ref(false);
const pageNo = ref(1);
const pageSize = 20;
const total = ref(0);
const readingAll = ref(false);
const clearing = ref(false);
const clearConfirmationOpen = ref(false);
const deletingId = ref<string | number>();
const requestGuard = createLatestRequestGuard();

const hasUnread = computed(() => records.value.some(item => !item.readFlag));

async function load() {
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const response = await notifyApi.fetchNotifications({ pageNo: pageNo.value, pageSize, unreadOnly: unreadOnly.value }, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    records.value = response.records || [];
    total.value = response.total || 0;
    await notifyStore.refreshUnreadCounts();
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
  if (code.includes('paid') || code.includes('settled')) return 'lucide:circle-dollar-sign';
  if (code.includes('ship')) return 'lucide:truck';
  if (code.includes('refund')) return 'lucide:rotate-ccw';
  return 'lucide:bell';
}

function categoryFor(notification: Api.RealNotify.NotificationVO) {
  const code = String(notification.templateCode || '').toLowerCase();
  if (code.includes('refund')) return { label: '退款售后', color: 'orangered' as const };
  if (code.includes('ship')) return { label: '物流履约', color: 'arcoblue' as const };
  if (code.includes('paid') || code.includes('settled')) return { label: '资金订单', color: 'green' as const };
  if (String(notification.bizType || '').toUpperCase() === 'ORDER') return { label: '订单通知', color: 'blue' as const };
  return { label: '平台通知', color: 'gray' as const };
}

async function openNotification(notification: Api.RealNotify.NotificationVO) {
  if (!notification.readFlag) {
    await notifyApi.markNotificationRead({ id: notification.id });
    notification.readFlag = true;
    notifyStore.setNotificationUnreadCount(notifyStore.notificationUnreadCount - 1);
  }
  const target = notificationRoute(notification);
  if (target) router.push(target);
  else Message.info('该通知未提供可跳转的业务对象，已保留在通知列表');
}

async function readAll() {
  if (readingAll.value) return;
  readingAll.value = true;
  try {
    await notifyApi.markAllNotificationsRead();
    records.value.forEach(item => { item.readFlag = true; });
    notifyStore.setNotificationUnreadCount(0);
    Message.success('已全部标记为已读');
  } catch {
    // 请求层已展示错误，保留未读状态供用户重试。
  } finally {
    readingAll.value = false;
  }
}

async function remove(notification: Api.RealNotify.NotificationVO) {
  if (deletingId.value !== undefined) return;
  deletingId.value = notification.id;
  try {
    await notifyApi.deleteNotification(notification.id);
    records.value = records.value.filter(item => !sameBusinessId(item.id, notification.id));
    total.value = Math.max(0, total.value - 1);
    if (!notification.readFlag) notifyStore.setNotificationUnreadCount(notifyStore.notificationUnreadCount - 1);
  } catch {
    // 请求层已展示错误，保留当前通知，避免把删除失败误显示为成功。
  } finally {
    deletingId.value = undefined;
  }
}

function clearAll() {
  if (clearing.value || clearConfirmationOpen.value) return;
  clearConfirmationOpen.value = true;
  Modal.warning({
    title: '清空通知',
    content: '确认清空当前账号的全部站内通知？',
    hideCancel: false,
    onCancel() {
      clearConfirmationOpen.value = false;
    },
    onOk: async () => {
      if (clearing.value) return;
      clearing.value = true;
      try {
        await notifyApi.clearNotifications();
        records.value = [];
        total.value = 0;
        notifyStore.setNotificationUnreadCount(0);
        Message.success('通知已清空');
      } catch {
        // 请求层已展示错误，保留当前列表供用户重试。
      } finally {
        clearing.value = false;
        clearConfirmationOpen.value = false;
      }
    }
  });
}

notifyStore.subscribe(event => {
  if (event.type !== 'NOTIFICATION') return;
  const notification = event.payload.notification || event.payload;
  if (notification.id && !records.value.some(item => sameBusinessId(item.id, notification.id))) {
    records.value.unshift(notification);
    total.value += 1;
  }
});

onMounted(load);
onBeforeUnmount(requestGuard.invalidate);
</script>

<template>
  <div class="notification-page shop-container">
    <div class="page-header">
      <div><h1>站内通知</h1><p>订单状态、退款和资金结算等平台提醒</p></div>
      <a-space>
        <a-button :disabled="!hasUnread" :loading="readingAll" @click="readAll">全部已读</a-button>
        <a-button status="danger" :disabled="!records.length" :loading="clearing || clearConfirmationOpen" @click="clearAll">清空通知</a-button>
      </a-space>
    </div>

    <a-card :bordered="false" class="notification-card">
      <div class="filter-row">
        <a-radio-group v-model="unreadOnly" type="button" @change="pageNo = 1; load()">
          <a-radio :value="false">全部</a-radio><a-radio :value="true">仅未读</a-radio>
        </a-radio-group>
        <span class="count">共 {{ total }} 条</span>
      </div>

      <a-spin :loading="loading" style="width: 100%">
        <div v-if="records.length" class="notification-list">
          <div v-for="notification in records" :key="notification.id" class="notification-row" :class="{ unread: !notification.readFlag }">
            <div class="notification-icon"><Icon :icon="iconFor(notification)" width="20" /></div>
            <button class="notification-main" @click="openNotification(notification)">
              <div class="title-row"><strong>{{ notification.title || '平台通知' }}</strong><a-tag :color="categoryFor(notification).color" size="small">{{ categoryFor(notification).label }}</a-tag><span v-if="!notification.readFlag" class="unread-dot"></span></div>
              <p>{{ notification.content || '—' }}</p>
              <time>{{ formatTime(notification.createdAt) }}</time>
            </button>
            <a-button type="text" status="danger" size="small" :loading="sameBusinessId(deletingId, notification.id)" @click="remove(notification)">删除</a-button>
          </div>
        </div>
        <EmptyState
          v-else-if="!loading"
          :title="loadError || '暂无站内通知'"
          :description="loadError ? '不会把请求失败误显示为没有通知。' : '订单和退款状态变化后会在这里提醒你'"
          :action-text="loadError ? '重新加载' : undefined"
          @action="load"
        />
      </a-spin>

      <div v-if="total > pageSize" class="pagination">
        <a-pagination v-model:current="pageNo" :total="total" :page-size="pageSize" @change="load" />
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.notification-page { padding-top: 16px; }.page-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }.page-header h1 { margin: 0; font-size: 20px; }.page-header p { margin: 6px 0 0; color: #86909c; font-size: 12px; }.notification-card { border-radius: var(--bw-card-radius); }.filter-row { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 1px solid #f2f3f5; }.count { color: #86909c; font-size: 12px; }.notification-row { display: flex; align-items: flex-start; gap: 14px; padding: 16px 4px; border-bottom: 1px solid #f2f3f5; }.notification-row.unread { background: #f7fbff; }.notification-icon { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #e8f3ff; color: #165dff; }.notification-main { flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }.title-row { display: flex; align-items: center; gap: 8px; color: #1d2129; font-size: 14px; }.unread-dot { width: 7px; height: 7px; border-radius: 50%; background: #f53f3f; }.notification-main p { margin: 6px 0; color: #4e5969; font-size: 13px; line-height: 1.6; }.notification-main time { color: #86909c; font-size: 11px; }.pagination { display: flex; justify-content: flex-end; margin-top: 18px; }
@media (max-width: 720px) { .page-header { align-items: flex-start; flex-direction: column; gap: 12px; } .filter-row { align-items: flex-start; flex-direction: column; gap: 10px; } .notification-row { gap: 10px; } .title-row { flex-wrap: wrap; } .notification-row :deep(.arco-btn) { flex-shrink: 0; } .pagination { justify-content: center; } }
</style>
