import { onScopeDispose, ref, watch } from 'vue';
import { useNotifyStore } from '@/stores/notify';
import { useUserStore } from '@/stores/user';
import { applyHumanSupport, fetchSupportConversation, fetchSupportRoute } from '@/service/api/notify';
import { acceptSupportRoute, parseSupportRoute } from '@/utils/human-support';

/** HTTP 串行合并；推送先立即生效，迟到回查不得倒退接待版本。 */
export function useSupportRoute(conversationId?: string, changed?: (next: Api.RealNotify.SupportRoute, previous?: Api.RealNotify.SupportRoute) => void) {
  const user = useUserStore();
  const route = ref<Api.RealNotify.SupportRoute>();
  const error = ref('');
  const applying = ref(false);
  const notice = ref('');
  let knownId = conversationId;
  let epoch = 0;
  let disposed = false;
  let requested = false;
  let pending: Promise<Api.RealNotify.SupportRoute | undefined> | undefined;
  let aborter = new AbortController();
  const current = (version: number) => !disposed && version === epoch && user.isLoggedIn;
  function apply(next: Api.RealNotify.SupportRoute) {
    if (knownId && next.conversationId !== knownId || !acceptSupportRoute(route.value, next)) return false;
    knownId = next.conversationId;
    const previous = route.value;
    route.value = next;
    if (!previous || previous.routingVersion !== next.routingVersion || previous.interveneStatus !== next.interveneStatus) {
      notice.value = next.interveneStatus === 'REQUESTED' ? '正在等待人工客服，您可以继续咨询'
        : next.interveneStatus === 'HANDLING' ? '人工客服接待中' : '';
      changed?.(next, previous);
    }
    return true;
  }
  function refresh(): Promise<Api.RealNotify.SupportRoute | undefined> {
    if (disposed || !user.isLoggedIn) return Promise.resolve(undefined);
    requested = true;
    if (pending) return pending;
    const version = epoch;
    const signal = aborter.signal;
    const task = (async () => {
      while (requested && current(version)) {
        requested = false;
        try {
          if (!knownId) {
            const conversation = await fetchSupportConversation();
            if (!current(version)) return;
            const id = String(conversation.id);
            if (!/^[1-9]\d*$/.test(id)) throw new Error('客服会话信息异常，请刷新后重试');
            knownId = id;
          }
          const next = await fetchSupportRoute({ signal });
          if (!current(version)) return;
          if (next.conversationId !== knownId) throw new Error('客服会话已变化，请重新进入');
          apply(next); error.value = '';
        } catch (e) {
          if (!current(version)) return;
          error.value = e instanceof Error ? e.message : '接待状态暂不可用，请刷新后重试';
          if (!requested) throw e;
        }
      }
      return route.value;
    })();
    pending = task;
    void task.finally(() => { if (pending === task) pending = undefined; }).catch(() => {});
    return task;
  }
  async function requestHuman(reason?: string) {
    if (applying.value || disposed || !user.isLoggedIn) return;
    if (reason !== undefined && reason.length > 255) { notice.value = '转人工原因最多 255 字'; return; }
    const version = epoch;
    applying.value = true; notice.value = '';
    try {
      const latest = await refresh();
      if (!current(version) || !latest) return;
      if (latest.interveneStatus === 'REQUESTED') { notice.value = '正在等待人工客服，您可以继续咨询'; return; }
      if (latest.interveneStatus !== 'NONE' || !latest.aiEnabled) return;
      await applyHumanSupport(latest.conversationId, reason);
      if (!current(version)) return;
      apply({ ...latest, interveneStatus: 'REQUESTED' });
      await refresh();
    } catch (e) {
      if (!current(version)) return;
      notice.value = e instanceof Error ? e.message : '申请结果暂未确认，请刷新接待状态';
      await refresh().catch(() => {});
      if (current(version) && route.value?.interveneStatus === 'REQUESTED') notice.value = '正在等待人工客服，您可以继续咨询';
      else if (current(version) && route.value?.interveneStatus === 'HANDLING') notice.value = '人工客服接待中';
    } finally { if (current(version)) applying.value = false; }
  }
  useNotifyStore().subscribe(event => {
    if (disposed || !user.isLoggedIn) return;
    if (event.type === 'IM_SUPPORT_ROUTE') {
      try {
        const next = parseSupportRoute(event.payload);
        if (!knownId || next.conversationId !== knownId || !acceptSupportRoute(route.value, next)) return;
        apply(next);
        void refresh().catch(() => {});
      } catch { /* 非法或其他会话事件不影响当前接待状态。 */ }
    } else if (event.type === 'SYNC') void refresh().catch(() => {});
  });
  watch([() => user.sessionVersion, () => user.currentUser?.id], () => {
    epoch++; aborter.abort(); aborter = new AbortController(); pending = undefined; requested = false;
    knownId = conversationId; route.value = undefined; error.value = ''; applying.value = false; notice.value = '';
  }, { flush: 'sync' });
  onScopeDispose(() => { disposed = true; epoch++; requested = false; aborter.abort(); });
  return { route, error, refresh, applying, notice, requestHuman };
}
