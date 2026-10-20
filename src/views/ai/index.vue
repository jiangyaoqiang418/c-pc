<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import ResultCard from '@/components/ai/result-card.vue';
import { streamCustomerChat } from '@/service/api/ai';
import { RequestError } from '@/service/request';
import { ACCESS_TOKEN_KEY, getAccessToken } from '@/service/request/token';
import { useUserStore } from '@/stores/user';

type ChatPart = { type: 'text'; text: string } | { type: 'card'; card: Api.Ai.CardData };

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  parts: ChatPart[];
  state: 'streaming' | 'completed' | 'stopped' | 'interrupted' | 'error';
  progress: string;
  error: string;
}

const router = useRouter();
const user = useUserStore();
const messages = ref<ChatMessage[]>([]);
const input = ref('');
const running = ref(false);
const conversationId = ref<string | null>(null);
const scrollRef = ref<HTMLElement>();
const inputRef = ref<HTMLTextAreaElement>();
const notice = ref('');
let controller: AbortController | undefined;
let turn = 0;
let messageId = 0;
let mounted = true;
const canSend = computed(() => !running.value && !!input.value.trim() && input.value.length <= 2000 && !user.initializing);

function scrollToLatest() {
  const element = scrollRef.value;
  const nearBottom = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 100;
  if (nearBottom) void nextTick(() => { if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight; });
}

function clearConversation(identityChanged = false) {
  turn += 1;
  controller?.abort();
  controller = undefined;
  running.value = false;
  conversationId.value = null;
  messages.value = [];
  input.value = '';
  notice.value = identityChanged ? '登录身份已变更，已开始新的会话。' : '已开始新的会话。';
}

function stop() { controller?.abort(); }
function login() { void router.push({ path: '/auth/login', query: { redirect: '/ai-guide' } }); }

