<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import ResultCard from '@/components/ai/result-card.vue';
import { useAiConversations } from '@/composables/use-ai-conversations';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
const { sessions, messages, conversationId, input, running, busy, listLoading, historyLoading, ready, error, listError,
  notice, historyMore, sessionMore, scrollRef, canSend, pending, archived, loadSessions, loadHistory, changeSession, stop, send } = useAiConversations();
const locked = computed(() => busy.value || listLoading.value || historyLoading.value);
function login() { void router.push({ path: '/auth/login', query: { redirect: '/ai-guide' } }); }
function newConversation() { if (user.isLoggedIn) void changeSession(); else login(); }
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault(); void send();
}
</script>

<template>
  <section class="paper chat-panel ai-page" aria-label="AI 客服">
    <div class="section-heading">
      <div><h2 aria-level="1">好物选购助手</h2><small>{{ user.isLoggedIn ? '选购咨询 · 本人订单与钱包查询' : '选购咨询 · 登录后可查询本人订单与钱包' }}</small></div>
      <button type="button" class="text-link new-conversation" :disabled="locked || !ready" @click="newConversation"><UmIcon name="plus" />新会话</button>
    </div>
    <div class="ai-workspace" :class="{ 'has-history': user.isLoggedIn }">
      <aside v-if="user.isLoggedIn" class="session-list" aria-label="历史会话">
        <div class="session-heading"><strong>历史会话</strong><button class="text-link" type="button" :disabled="locked || running" @click="loadSessions(false, !ready)">刷新会话</button></div>
        <p v-if="listLoading" role="status">正在读取会话…</p>
        <p v-if="listError" class="message-error" role="alert">{{ listError }}</p>
        <p v-if="!listLoading && !listError && !sessions.length">暂无会话</p>
        <button v-for="session in sessions" :key="session.conversationId" type="button" class="session-row" :class="{ selected: session.conversationId === conversationId }" :aria-current="session.conversationId === conversationId ? 'true' : undefined" :disabled="locked || !ready" @click="changeSession(session.conversationId)">
          <strong>{{ session.title || '新会话' }}</strong><small>{{ session.lastMessagePreview || '暂无消息' }}</small><small v-if="session.status === 'ARCHIVED'">已归档</small>
        </button>
        <button v-if="sessionMore" class="text-link" type="button" :disabled="locked" @click="loadSessions(true)">加载更多会话</button>
      </aside>
      <div class="ai-conversation">
        <p v-if="notice" class="conversation-notice" role="status">{{ notice }}</p>
        <p v-if="error" class="message-error" role="alert">{{ error }}</p>
        <div v-if="user.isLoggedIn && conversationId" class="history-actions">
          <button v-if="historyMore" class="text-link" type="button" :disabled="locked || running" @click="loadHistory(true)">加载更早消息</button>
          <button class="text-link" type="button" :disabled="locked || running" @click="loadHistory()">{{ pending ? '刷新消息状态' : '刷新消息' }}</button>
        </div>
        <p v-if="historyLoading" role="status">正在读取历史消息…</p>
        <div ref="scrollRef" class="chat-messages chat-scroll" role="log" aria-label="客服对话" aria-live="polite" aria-relevant="additions text" :aria-busy="running || historyLoading">
          <EmptyState v-if="!messages.length && ready && !historyLoading && !error" icon="lucide:sparkles" title="有什么可以帮你？" description="可以咨询商品，或查询本人的订单、余额、充值、提现与钱包直付记录。" />
          <article v-for="message in messages" :key="message.id" class="ai-message" :class="message.role" :aria-label="message.role === 'user' ? '我的问题' : '客服回答'">
            <div class="ai-message-avatar" aria-hidden="true"><UmIcon :name="message.role === 'user' ? 'user' : 'headset'" /></div>
            <div class="ai-message-content">
              <p v-if="message.text" class="ai-message-text">{{ message.text }}</p>
              <template v-for="(part, partIndex) in message.parts" :key="partIndex">
                <p v-if="part.type === 'text'" class="ai-message-text">{{ part.text }}</p>
                <ResultCard v-else :card="part.card" @login="login" />
              </template>
              <p v-if="message.snapshot" class="message-progress">历史查询快照，请以当前业务记录为准。</p>
              <p v-if="message.truncated" class="message-progress">部分卡片未保存，可重新提问查询。</p>
              <p v-if="message.state === 'PENDING'" class="message-progress">{{ message.progress || '生成中，可手动刷新消息状态。' }}</p>
              <p v-else-if="message.state === 'FAILED' || message.state === 'INTERRUPTED'" class="message-error">{{ message.error || (message.state === 'FAILED' ? '回答失败' : '回答中断') }}</p>
              <p v-else-if="message.role === 'assistant' && !message.text && !message.parts.length" class="message-progress">本轮查询已结束。</p>
            </div>
          </article>
        </div>
        <p v-if="archived" class="conversation-notice">此会话已归档，可查看历史。请新建会话继续提问。</p>
        <form class="chat-compose ai-compose" @submit.prevent="send">
          <textarea v-model="input" rows="2" maxlength="2000" aria-label="咨询问题" aria-describedby="ai-compose-hint" placeholder="输入你的问题…" @keydown="onKeydown" />
          <button v-if="running" type="button" class="secondary stop-button" @click="stop">停止生成</button>
          <button v-else type="submit" class="primary" :disabled="!canSend">发送<UmIcon name="arrow" /></button>
        </form>
        <div id="ai-compose-hint" class="compose-hint"><span>Enter 发送，Shift + Enter 换行 · 查询结果以业务记录为准</span><span>{{ input.length }}/2000</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-page { min-width:0; }
