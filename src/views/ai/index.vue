<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import AiImage from '@/components/ai/ai-image.vue';
import { fetchAiWelcome, uploadAiImage } from '@/service/api/ai';
import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import ResultCard from '@/components/ai/result-card.vue';
import { useAiConversations } from '@/composables/use-ai-conversations';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
const { visibleSessions, messages, conversationId, input, attachments, uploading, running, busy, listLoading, historyLoading, ready, error, listError,
  notice, historyMore, sessionMore, scrollRef, canSend, pending, archived, loadSessions, loadHistory, changeSession, stop, send } = useAiConversations();
const locked = computed(() => busy.value || uploading.value || listLoading.value || historyLoading.value);
const imageInput = ref<HTMLInputElement>();
const welcome = ref(''); const welcomeError = ref(''); const uploadError = ref('');
let uploadVersion = 0; let uploadController = new AbortController();
async function loadWelcome() { welcomeError.value = ''; try { const data = await fetchAiWelcome(); welcome.value = data.message; } catch { welcomeError.value = '欢迎语加载失败'; } }
onMounted(loadWelcome);
async function selectImages(event: Event) {
  const target = event.target as HTMLInputElement; const files = [...(target.files || [])]; target.value = '';
  if (!user.isLoggedIn) return login();
  if (locked.value || running.value) return;
  if (files.length + attachments.value.length > 3) { uploadError.value = '每轮最多 3 张图片'; return; }
  const operation = ++uploadVersion; uploading.value = true; uploadError.value = '';
  try { for (const file of files) { const image = await uploadAiImage(file, uploadController.signal); if (operation !== uploadVersion) return; attachments.value.push(image); } }
  catch(e) { if (operation === uploadVersion) uploadError.value = e instanceof Error ? e.message : '上传失败，请重试'; }
  finally { if (operation === uploadVersion) uploading.value = false; }
}
watch([() => user.currentUser?.id, () => user.sessionVersion, conversationId], () => { uploadVersion++; uploadController.abort(); uploadController = new AbortController(); uploading.value = false; uploadError.value = ''; });
onBeforeUnmount(() => { uploadVersion++; uploadController.abort(); });

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
        <div class="session-heading">
          <strong>历史会话</strong>
          <span class="session-refresh">
            <button class="text-link" type="button" :disabled="locked || running" @click="loadSessions(false, !ready)">刷新会话</button>
            <span class="session-loading" role="status" :aria-label="listLoading ? '正在读取会话' : undefined">
              <span v-if="listLoading" class="session-spinner" aria-hidden="true" />
            </span>
          </span>
        </div>
        <p v-if="listError" class="message-error" role="alert">{{ listError }}</p>
        <p v-if="!listLoading && !listError && !visibleSessions.length">{{ sessionMore ? '当前页暂无有消息的会话，请加载更多。' : '暂无会话' }}</p>
        <button v-for="session in visibleSessions" :key="session.conversationId" type="button" class="session-row" :class="{ selected: session.conversationId === conversationId }" :aria-current="session.conversationId === conversationId ? 'true' : undefined" :disabled="locked || !ready" @click="changeSession(session.conversationId)">
          <strong :title="session.title || '新会话'">{{ session.title || '新会话' }}</strong>
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
          <EmptyState v-if="!messages.length && ready && !historyLoading && !error" icon="lucide:sparkles" :title="welcome || 'AI 客服'" />
          <p v-if="welcomeError && !messages.length" role="alert">{{ welcomeError }} <button type="button" @click="loadWelcome">重试</button></p>
          <article v-for="message in messages" :key="message.id" class="ai-message" :class="message.role" :aria-label="message.role === 'user' ? '我的问题' : '客服回答'">
            <div class="ai-message-avatar" aria-hidden="true"><UmIcon :name="message.role === 'user' ? 'user' : 'headset'" /></div>
            <div class="ai-message-content">
              <div v-if="message.images?.length" class="ai-attachments"><AiImage v-for="image in message.images" :key="image.fileId" :file-id="image.fileId" /></div>
              <div v-if="message.questions?.length" class="button-row"><button v-for="question in message.questions" :key="question" type="button" class="outline" :disabled="locked || running" @click="input = question; send()">{{ question }}</button></div>
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
        <div class="ai-attachments"><div v-for="image in attachments" :key="image.id"><AiImage :file-id="image.id" /><button type="button" :disabled="locked || running" @click="attachments = attachments.filter(row => row.id !== image.id)">移除图片</button></div></div>
        <p v-if="uploadError" role="alert">{{ uploadError }}</p>
        <div v-if="user.isLoggedIn" class="image-upload-row">
          <input ref="imageInput" type="file" hidden accept=".jpg,.jpeg,.png,.webp" multiple @change="selectImages" />
          <button type="button" class="outline" :disabled="locked || running || attachments.length >= 3" @click="imageInput?.click()">{{ uploading ? '正在上传…' : '添加图片' }}</button>
          <span>最多 3 张 JPG、PNG 或 WebP，单张 5MB</span>
        </div>
        <button v-else type="button" class="text-link" @click="login">登录后发送图片</button>
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
.image-upload-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:12px 0; font-size:12px; color:var(--muted); }
.ai-attachments { display:flex; gap:12px; flex-wrap:wrap; margin:10px 0; }
.ai-page { width:100%; max-width:1240px; min-width:0; margin:12px auto; padding:20px 22px; }
.ai-page .section-heading { gap:12px; padding-bottom:12px; }
.section-heading > div { min-width:0; }
.section-heading small { display:block; line-height:1.55; }
.new-conversation { display:flex; align-items:center; gap:6px; flex-shrink:0; white-space:nowrap; font-size:12px; }
.new-conversation svg { width:15px; height:15px; }
.conversation-notice { color:var(--muted); font-size:12px; margin:0 0 8px; }
.ai-page .chat-messages { display:flex; flex-direction:column; gap:14px; min-height:360px; max-height:66dvh; padding:12px 2px 16px; overflow-y:auto; }
.chat-messages > .empty-state { flex:1; margin:auto; }
.ai-message { display:flex; align-items:flex-start; gap:10px; width:100%; min-width:0; }
.ai-message.user { flex-direction:row-reverse; }
.ai-message-avatar { width:34px; height:34px; border:1px solid var(--line); border-radius:50%; display:grid; place-items:center; flex-shrink:0; color:var(--green); background:var(--paper); }
.ai-message-avatar svg { width:18px; height:18px; }
.ai-message-content { display:flex; flex-direction:column; gap:8px; min-width:0; max-width:min(860px,calc(100% - 44px)); }
.user .ai-message-content { max-width:80%; }
.ai-message-text { margin:0; padding:10px 12px; border-radius:8px; border:1px solid var(--line); background:var(--paper); font-size:14px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
.user .ai-message-text { background:var(--green); color:var(--paper); border-color:var(--green); }
.message-progress,.message-error { font-size:12px; color:var(--muted); margin:0; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; }
.message-error:not(.stopped) { color:var(--danger,#b54737); }
.ai-compose { display:flex; align-items:flex-end; gap:10px; margin-top:10px; }
.ai-compose textarea { min-width:0; flex:1; resize:vertical; min-height:64px; max-height:160px; padding:11px 13px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:inherit; font:inherit; font-size:14px; line-height:1.6; }
.ai-compose textarea:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.ai-compose button { flex-shrink:0; min-height:42px; white-space:nowrap; }
.compose-hint { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:10px; margin-top:6px; line-height:1.5; }
.compose-hint > span:last-child { flex-shrink:0; }
@media(max-width:640px) {
  .new-conversation { font-size:11px; }
  .ai-page { margin:8px auto; padding:18px 16px; }
  .ai-page .section-heading { padding-bottom:10px; }
  .ai-page .chat-messages { min-height:320px; max-height:56dvh; gap:12px; padding:12px 0 16px; }
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

.ai-workspace { display:flex; gap:14px; min-width:0; }
.ai-conversation { flex:1; min-width:0; }
.session-list { width:200px; flex-shrink:0; max-height:72dvh; overflow-y:auto; border-right:1px solid var(--line); padding-right:12px; font-size:12px; }
.session-heading,.history-actions { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px; }
.session-refresh { display:inline-flex; align-items:center; gap:6px; }
.session-loading { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; flex-shrink:0; color:var(--green); }
.session-spinner { width:12px; height:12px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:session-spin .8s linear infinite; }
@keyframes session-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .session-spinner { animation:none; } }
.session-row { display:flex; align-items:center; width:100%; min-height:44px; margin:5px 0; padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:inherit; text-align:left; }
.session-row strong { min-width:0; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.session-row.selected { border-color:var(--green); }
button:disabled { opacity:.55; cursor:not-allowed; }
.session-row:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
@media(max-width:760px) { .ai-workspace { flex-direction:column; } .session-list { width:100%; max-height:210px; border-right:0; border-bottom:1px solid var(--line); padding:0 0 12px; } }
</style>