async function send() {
  if (!canSend.value) return;
  const question = input.value.trim();
  const token = getAccessToken();
  const requestTurn = ++turn;
  const aborter = new AbortController();
  controller = aborter;
  running.value = true;
  notice.value = '';
  input.value = '';
  messages.value.push({ id: ++messageId, role: 'user', text: question, parts: [], state: 'completed', progress: '', error: '' });
  messages.value.push({ id: ++messageId, role: 'assistant', text: '', parts: [], state: 'streaming', progress: '正在连接客服…', error: '' });
  const answer = messages.value[messages.value.length - 1];
  scrollToLatest();
  try {
    await streamCustomerChat({ message: question, conversationId: conversationId.value }, aborter.signal, event => {
      if (!mounted || requestTurn !== turn || token !== getAccessToken()) return;
      if (event.event === 'start') conversationId.value = event.data.conversation_id;
      else if (event.event === 'status') answer.progress = event.data.text;
      else if (event.event === 'delta') {
        const last = answer.parts[answer.parts.length - 1];
        if (last?.type === 'text') last.text += event.data.text;
        else answer.parts.push({ type: 'text', text: event.data.text });
        answer.progress = '正在回答…';
      }
      else if (event.event === 'card') answer.parts.push({ type: 'card', card: event.data.data });
      else if (event.event === 'done') { answer.state = 'completed'; answer.progress = ''; }
      else if (event.event === 'error') { answer.state = 'error'; answer.error = `回答失败，已有内容未完成：${event.data.message}`; answer.progress = ''; }
      scrollToLatest();
    });
  } catch (error) {
    if (!mounted || requestTurn !== turn) return;
    if (token !== getAccessToken() || (error instanceof RequestError && error.code === 'SESSION_CHANGED')) {
      clearConversation(true);
      return;
    }
    answer.progress = '';
    if (aborter.signal.aborted) {
      answer.state = 'stopped';
      answer.error = '已停止生成，当前回答可能不完整。';
    } else {
      answer.state = error instanceof RequestError && ['STREAM_INTERRUPTED', 'INVALID_STREAM', 'REQUEST_TIMEOUT', 'STREAM_TOO_LARGE'].includes(error.code ?? '') ? 'interrupted' : 'error';
      answer.error = error instanceof Error ? error.message : '回答中断，请重新提问';
      if (error instanceof RequestError && error.status === 404) {
        conversationId.value = null;
        // 保留用户在等待期间新写的草稿；没有新草稿时恢复本次问题供手动发送。
        if (!input.value) input.value = question;
        answer.error = `${answer.error}，请重新提问开始新会话。`;
      }
    }
    scrollToLatest();
  } finally {
    if (mounted && requestTurn === turn) {
      running.value = false;
      controller = undefined;
      void nextTick(() => inputRef.value?.focus());
    }
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

function onStorage(event: StorageEvent) {
  if (event.key === ACCESS_TOKEN_KEY || event.key === null) clearConversation(true);
}

watch([() => user.sessionVersion, () => user.currentUser?.id, () => user.demoUser?.id], () => clearConversation(true), { flush: 'sync' });
onMounted(() => window.addEventListener('storage', onStorage));
onBeforeUnmount(() => {
  mounted = false;
  turn += 1;
  controller?.abort();
  window.removeEventListener('storage', onStorage);
});
</script>

<template>
  <section class="paper chat-panel ai-page" aria-label="AI 客服">
    <div class="section-heading">
      <div><h2 aria-level="1">好物选购助手</h2><small>{{ user.isLoggedIn ? '选购咨询 · 本人订单与钱包查询' : '选购咨询 · 登录后可查询本人订单与钱包' }}</small></div>
      <button type="button" class="text-link new-conversation" @click="clearConversation()"><UmIcon name="plus" />新会话</button>
    </div>
    <p v-if="notice" class="conversation-notice" role="status">{{ notice }}</p>
    <div ref="scrollRef" class="chat-messages chat-scroll" role="log" aria-label="客服对话" aria-live="polite" aria-relevant="additions text" :aria-busy="running">
      <EmptyState v-if="!messages.length" icon="lucide:sparkles" title="有什么可以帮你？" description="可以咨询商品，或查询本人的订单、余额、充值、提现与钱包直付记录。" />
      <article v-for="message in messages" :key="message.id" class="ai-message" :class="message.role" :aria-label="message.role === 'user' ? '我的问题' : '客服回答'">
        <div class="ai-message-avatar" aria-hidden="true"><UmIcon :name="message.role === 'user' ? 'user' : 'headset'" /></div>
        <div class="ai-message-content">
          <p v-if="message.text" class="ai-message-text">{{ message.text }}</p>
          <template v-for="(part, partIndex) in message.parts" :key="partIndex">
            <p v-if="part.type === 'text'" class="ai-message-text">{{ part.text }}</p>
            <ResultCard v-else :card="part.card" @login="login" />
          </template>
          <p v-if="message.state === 'streaming'" class="message-progress">{{ message.progress || '正在回答…' }}</p>
          <p v-else-if="message.error" class="message-error" :class="{ stopped: message.state === 'stopped' }">{{ message.error }}</p>
          <p v-else-if="message.role === 'assistant' && !message.parts.length" class="message-progress">本轮查询已结束。</p>
        </div>
      </article>
    </div>
    <form class="chat-compose ai-compose" @submit.prevent="send">
      <textarea ref="inputRef" v-model="input" rows="2" maxlength="2000" aria-label="咨询问题" aria-describedby="ai-compose-hint" placeholder="输入你的问题…" @keydown="onKeydown" />
      <button v-if="running" type="button" class="secondary stop-button" @click="stop">停止生成</button>
      <button v-else type="submit" class="primary" :disabled="!canSend">发送<UmIcon name="arrow" /></button>
    </form>
    <div id="ai-compose-hint" class="compose-hint"><span>Enter 发送，Shift + Enter 换行 · 查询结果以业务记录为准</span><span>{{ input.length }}/2000</span></div>
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
</style>