.section-heading { gap:14px; }
.section-heading > div { min-width:0; }
.section-heading small { display:block; line-height:1.7; }
.new-conversation { display:flex; align-items:center; gap:6px; flex-shrink:0; white-space:nowrap; font-size:12px; }
.new-conversation svg { width:15px; height:15px; }
.conversation-notice { color:var(--muted); font-size:12px; margin:0 0 12px; }
.ai-page .chat-messages { display:flex; flex-direction:column; gap:22px; min-height:350px; max-height:62dvh; padding:16px 4px 24px; overflow-y:auto; }
.chat-messages > .empty-state { flex:1; margin:auto; }
.ai-message { display:flex; align-items:flex-start; gap:12px; width:100%; min-width:0; }
.ai-message.user { flex-direction:row-reverse; }
.ai-message-avatar { width:34px; height:34px; border:1px solid var(--line); border-radius:50%; display:grid; place-items:center; flex-shrink:0; color:var(--green); background:var(--paper); }
.ai-message-avatar svg { width:18px; height:18px; }
.ai-message-content { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:min(760px,calc(100% - 46px)); }
.user .ai-message-content { max-width:80%; }
.ai-message-text { margin:0; padding:13px 16px; border-radius:8px; border:1px solid var(--line); background:var(--paper); font-size:14px; line-height:1.9; white-space:pre-wrap; overflow-wrap:anywhere; }
.user .ai-message-text { background:var(--green); color:var(--paper); border-color:var(--green); }
.message-progress,.message-error { font-size:12px; color:var(--muted); margin:0; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; }
.message-error:not(.stopped) { color:var(--danger,#b54737); }
.ai-compose { display:flex; align-items:flex-end; gap:12px; margin-top:14px; }
.ai-compose textarea { min-width:0; flex:1; resize:vertical; min-height:64px; max-height:160px; padding:11px 13px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:inherit; font:inherit; font-size:14px; line-height:1.6; }
.ai-compose textarea:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.ai-compose button { flex-shrink:0; min-height:42px; white-space:nowrap; }
.compose-hint { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:10px; margin-top:8px; line-height:1.6; }
.compose-hint > span:last-child { flex-shrink:0; }
@media(max-width:640px) {
  .new-conversation { font-size:11px; }
  .ai-page .chat-messages { min-height:320px; max-height:56dvh; gap:18px; padding:12px 0 20px; }
  .ai-message { gap:8px; }
  .ai-message-avatar { width:28px; height:28px; }
  .ai-message-avatar svg { width:15px; height:15px; }
  .ai-message-content { max-width:calc(100% - 36px); }
  .ai-message-text { padding:10px 12px; font-size:12px; }
  .ai-compose { gap:8px; }
  .ai-compose textarea { min-height:60px; font-size:13px; padding:10px; }
  .ai-compose button { padding:9px 12px; font-size:11px; }
  .message-progress,.message-error,.conversation-notice { font-size:11px; }
  .compose-hint { font-size:9px; }
}

.ai-workspace { display:flex; gap:20px; min-width:0; }
.ai-conversation { flex:1; min-width:0; }
.session-list { width:220px; flex-shrink:0; max-height:70dvh; overflow-y:auto; border-right:1px solid var(--line); padding-right:16px; font-size:12px; }
.session-heading,.history-actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px; }
.session-row { display:flex; flex-direction:column; gap:6px; width:100%; min-height:64px; margin:6px 0; padding:12px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:inherit; text-align:left; }
.session-row strong,.session-row small { overflow-wrap:anywhere; white-space:pre-wrap; }
.session-row small { color:var(--muted); }
.session-row.selected { border-color:var(--green); }
button:disabled { opacity:.55; cursor:not-allowed; }
.session-row:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
@media(max-width:760px) { .ai-workspace { flex-direction:column; } .session-list { width:100%; max-height:210px; border-right:0; border-bottom:1px solid var(--line); padding:0 0 12px; } }
</style>
