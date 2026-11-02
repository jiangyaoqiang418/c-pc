/** 只在当前浏览器运行期交接接口返回的会话，避免新建群尚未分页到时误选其他群。 */
let handoff: { conversation: Api.RealNotify.ImConversationVO; owner: string; session: number; expires: number } | undefined;

export function rememberConsultation(conversation: Api.RealNotify.ImConversationVO, owner: string, session: number) {
  handoff = { conversation, owner, session, expires: Date.now() + 60_000 };
}

export function takeConsultation(id: string | undefined, owner: string, session: number) {
  const saved = handoff;
  handoff = undefined;
  if (saved && saved.owner === owner && saved.session === session && saved.expires > Date.now()
    && String(saved.conversation.id) === id) return saved.conversation;
}
