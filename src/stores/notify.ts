import { computed, onScopeDispose, ref } from 'vue';
import { defineStore } from 'pinia';
import { getAccessToken } from '@/service/request';
import * as notifyApi from '@/service/api/notify';
import { parseJsonPreservingLong } from '@/utils/json';

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
const listeners = new Set<RealtimeListener>();

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
  const notificationUnreadCount = ref(0);
  const imUnreadCount = ref(0);
  const socketState = ref<'idle' | 'connecting' | 'open' | 'closed'>('idle');

  let socket: WebSocket | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let missedPongs = 0;
  let manuallyClosed = true;
  let lifecycleBound = false;
  let heartbeatIntervalMs = HEARTBEAT_MS;

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
    if (!getAccessToken()) {
      notificationUnreadCount.value = 0;
      imUnreadCount.value = 0;
      return;
    }
    const [notificationResult, imResult] = await Promise.allSettled([
      notifyApi.fetchUnreadNotificationCount(),
      notifyApi.fetchUnreadMessageCount()
    ]);
    if (notificationResult.status === 'fulfilled') notificationUnreadCount.value = notificationResult.value || 0;
    if (imResult.status === 'fulfilled') imUnreadCount.value = imResult.value || 0;
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
    heartbeatTimer = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (missedPongs >= 2) {
        socket.close(4000, 'heartbeat timeout');
        return;
      }
      socket.send(JSON.stringify({ type: 'PING' }));
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
      emit({ type, payload: framePayload<Api.RealNotify.ImMessageVO>(frame) });
      return;
    }
    if (type === 'IM_READ') {
      emit({ type, payload: framePayload<Api.RealNotify.ImReadEvent>(frame) });
      return;
    }
    if (type === 'IM_RECALL') {
      emit({ type, payload: framePayload<Api.RealNotify.ImRecallEvent>(frame) });
      return;
    }
    if (type === 'NOTIFICATION') {
      const payload = framePayload<Api.RealNotify.NotificationSocketPayload>(frame);
      const unreadCount = payload.unreadCount ?? frame.unreadCount;
      if (typeof unreadCount === 'number') notificationUnreadCount.value = unreadCount;
      else notificationUnreadCount.value += 1;
      emit({ type, payload });
    }
  }

  function connect() {
    const token = getAccessToken();
    if (!token || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    manuallyClosed = false;
    socketState.value = 'connecting';
    const realtime = realtimeURL(token);
    socket = new WebSocket(realtime.url, realtime.protocols);

    socket.onopen = () => {
      readyTimer = setTimeout(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.close(4001, 'ready timeout');
      }, READY_TIMEOUT_MS);
    };
    socket.onmessage = event => {
      if (typeof event.data === 'string') handleFrame(event.data);
    };
    socket.onerror = () => {
      socket?.close();
    };
    socket.onclose = () => {
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
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    clearReadyTimeout();
    clearHeartbeat();
    heartbeatIntervalMs = HEARTBEAT_MS;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'logout');
    socket = undefined;
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
    imUnreadCount.value = Math.max(0, value);
  }

  function setNotificationUnreadCount(value: number) {
    notificationUnreadCount.value = Math.max(0, value);
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
    setImUnreadCount,
    setNotificationUnreadCount
  };
});
