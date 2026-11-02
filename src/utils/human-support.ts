import { applyHumanSupport, fetchSupportConversation } from '@/service/api/notify';

export interface SupportActionContext { requestId: string; sync: Api.Ai.ImSync; active: () => boolean; owner: string }

/** 只由活跃 SSE 调用。历史、刷新和 IM 渲染都不会重放动作。 */
export function createHumanSupportHandler(notify: (message: string) => void) {
  const active = new Set<string>();
  const memory = new Map<string, string>();
  const read = (key: string) => { try { return sessionStorage.getItem(key) || memory.get(key); } catch { return memory.get(key); } };
  const write = (key: string, value: string) => { memory.set(key, value); try { sessionStorage.setItem(key, value); } catch { /* 禁止存储时仍保留当前页面去重。 */ } };
  return async (event: Extract<Api.Ai.ChatEvent, { event: 'action' }>['data'], context: SupportActionContext, retry = false) => {
    const sync = context.sync;
    if (!context.active() || event.type !== 'REQUEST_HUMAN_SUPPORT' || event.request_id !== context.requestId
      || !/^human_[1-9]\d*$/.test(event.action_id) || !/^[1-9]\d*$/.test(sync.im_conversation_id) || !/^\d+$/.test(sync.routing_version)) return;
    const key = `human-support:${context.owner}:${sync.im_conversation_id}:${sync.routing_version}:${event.action_id}`;
    if (active.has(key) || (!retry && read(key))) return;
    active.add(key); write(key, 'pending');
    try {
      const route = await fetchSupportConversation();
      if (!context.active()) return;
      if (String(route.id) !== sync.im_conversation_id || route.routingVersion !== sync.routing_version) { write(key, 'stale'); notify('接待状态已变化，请刷新会话'); return; }
      if (route.interveneStatus === 'REQUESTED') { write(key, 'requested'); notify('已申请转人工，等待客服接入'); return; }
      if (route.interveneStatus !== 'NONE' || route.aiEnabled === false) { write(key, 'stale'); notify('接待状态已变化，请刷新会话'); return; }
      await applyHumanSupport(sync.im_conversation_id);
      write(key, 'requested');
      if (context.active()) notify('已申请转人工，等待客服接入');
    } catch {
      write(key, 'uncertain');
      if (context.active()) notify('转人工申请结果暂未确认，请先刷新接待状态，再使用转人工按钮重试');
    } finally { active.delete(key); }
  };
}
