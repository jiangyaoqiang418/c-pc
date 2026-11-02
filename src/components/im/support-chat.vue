<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useSupportChat } from '@/composables/use-support-chat';
import { useAiProductCards } from '@/composables/use-ai-product-cards';
import { uploadAiImage } from '@/service/api/ai';
import { markConversationRead } from '@/service/api/notify';
import { useUserStore } from '@/stores/user';
import { useNotifyStore } from '@/stores/notify';
import AiImage from '@/components/ai/ai-image.vue';
import ProductCards from '@/components/ai/product-cards.vue';
import ResultCard from '@/components/ai/result-card.vue';
import MessageBubble from './message-bubble.vue';
import MessageInput from './message-input.vue';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const user = useUserStore();
const notify = useNotifyStore();
const { route, messages, input, attachments, running, loading, applying, notice, error, hasMore, handling, canSend, canAnswer, send, sendHuman, stop, load, refresh, requestHuman } = useSupportChat(props.conversationId);
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
    <div class="support-status" role="status"><span>{{ !route ? '接待状态暂不可用' : handling ? '人工客服接待中' : route.interveneStatus === 'REQUESTED' ? '等待客服接入，AI仍可继续回答' : 'AI客服为你服务' }}</span><button type="button" :disabled="loading" @click="refresh">刷新</button><button v-if="route && !handling" type="button" :disabled="applying || route.interveneStatus === 'REQUESTED'" @click="requestHuman">{{ applying ? '正在申请…' : '转人工' }}</button></div>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    <div ref="viewport" class="support-messages" role="log" aria-label="平台客服消息" aria-live="polite" @scroll="markVisible">
      <button v-if="hasMore" type="button" :disabled="loading" @click="loadOlder">加载更早消息</button>
      <article v-for="message in messages" :key="message.id" :class="['support-message', message.role]">
        <MessageBubble v-if="message.rawIm" :msg="message.rawIm" :side="message.rawIm.msgType === 'SYSTEM' ? 'center' : message.role === 'user' ? 'right' : 'left'" :can-recall="false" @retry="row => sendHuman({type:'text'}, row.clientMsgId)" />
        <template v-else>
          <strong>{{ message.role === 'user' ? '我' : 'AI客服' }}</strong>
          <div v-if="message.images?.length" class="support-images"><AiImage v-for="image in message.images" :key="image.fileId" :file-id="image.fileId" /></div>
          <p v-if="message.text">{{ message.text }}</p>
          <template v-for="(part,index) in message.parts" :key="index"><p v-if="part.type === 'text'">{{ part.text }}</p><ResultCard v-else-if="part.type === 'card'" :card="part.card" /><ProductCards v-else :card="part.card" :products="cards.products.value" :loading="cards.loading.value" :error="cards.error.value" @retry="cards.refresh" /></template>
          <section v-if="message.question"><p v-if="message.question.placement !== 'in_content'">{{ message.question.text }}</p><div class="support-options"><button v-for="option in message.question.options" :key="option" type="button" :disabled="!canAnswer(message) || uploading" @click="input = option; send()">{{ option }}</button></div></section>
          <p v-if="message.state === 'PENDING'" role="status">{{ message.progress || '正在回复…' }}</p><p v-if="message.error" role="alert">{{ message.error }}</p><p v-if="message.imSync?.sync_status === 'pending'">消息待同步</p>
        </template>
      </article>
      <p v-if="!messages.length && !loading">你好，请描述你的问题，也可以添加商品图片。</p>
    </div>
    <MessageInput v-if="handling" :context-key="String(user.sessionVersion) + ':' + conversationId" :submitting="running" :disabled="!route" @send="sendHuman" @media-busy="mediaBusy = $event" />
    <form v-else class="support-compose" @submit.prevent="!uploading && send()">
      <div v-if="attachments.length" class="support-images"><div v-for="image in attachments" :key="image.id"><AiImage :file-id="image.id" /><button type="button" :disabled="uploading || running" aria-label="移除图片" @click="attachments = attachments.filter(row => row.id !== image.id)">移除</button></div></div>
      <textarea v-model="input" rows="2" maxlength="2000" aria-label="咨询问题" placeholder="输入问题，也可以添加图片咨询" @keydown.enter="event => { if (!event.shiftKey && !event.isComposing) { event.preventDefault(); if (!uploading) send(); } }" />
      <div class="support-tools"><input ref="upload" type="file" hidden accept="image/jpeg,image/png,image/webp" multiple @change="selectImages" /><button type="button" :disabled="uploading || running || attachments.length >= 3" @click="upload?.click()">{{ uploading ? '上传中…' : '添加图片' }}</button><button v-if="running" type="button" @click="stop">停止生成</button><button v-else type="submit" :disabled="!canSend || uploading">发送</button></div>
    </form>
  </div>
</template>

<style scoped>
.support-chat { display:flex; flex-direction:column; flex:1; min-height:0; color:var(--ink); overflow:hidden; }
.support-status,.support-tools,.support-options { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 16px; }
.support-status { border-bottom:1px solid var(--line); } .support-status>span { flex:1; }
.support-messages { flex:1; min-height:100px; overflow:auto; padding:16px; }
.support-message { min-width:0; margin-bottom:16px; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
.support-message.user { background:var(--yb-primary-soft); }
p { white-space:pre-wrap; overflow-wrap:anywhere; }
button { min-height:36px; padding:6px 12px; border:1px solid var(--line); border-radius:6px; color:var(--yb-brand-primary); background:var(--paper); }
button:disabled { opacity:.55; cursor:not-allowed; } button:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.support-compose { padding:12px; border-top:1px solid var(--line); }
textarea { width:100%; resize:vertical; max-height:160px; padding:10px; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:8px; }
.support-tools { justify-content:flex-end; padding:8px 0 0; }
.support-images { display:flex; flex-wrap:wrap; gap:8px; } .support-images>div { max-width:100px; }
</style>
