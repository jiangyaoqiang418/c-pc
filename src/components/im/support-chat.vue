<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useSupportChat } from '@/composables/use-support-chat';
import { useAiProductCards } from '@/composables/use-ai-product-cards';
import { uploadAiImage } from '@/service/api/ai';
import { markConversationRead } from '@/service/api/notify';
import { useUserStore } from '@/stores/user';
import { useNotifyStore } from '@/stores/notify';
import AiImage from '@/components/ai/ai-image.vue';
import ProductCards from '@/components/ai/product-cards.vue';
import ResultCard from '@/components/ai/result-card.vue';
import HumanHandoffCard from '@/components/ai/human-handoff-card.vue';
import MessageBubble from './message-bubble.vue';
import MessageInput from './message-input.vue';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const user = useUserStore();
const notify = useNotifyStore();
const { route, messages, input, attachments, running, loading, applying, notice, error, routeError, hasMore, handling, canSend, canAnswer, startNewTopic, send, sendHuman, stop, load, refresh, requestHuman } = useSupportChat(props.conversationId);
const cards = useAiProductCards(() => messages.value.flatMap(row => row.parts.flatMap(part => part.type === 'products' ? part.card.items.map(item => item.action.target_id) : [])), () => [props.conversationId, user.sessionVersion], () => !user.initializing);
const viewport = ref<HTMLElement>();
const upload = ref<HTMLInputElement>();
const uploading = ref(false);
const mediaBusy = ref(false);
const readingOlder = ref(false);
let controller = new AbortController();
const owner = user.sessionVersion;
let alive = true;
let readId = '';
watch([uploading, mediaBusy], () => emit('busy', uploading.value || mediaBusy.value));
async function selectImages(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = [...(target.files || [])]; target.value = '';
  if (uploading.value || running.value || handling.value) return;
  if (files.length + attachments.value.length > 3) { error.value = '最多添加3张图片'; return; }
  uploading.value = true;
  try {
    for (const file of files) {
      const image = await uploadAiImage(file, controller.signal);
      if (!alive || user.sessionVersion !== owner) return;
      attachments.value.push(image);
    }
  } catch (e) { if (alive && user.sessionVersion === owner) error.value = e instanceof Error ? e.message : '图片上传失败'; }
  finally { if (alive) uploading.value = false; }
}
async function loadOlder() {
  const el = viewport.value; const height = el?.scrollHeight || 0; const top = el?.scrollTop || 0;
  readingOlder.value = true;
  try { await load(true); await nextTick(); if (el) el.scrollTop = top + el.scrollHeight - height; }
  finally { readingOlder.value = false; }
}
async function markVisible() {
  const el = viewport.value;
  if (!alive || document.visibilityState !== 'visible' || !el || el.scrollHeight - el.scrollTop - el.clientHeight > 40 || !route.value) return;
  const row = [...messages.value].reverse().find(item => /^[1-9]\d*$/.test(item.id));
  if (!row || readId === row.id) return;
  const id = row.id;
  try { await markConversationRead({ conversationId:props.conversationId, lastReadMessageId:id }); if (alive && user.sessionVersion === owner) { readId = id; void notify.refreshUnreadCounts(); } }
  catch { if (alive) error.value = '已读状态未同步，可刷新后重试'; }
}
watch(() => messages.value.map(row => row.id + row.state).join('|'), async () => {
  const el = viewport.value;
  const atBottom = !readingOlder.value && (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  await nextTick(); if (atBottom && viewport.value) { viewport.value.scrollTop = viewport.value.scrollHeight; void markVisible(); }
});
watch(handling, () => { controller.abort(); controller = new AbortController(); uploading.value = false; attachments.value = []; });
onBeforeUnmount(() => { alive = false; controller.abort(); emit('busy', false); });
</script>

<template>
  <div class="support-chat">
    <div class="support-status" role="status"><span>{{ !route ? '接待状态暂不可用' : handling ? '人工客服接待中' : route.interveneStatus === 'REQUESTED' ? '等待客服接入，AI仍可继续回答' : 'AI为您服务 · 选购与服务咨询' }}</span><button type="button" :disabled="loading" @click="refresh">刷新</button><button v-if="route && !handling" type="button" :disabled="applying || route.interveneStatus === 'REQUESTED'" @click="requestHuman()">{{ applying ? '正在申请…' : '转人工' }}</button></div>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error || routeError" role="alert">{{ error || routeError }}</p>
    <button v-if="!handling" type="button" class="text-link" :disabled="loading || running || uploading" @click="startNewTopic">开启新话题</button>
    <div ref="viewport" class="support-messages" role="log" aria-label="平台客服消息" aria-live="polite" @scroll="markVisible">
      <button v-if="hasMore" type="button" :disabled="loading" @click="loadOlder">加载更早消息</button>
      <article v-for="message in messages" :key="message.id" :class="['support-message', message.role, { 'im-message': message.rawIm }]">
        <MessageBubble v-if="message.rawIm" :msg="message.rawIm" :side="message.rawIm.msgType === 'SYSTEM' ? 'center' : message.role === 'user' ? 'right' : 'left'" :can-recall="false" @retry="row => sendHuman({type:'text'}, row.clientMsgId)" />
        <template v-else>
          <strong>{{ message.role === 'user' ? '我' : 'AI客服' }}</strong>
          <div v-if="message.images?.length" class="support-images"><AiImage v-for="image in message.images" :key="image.fileId" :file-id="image.fileId" /></div>
          <p v-if="message.text">{{ message.text }}</p>
          <template v-for="(part,index) in message.parts" :key="index"><p v-if="part.type === 'text'">{{ part.text }}</p><ResultCard v-else-if="part.type === 'card'" :card="part.card" /><HumanHandoffCard v-else-if="part.type === 'handoff'" :card="part.card" :route="route" :logged-in="user.isLoggedIn" :applying="applying" @confirm="requestHuman" /><ProductCards v-else :card="part.card" :products="cards.products.value" :loading="cards.loading.value" :error="cards.error.value" @retry="cards.refresh" /></template>
          <section v-if="message.question"><p v-if="message.question.placement !== 'in_content'">{{ message.question.text }}</p><div class="support-options"><button v-for="option in message.question.options" :key="option" type="button" :disabled="!canAnswer(message) || uploading" @click="input = option; send()">{{ option }}</button></div></section>
          <p v-if="message.state === 'PENDING'" role="status">{{ message.progress || '正在回复…' }}</p><p v-if="message.error" role="alert">{{ message.error }}</p><p v-if="message.imSync?.sync_status === 'pending'">消息待同步</p>
        </template>
      </article>
      <p v-if="!messages.length && !loading">你好，请描述你的问题，也可以添加商品图片。</p>
    </div>
    <MessageInput v-if="handling" :context-key="String(user.sessionVersion) + ':' + conversationId" :submitting="running" :disabled="!route" @send="sendHuman" @media-busy="mediaBusy = $event" />
    <form v-else class="support-compose" @submit.prevent="!uploading && send()">
      <div v-if="attachments.length" class="support-images"><div v-for="image in attachments" :key="image.id"><AiImage :file-id="image.id" /><button type="button" :disabled="uploading || running" aria-label="移除图片" @click="attachments = attachments.filter(row => row.id !== image.id)">移除</button></div></div>
      <div class="support-editor">
        <textarea v-model="input" rows="2" maxlength="2000" aria-label="咨询问题" placeholder="输入问题，也可以添加图片咨询" @keydown.enter="event => { if (!event.shiftKey && !event.isComposing) { event.preventDefault(); if (!uploading) send(); } }" />
        <div class="support-tools">
          <input ref="upload" type="file" hidden accept="image/jpeg,image/png,image/webp" multiple @change="selectImages" />
          <div class="support-media-tools"><button type="button" class="support-image-tool" :disabled="uploading || running || attachments.length >= 3" :aria-label="uploading ? '图片上传中' : '添加咨询图片'" :title="uploading ? '图片上传中' : '添加图片'" @click="upload?.click()"><Icon :icon="uploading ? 'lucide:loader-circle' : 'lucide:image-plus'" :class="{ 'animate-spin motion-reduce:animate-none': uploading }" aria-hidden="true" /></button><span v-if="attachments.length" class="support-image-count">{{ attachments.length }} / 3 张</span></div>
          <button v-if="running" type="button" class="support-submit" @click="stop"><Icon icon="lucide:square" aria-hidden="true" />停止生成</button>
          <button v-else type="submit" class="support-submit primary" :disabled="!canSend || uploading">发送<Icon icon="lucide:arrow-right" aria-hidden="true" /></button>
        </div>
      </div>
      <p class="support-compose-hint"><span>Enter 发送，Shift+Enter 换行</span><span>{{ input.length }} 字</span></p>
    </form>
  </div>
</template>

<style scoped>
.support-chat { display:flex; flex-direction:column; flex:1; min-height:0; color:var(--ink); overflow:hidden; }
.support-status,.support-tools,.support-options { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 16px; }
.support-status { border-bottom:1px solid var(--line); } .support-status>span { flex:1; }
.support-messages { flex:1; min-height:100px; overflow:auto; padding:16px; }
.support-message { min-width:0; margin-bottom:16px; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
.support-message.user { width:fit-content; max-width:85%; margin-left:auto; background:var(--yb-primary-soft); }
.support-message.im-message { width:100%; max-width:none; padding:0; border:0; background:transparent; }
.im-message :deep(.msg-row.message) { width:fit-content; max-width:85%; }
.im-message.user :deep(.msg-row.message) { margin-left:auto; }
.im-message :deep(.message-body) { display:flex; flex-direction:column; align-items:flex-start; }
.im-message.user :deep(.message-body) { align-items:flex-end; }
.im-message :deep(.avatar) { flex-shrink:0; }
@media(max-width:600px) { .support-message.user,.im-message :deep(.msg-row.message) { max-width:95%; } .support-message.im-message { max-width:none; } }
p { white-space:pre-wrap; overflow-wrap:anywhere; }
button { min-height:36px; padding:6px 12px; border:1px solid var(--line); border-radius:6px; color:var(--yb-brand-primary); background:var(--paper); }
button:disabled { opacity:.55; cursor:not-allowed; } button:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.support-compose { padding:12px; border-top:1px solid var(--line); }
.support-editor { min-width:0; border:1px solid var(--yb-control-border,var(--line)); border-radius:12px; background:var(--paper); }
.support-editor:focus-within { border-color:var(--green); box-shadow:0 0 0 2px color-mix(in srgb,var(--green) 12%,transparent); }
.support-editor textarea { display:block; width:100%; min-width:0; height:56px; min-height:52px; max-height:160px; resize:vertical; padding:10px 16px 6px; color:var(--ink); background:transparent; border:0; border-radius:12px; box-shadow:none; font-size:14px; line-height:1.6; }
.support-editor textarea:focus-visible { outline:0; box-shadow:none; }
.support-tools { justify-content:space-between; gap:12px; padding:0 10px 6px; }
.support-media-tools { display:flex; align-items:center; gap:6px; }
.support-tools .support-image-tool { display:grid; place-items:center; width:32px; height:32px; min-height:32px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--muted); }
.support-image-tool:hover:not(:disabled) { background:var(--soft); color:var(--green); }
.support-image-tool svg { width:18px; height:18px; }
.support-image-count { color:var(--muted); font-size:11px; }
.support-tools .support-submit { display:flex; align-items:center; justify-content:center; gap:4px; min-height:30px; padding:3px 8px; border-radius:6px; font-size:12px; line-height:20px; }
.support-tools .support-submit.primary { background:var(--green); color:var(--on-primary,var(--paper)); border-color:var(--green); }
.support-submit svg { width:14px; height:14px; }
.support-compose-hint { display:flex; justify-content:space-between; gap:12px; margin:6px 0 0; color:var(--muted); font-size:10px; line-height:1.5; }
@media(max-width:700px) { .support-tools .support-image-tool { width:44px; height:44px; min-height:44px; } .support-tools .support-submit { min-height:40px; padding:7px 12px; } .support-editor textarea { font-size:13px; padding:12px 12px 6px; } }
.support-images { display:flex; flex-wrap:wrap; gap:8px; } .support-images>div { max-width:100px; }
</style>
