<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AiImage from '@/components/ai/ai-image.vue';
import { fetchAiWelcome, uploadAiImage } from '@/service/api/ai';
import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import ResultCard from '@/components/ai/result-card.vue';
import ProductCards from '@/components/ai/product-cards.vue';
import HumanHandoffCard from '@/components/ai/human-handoff-card.vue';
import { useAiProductCards } from '@/composables/use-ai-product-cards';
import { useAiConversations } from '@/composables/use-ai-conversations';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
const { visibleSessions, messages, conversationId, input, attachments, uploading, running, busy, listLoading, historyLoading, ready, error, listError,
  notice, humanHandling, supportRoute, applying, requestHuman, historyMore, sessionMore, scrollRef, canSend, canAnswer, answerQuestion, pending, archived, loadSessions, loadHistory, changeSession, stop, send } = useAiConversations();
const locked = computed(() => busy.value || uploading.value || listLoading.value || historyLoading.value);
const currentCards = useAiProductCards(
  () => messages.value.flatMap(message => message.parts.flatMap(part => part.type === 'products' ? part.card.items.map(item => item.action.target_id) : [])),
  () => [conversationId.value, user.sessionVersion], () => !user.initializing
);
const imageInput = ref<HTMLInputElement>();
const composerId = useId();
const composerInput = ref<HTMLTextAreaElement>();
const composerHeight = ref<number>();
const clampComposerHeight = (height:number) => Math.max(48, Math.min(120, height));
const currentComposerHeight = () => composerHeight.value ?? composerInput.value?.getBoundingClientRect().height ?? 48;
let resizeDrag: { pointerId:number; startY:number; startHeight:number; target:HTMLElement } | undefined;
let suppressResizeClick = false;
function finishResize(event?: PointerEvent) {
  if (!resizeDrag || (event && event.pointerId !== resizeDrag.pointerId)) return;
  const { target, pointerId } = resizeDrag;
  resizeDrag = undefined;
  if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
}
function startResize(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || resizeDrag) return;
  const target = event.currentTarget as HTMLElement;
  suppressResizeClick = false;
  resizeDrag = { pointerId:event.pointerId, startY:event.clientY, startHeight:clampComposerHeight(currentComposerHeight()), target };
  target.setPointerCapture(event.pointerId);
}
function moveResize(event: PointerEvent) {
  if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
  const delta = resizeDrag.startY - event.clientY;
  if (!suppressResizeClick && Math.abs(delta) < 3) return;
  suppressResizeClick = true;
  composerHeight.value = clampComposerHeight(resizeDrag.startHeight + delta);
}
function toggleResize(event: MouseEvent) {
  if (suppressResizeClick && event.detail !== 0) { suppressResizeClick = false; return; }
  composerHeight.value = currentComposerHeight() > 48 ? 48 : 120;
}
function onResizeKeydown(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  composerHeight.value = clampComposerHeight(event.key === 'Home' ? 48 : event.key === 'End' ? 120 : currentComposerHeight() + (event.key === 'ArrowUp' ? 16 : -16));
}
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
watch([() => user.currentUser?.id, () => user.sessionVersion, conversationId], () => { finishResize(); uploadVersion++; uploadController.abort(); uploadController = new AbortController(); uploading.value = false; uploadError.value = ''; });
onBeforeUnmount(() => { finishResize(); uploadVersion++; uploadController.abort(); });

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
      <div class="ai-title"><h2 aria-level="1">好物选购助手</h2><small>{{ user.isLoggedIn ? '选购咨询 · 本人订单与钱包查询' : '选购咨询 · 登录后可查询本人订单与钱包' }}</small></div>
      <div class="heading-actions">
        <Tooltip v-if="user.isLoggedIn && conversationId"><TooltipTrigger as-child><button class="history-refresh" type="button" :aria-label="historyLoading ? '消息加载中' : pending ? '刷新消息状态' : '刷新当前会话'" :aria-busy="historyLoading" :disabled="locked || running" @click="loadHistory()"><Icon :icon="historyLoading ? 'lucide:loader-circle' : 'lucide:refresh-cw'" :class="{ 'animate-spin motion-reduce:animate-none': historyLoading }" aria-hidden="true" /></button></TooltipTrigger><TooltipContent side="top">{{ historyLoading ? '消息加载中' : pending ? '刷新消息状态' : '刷新当前会话' }}</TooltipContent></Tooltip>
        <button type="button" class="text-link new-conversation" :disabled="locked || !ready" @click="newConversation"><UmIcon name="plus" />新会话</button>
      </div>
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
        <div v-if="historyLoading || notice || error || (user.isLoggedIn && conversationId && historyMore)" class="history-actions">
          <button v-if="user.isLoggedIn && conversationId && historyMore" class="text-link" type="button" :disabled="locked || running" @click="loadHistory(true)">加载更早消息</button>
          <p v-if="notice && !historyLoading" class="conversation-notice" role="status">{{ notice }}</p>
          <p v-if="historyLoading" class="conversation-notice" role="status">消息加载中</p>
          <p v-else-if="error" class="message-error" role="alert">{{ error }}</p>
        </div>
        <div ref="scrollRef" class="chat-messages chat-scroll" role="log" aria-label="客服对话" aria-live="polite" aria-relevant="additions text" :aria-busy="running || historyLoading">
          <EmptyState v-if="!messages.length && ready && !historyLoading && !error" icon="lucide:sparkles" :title="welcome || 'AI 客服'" />
          <p v-if="welcomeError && !messages.length" role="alert">{{ welcomeError }} <button type="button" @click="loadWelcome">重试</button></p>
          <article v-for="message in messages" :key="message.id" class="ai-message" :class="message.role" :aria-label="message.role === 'user' ? '我的问题' : '客服回答'">
            <div class="ai-message-avatar" aria-hidden="true"><UmIcon :name="message.role === 'user' ? 'user' : 'headset'" /></div>
            <div class="ai-message-content">
              <div v-if="message.images?.length" class="ai-attachments"><AiImage v-for="image in message.images" :key="image.fileId" :file-id="image.fileId" /></div>
              <p v-if="message.text" class="ai-message-text">{{ message.text }}</p>
              <template v-for="(part, partIndex) in message.parts" :key="partIndex">
                <p v-if="part.type === 'text'" class="ai-message-text">{{ part.text }}</p>
                <ResultCard v-else-if="part.type === 'card'" :card="part.card" @login="login" />
                <HumanHandoffCard v-else-if="part.type === 'handoff'" :card="part.card" :route="supportRoute" :logged-in="user.isLoggedIn" :applying="applying" @confirm="requestHuman" @login="login" />
                <ProductCards v-else :card="part.card" :products="currentCards.products.value" :loading="currentCards.loading.value" :error="currentCards.error.value" @retry="currentCards.refresh" />
              </template>
              <section v-if="message.question" class="ai-question" aria-label="继续咨询">
                <p v-if="message.question.placement !== 'in_content'" class="ai-message-text">{{ message.question.text }}</p>
                <div class="button-row"><button v-for="question in message.question.options" :key="question" type="button" class="outline" :disabled="!canAnswer(message) || locked" @click="answerQuestion(message, question)">{{ question }}</button></div>
              </section>
              <p v-if="message.imSync?.sync_status === 'pending'" class="message-progress">消息待同步</p>
              <p v-if="message.snapshot" class="message-progress">历史查询快照，请以当前业务记录为准。</p>
              <p v-if="message.truncated" class="message-progress">部分卡片未保存，可重新提问查询。</p>
              <p v-if="message.state === 'PENDING'" class="message-progress">{{ message.progress || '生成中，可手动刷新消息状态。' }}</p>
              <p v-else-if="message.state === 'FAILED' || message.state === 'INTERRUPTED'" class="message-error">{{ message.error || (message.state === 'FAILED' ? '回答失败' : '回答中断') }}</p>
              <p v-else-if="message.role === 'assistant' && !message.text && !message.parts.length" class="message-progress">本轮查询已结束。</p>
            </div>
          </article>
        </div>
        <p v-if="humanHandling"><button type="button" class="text-link" @click="router.push({path:'/im',query:{support:'1'}})">进入人工客服会话 →</button></p>
        <p v-if="archived" class="conversation-notice">此会话已归档，可查看历史。请新建会话继续提问。</p>
        <p v-if="uploadError" role="alert">{{ uploadError }}</p>
        <form class="chat-compose ai-compose" @submit.prevent="send">
          <div v-if="attachments.length" class="composer-attachments" aria-label="待发送图片">
            <div v-for="(image, index) in attachments" :key="image.id" class="composer-attachment">
              <AiImage :file-id="image.id" />
              <button type="button" class="remove-attachment" :aria-label="`移除第 ${index + 1} 张图片`" title="移除图片" :disabled="locked || running" @click="attachments = attachments.filter(row => row.id !== image.id)"><Icon icon="lucide:x" aria-hidden="true" /></button>
            </div>
          </div>
          <div class="compose-editor">
            <button type="button" class="compose-resize" aria-label="调整输入框高度：向上拖动加高，向下拖动缩小；点击切换高度" title="向上拖动加高，向下拖动缩小；点击切换高度" :aria-controls="composerId" @pointerdown="startResize" @pointermove="moveResize" @pointerup="finishResize" @pointercancel="finishResize" @lostpointercapture="finishResize" @click="toggleResize" @keydown="onResizeKeydown"><Icon icon="lucide:grip-horizontal" aria-hidden="true" /></button>
            <textarea :id="composerId" ref="composerInput" v-model="input" :class="{ 'is-resized': composerHeight !== undefined }" :style="composerHeight === undefined ? undefined : { height:composerHeight + 'px' }" rows="1" maxlength="2000" aria-label="咨询问题" aria-describedby="ai-compose-hint" :placeholder="user.isLoggedIn ? '输入问题，也可以添加图片咨询…' : '输入你的问题…'" @keydown="onKeydown" />
          </div>
          <div class="compose-toolbar">
            <div class="compose-tools">
              <input ref="imageInput" type="file" hidden accept=".jpg,.jpeg,.png,.webp" multiple @change="selectImages" />
              <TooltipProvider :delay-duration="200"><Tooltip><TooltipTrigger as-child>
                <button type="button" class="compose-image-button" :aria-label="uploading ? '正在上传图片' : user.isLoggedIn ? '添加图片' : '登录后添加图片'" :disabled="locked || running || attachments.length >= 3" @click="user.isLoggedIn ? imageInput?.click() : login()">
                  <Icon :icon="uploading ? 'lucide:loader-circle' : 'lucide:image-plus'" :class="{ 'animate-spin motion-reduce:animate-none': uploading }" aria-hidden="true" />
                </button>
              </TooltipTrigger><TooltipContent side="top">{{ user.isLoggedIn ? '添加图片' : '登录后可添加图片' }} · 最多 3 张 JPG、PNG 或 WebP，单张 5MB</TooltipContent></Tooltip></TooltipProvider>
              <span v-if="uploading || attachments.length" class="image-counter" role="status">{{ uploading ? '正在上传…' : `${attachments.length}/3 张图片` }}</span>
            </div>
            <button v-if="running" type="button" class="secondary stop-button compose-submit" @click="stop"><Icon icon="lucide:square" aria-hidden="true" />停止生成</button>
            <button v-else type="submit" class="primary compose-submit" :disabled="!canSend">发送<UmIcon name="arrow" /></button>
          </div>
        </form>
        <div id="ai-compose-hint" class="compose-hint"><span>Enter 发送，Shift + Enter 换行 · 查询结果以业务记录为准</span><span>{{ input.length }}/2000</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-attachments { display:flex; gap:12px; flex-wrap:wrap; margin:10px 0; }
