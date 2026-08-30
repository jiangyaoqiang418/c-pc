import { computed, onScopeDispose, ref } from 'vue';
import { defineStore } from 'pinia';
import { getAccessToken } from '@/service/request';
import * as notifyApi from '@/service/api/notify';
import { parseJsonPreservingLong } from '@/utils/json';
import { createLatestRequestGuard } from '@/utils/latest-request';

export type NotifyRealtimeEvent =
  | { type: 'IM_MESSAGE'; payload: Api.RealNotify.ImMessageVO }
  | { type: 'IM_READ'; payload: Api.RealNotify.ImReadEvent }
  | { type: 'IM_RECALL'; payload: Api.RealNotify.ImRecallEvent }
  | { type: 'NOTIFICATION'; payload: Api.RealNotify.NotificationSocketPayload }
  | { type: 'SYNC' };

type RealtimeListener = (event: NotifyRealtimeEvent) => void;

const HEARTBEAT_MS = 25_000;
const READY_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_MS = 30_000;

function normalizeUnreadCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

function realtimeURL(token: string) {
  const base = import.meta.env.VITE_REAL_NOTIFY_BASE_URL || '/api/notify';
  const url = new URL(`${base.replace(/\/$/, '')}/im`, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return { url: url.toString(), protocols: ['im', `im.token.${token}`] };
}

function framePayload<T>(frame: Api.RealNotify.SocketFrame<unknown>): T {
  const candidate = frame.data ?? frame.payload ?? frame.message ?? frame.notification;
  return (candidate ?? frame) as T;
}

export const useNotifyStore = defineStore('bw-notify', () => {
  const listeners = new Set<RealtimeListener>();
  const notificationUnreadCount = ref(0);
  const imUnreadCount = ref(0);
  const socketState = ref<'idle' | 'connecting' | 'open' | 'closed'>('idle');

  let socket: WebSocket | undefined;
  let socketToken = '';
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let missedPongs = 0;
  let manuallyClosed = true;
  let lifecycleBound = false;
  let heartbeatIntervalMs = HEARTBEAT_MS;
  let unreadRefreshVersion = 0;
  let unreadRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  const unreadRequestGuard = createLatestRequestGuard();
  let readSessionVersion = 0;
  const notificationReads = new Map<string, { token: string; marker: symbol; task: Promise<boolean> }>();

  const totalUnreadCount = computed(() => notificationUnreadCount.value + imUnreadCount.value);

  function emit(event: NotifyRealtimeEvent) {
    listeners.forEach(listener => listener(event));
  }

  function subscribe(listener: RealtimeListener) {
    listeners.add(listener);
    const unsubscribe = () => listeners.delete(listener);
    onScopeDispose(unsubscribe);
    return unsubscribe;
  }

  async function refreshUnreadCounts() {
    const isCurrent = unreadRequestGuard.begin();
    const version = ++unreadRefreshVersion;
    const token = getAccessToken();
    if (!token) {
      notificationUnreadCount.value = 0;
      imUnreadCount.value = 0;
      return;
    }
    const [notificationResult, imResult] = await Promise.allSettled([
      notifyApi.fetchUnreadNotificationCount({ signal: isCurrent.signal }),
      notifyApi.fetchUnreadMessageCount({ signal: isCurrent.signal })
    ]);
    if (!isCurrent() || version !== unreadRefreshVersion || token !== getAccessToken()) return;
    if (notificationResult.status === 'fulfilled') {
      const next = normalizeUnreadCount(notificationResult.value);
      if (next !== undefined) notificationUnreadCount.value = next;
    }
    if (imResult.status === 'fulfilled') {
      const next = normalizeUnreadCount(imResult.value);
      if (next !== undefined) imUnreadCount.value = next;
    }
  }

  function scheduleUnreadRefresh() {
    if (unreadRefreshTimer || !getAccessToken()) return;
    unreadRefreshTimer = setTimeout(() => {
      unreadRefreshTimer = undefined;
      void refreshUnreadCounts();
    }, 100);
  }

  function readNotification(id: string | number): Promise<boolean> {
    const token = getAccessToken();
    if (!token) return Promise.resolve(false);
    const key = String(id);
    const pending = notificationReads.get(key);
    if (pending?.token === token) return pending.task;
    const version = readSessionVersion;
    const marker = Symbol();
    const task = (async () => {
      try {
        await Promise.resolve();
        if (version !== readSessionVersion || getAccessToken() !== token) return false;
        await notifyApi.markNotificationRead({ id });
        if (version !== readSessionVersion || getAccessToken() !== token) return false;
        // 详情跳转后仍核对全局角标，不用本地减一覆盖并发通知或全部已读的结果。
        scheduleUnreadRefresh();
        return true;
      } catch {
        // 请求层反馈失败；不伪造已读，也不阻塞业务详情导航。
        return false;
      } finally {
        if (notificationReads.get(key)?.marker === marker) notificationReads.delete(key);
      }
    })();
    notificationReads.set(key, { token, marker, task });
    return task;
  }

  function clearHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    missedPongs = 0;
  }

  function clearReadyTimeout() {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = undefined;
  }

  function startHeartbeat(interval = HEARTBEAT_MS) {
    clearHeartbeat();
    const connection = socket;
    heartbeatTimer = setInterval(() => {
      if (!connection || socket !== connection || connection.readyState !== WebSocket.OPEN) return;
      if (missedPongs >= 2) {
        connection.close(4000, 'heartbeat timeout');
        return;
      }
      connection.send(JSON.stringify({ type: 'PING' }));
      missedPongs += 1;
    }, interval);
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer || !getAccessToken()) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_MS);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  }

  function handleFrame(raw: string) {
    let frame: Api.RealNotify.SocketFrame;
    try {
      frame = parseJsonPreservingLong<Api.RealNotify.SocketFrame>(raw);
    } catch {
      return;
    }

    const type = String(frame.type || '').toUpperCase();
    if (type === 'PONG') {
      missedPongs = 0;
      return;
    }
    if (type === 'READY') {
      clearReadyTimeout();
      socketState.value = 'open';
      reconnectAttempt = 0;
      const serverInterval = Number(frame.heartbeatIntervalMs);
      heartbeatIntervalMs = Number.isFinite(serverInterval) && serverInterval > 0
        ? Math.min(HEARTBEAT_MS, serverInterval)
        : HEARTBEAT_MS;
      startHeartbeat(heartbeatIntervalMs);
      refreshUnreadCounts();
      emit({ type: 'SYNC' });
      return;
    }
    if (type === 'IM_MESSAGE') {
      scheduleUnreadRefresh();
      emit({ type, payload: framePayload<Api.RealNotify.ImMessageVO>(frame) });
      return;
    }
    if (type === 'IM_READ') {
      scheduleUnreadRefresh();
      emit({ type, payload: framePayload<Api.RealNotify.ImReadEvent>(frame) });
      return;
    }
    if (type === 'IM_RECALL') {
      scheduleUnreadRefresh();
      emit({ type, payload: framePayload<Api.RealNotify.ImRecallEvent>(frame) });
      return;
    }
    if (type === 'NOTIFICATION') {
      const payload = framePayload<Api.RealNotify.NotificationSocketPayload>(frame);
      const unreadCount = payload.unreadCount ?? frame.unreadCount;
      if (unreadCount !== undefined && unreadCount !== null) {
        const next = normalizeUnreadCount(unreadCount);
        if (next !== undefined) notificationUnreadCount.value = next;
      } else {
        notificationUnreadCount.value += 1;
      }
      emit({ type, payload });
    }
  }

  function connect() {
    const token = getAccessToken();
    if (socket && socketToken !== token) disconnect();
    if (!token || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    manuallyClosed = false;
    socketState.value = 'connecting';
    const realtime = realtimeURL(token);
    const connection = new WebSocket(realtime.url, realtime.protocols);
    socket = connection;
    socketToken = token;
    const isCurrent = () => socket === connection && !manuallyClosed && token === getAccessToken();

    connection.onopen = () => {
      if (!isCurrent()) return;
      readyTimer = setTimeout(() => {
        if (isCurrent() && connection.readyState === WebSocket.OPEN) connection.close(4001, 'ready timeout');
      }, READY_TIMEOUT_MS);
    };
    connection.onmessage = event => {
      if (!isCurrent()) return;
      if (typeof event.data === 'string') handleFrame(event.data);
    };
    connection.onerror = () => {
      if (isCurrent()) connection.close();
    };
    connection.onclose = () => {
      if (socket !== connection) return;
      socket = undefined;
      clearReadyTimeout();
      clearHeartbeat();
      heartbeatIntervalMs = HEARTBEAT_MS;
      socketState.value = 'closed';
      scheduleReconnect();
    };
  }

  function disconnect() {
    manuallyClosed = true;
    readSessionVersion += 1;
    notificationReads.clear();
    unreadRefreshVersion += 1;
    unreadRequestGuard.invalidate();
    if (unreadRefreshTimer) clearTimeout(unreadRefreshTimer);
    unreadRefreshTimer = undefined;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    clearReadyTimeout();
    clearHeartbeat();
    heartbeatIntervalMs = HEARTBEAT_MS;
    const connection = socket;
    socket = undefined;
    socketToken = '';
    if (connection) {
      connection.onopen = connection.onmessage = connection.onerror = connection.onclose = null;
      if (connection.readyState < WebSocket.CLOSING) connection.close(1000, 'logout');
    }
    socketState.value = 'idle';
    notificationUnreadCount.value = 0;
    imUnreadCount.value = 0;
  }

  function syncAfterResume() {
    if (!getAccessToken()) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) connect();
    refreshUnreadCounts();
    emit({ type: 'SYNC' });
  }

  function bindLifecycle() {
    if (lifecycleBound) return;
    lifecycleBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncAfterResume();
    });
    window.addEventListener('online', syncAfterResume);
  }

  function setImUnreadCount(value: number) {
    const next = normalizeUnreadCount(value);
    if (next !== undefined) imUnreadCount.value = next;
  }

  function setNotificationUnreadCount(value: number) {
    const next = normalizeUnreadCount(value);
    if (next !== undefined) notificationUnreadCount.value = next;
  }

  return {
    notificationUnreadCount,
    imUnreadCount,
    totalUnreadCount,
    socketState,
    connect,
    disconnect,
    bindLifecycle,
    subscribe,
    refreshUnreadCounts,
    scheduleUnreadRefresh,
    readNotification,
    setImUnreadCount,
    setNotificationUnreadCount
  };
});