.ai-page.chat-panel { display:flex; flex-direction:column; flex:1; width:100%; max-width:none; min-width:0; min-height:0; margin:0; padding:12px 16px 10px; overflow:hidden; }
.ai-page .section-heading { flex-shrink:0; gap:12px; min-height:32px; margin:0 0 10px; padding:0 0 8px; }
.section-heading > div { min-width:0; }
.ai-title { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; }
.ai-page .ai-title h2 { margin:0; font-size:18px; line-height:1.35; }
.heading-actions { display:flex; align-items:center; gap:12px; flex-shrink:0; }
.ai-page .section-heading small { display:block; font-size:11px; line-height:1.4; }
.new-conversation { display:flex; align-items:center; gap:6px; flex-shrink:0; white-space:nowrap; font-size:12px; }
.new-conversation svg { width:15px; height:15px; }
.conversation-notice { color:var(--muted); font-size:12px; margin:0 0 8px; }
.history-actions { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; flex-shrink:0; gap:2px; min-height:32px; margin-bottom:4px; text-align:center; }
.history-actions > p { min-width:0; max-width:100%; margin:0; font-size:12px; overflow-wrap:anywhere; }
.history-refresh { display:grid; place-items:center; flex-shrink:0; width:32px; height:32px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--green); }
.history-refresh svg { width:16px; height:16px; }
.history-refresh:hover:not(:disabled) { background:var(--soft); }
.history-refresh:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.history-refresh:disabled { opacity:.5; }
.ai-page .chat-messages { display:flex; flex-direction:column; flex:1; gap:14px; min-height:0; max-height:none; padding:12px 2px 16px; overflow-y:auto; overscroll-behavior:contain; }
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
.ai-compose { display:flex; flex-direction:column; align-items:stretch; flex-shrink:0; gap:0; margin-top:6px; padding:4px 6px; border:1px solid var(--yb-control-border,var(--line)); border-radius:10px; background:var(--paper); }
.ai-compose:focus-within { border-color:var(--green); box-shadow:0 0 0 2px color-mix(in srgb,var(--green) 12%,transparent); }
.compose-editor { position:relative; min-width:0; }
.ai-compose .compose-resize { position:absolute; top:0; right:0; display:grid; place-items:center; width:24px; height:24px; min-height:24px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--muted); cursor:ns-resize; touch-action:none; user-select:none; }
.compose-resize:hover { color:var(--ink); background:var(--yb-primary-soft); }
.compose-resize:focus-visible { outline:2px solid var(--green); outline-offset:1px; }
.compose-resize svg { width:14px; height:14px; }
.ai-compose textarea { display:block; width:100%; min-width:0; resize:none; field-sizing:content; min-height:48px; max-height:120px; padding:12px 28px 12px 10px; border:0; border-radius:8px; background:transparent; color:inherit; font:inherit; font-size:14px; line-height:1.6; box-shadow:none; }
.ai-compose textarea.is-resized { field-sizing:fixed; }
.ai-compose textarea:focus-visible { outline:0; box-shadow:none; }
.compose-toolbar { display:flex; align-items:center; align-self:stretch; justify-content:space-between; gap:8px; min-height:40px; padding:0 4px 4px; }
.compose-tools { display:flex; align-items:center; gap:8px; min-width:0; }
.ai-compose button { flex-shrink:0; min-height:36px; white-space:nowrap; }
.ai-compose .compose-image-button { display:grid; place-items:center; width:36px; height:36px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--muted); }
.compose-image-button svg { width:20px; height:20px; }
.ai-compose .compose-image-button:hover:not(:disabled) { background:var(--soft); color:var(--green); }
.compose-image-button:focus-visible,.remove-attachment:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.image-counter { font-size:12px; color:var(--muted); }
.ai-page .ai-compose .compose-submit { display:flex; align-items:center; align-self:center; justify-content:center; gap:4px; min-height:30px; padding:3px 8px; border-radius:6px; font-size:12px; line-height:20px; }
.compose-submit svg { width:14px; height:14px; }
.composer-attachments { display:flex; flex-wrap:wrap; gap:12px; padding:6px 8px 0; }
.composer-attachment { position:relative; max-width:180px; }
.composer-attachment :deep(.ai-image img) { max-width:72px; max-height:72px; }
.ai-compose .remove-attachment { position:absolute; z-index:2; top:-6px; right:-6px; display:grid; place-items:center; width:24px; height:24px; min-height:24px; padding:0; border:2px solid var(--paper); border-radius:50%; background:var(--ink); color:var(--paper); box-shadow:0 2px 6px #0004; }
.ai-compose .remove-attachment:hover:not(:disabled) { background:var(--green); color:var(--on-primary); }
.remove-attachment svg { width:14px; height:14px; stroke-width:2.5; }
.compose-hint { display:flex; justify-content:space-between; flex-shrink:0; gap:12px; color:var(--muted); font-size:10px; margin-top:3px; line-height:1.3; }
.compose-hint > span:last-child { flex-shrink:0; }
@media(max-width:640px) {
  .new-conversation { font-size:11px; }
  .ai-page.chat-panel { padding:10px; }
  .ai-page .section-heading { margin-bottom:8px; padding-bottom:6px; }
  .ai-title { display:block; }
  .ai-page .ai-title h2 { font-size:16px; }
  .ai-page .chat-messages { gap:12px; padding:12px 0 16px; }
  .ai-message { gap:8px; }
  .ai-message-avatar { width:28px; height:28px; }
  .ai-message-avatar svg { width:15px; height:15px; }
  .ai-message-content { max-width:calc(100% - 36px); }
  .ai-message-text { padding:10px 12px; font-size:12px; }
  .ai-compose textarea { min-height:48px; font-size:13px; padding:12px 28px 12px 10px; }
  .ai-compose .compose-image-button { width:40px; height:40px; }
  .ai-page .ai-compose .compose-submit { min-height:40px; padding:7px 12px; font-size:12px; }
  .message-progress,.message-error,.conversation-notice { font-size:11px; }
  .compose-hint { font-size:9px; }
}

.ai-workspace { display:flex; flex:1; gap:14px; min-width:0; min-height:0; overflow:hidden; }
.ai-conversation { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; }
.session-list { width:200px; flex-shrink:0; min-height:0; overflow-y:auto; border-right:1px solid var(--line); padding-right:12px; font-size:12px; }
.session-heading { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px; }
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
@media(max-width:760px) { .ai-workspace { flex-direction:column; } .session-list { width:100%; max-height:min(160px,24dvh); border-right:0; border-bottom:1px solid var(--line); padding:0 0 12px; } }
</style>
