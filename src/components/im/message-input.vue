<script setup lang="ts">
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue';
import brandCat from '@/assets/images/brand/umaomao-cat-logo.svg';
import emojiLibraryUrl from '@/assets/emoji/unicode-emoji.json?url';
import { useMediaQuery } from '@vueuse/core';
import { Message, Modal } from '@/lib/feedback';
import { uploadImFile } from '@/service/api/notify';
import { shouldSendOnEnter } from '@/utils/im';

interface Props {
  disabled?: boolean;
  disabledText?: string;
  placeholder?: string;
  submitting?: boolean;
  contextKey?: string;
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  disabledText: '当前会话已禁用发送',
  placeholder: '输入消息…'
});

type OutgoingMessage = {
  type: 'text' | 'image' | 'audio' | 'video';
  content?: string;
  mediaFileId?: string | number;
  coverFileId?: string | number;
  coverUrl?: string;
  duration?: number;
};

const emit = defineEmits<{
  (e: 'send', payload: OutgoingMessage): void;
  (e: 'media-busy', value: boolean): void;
}>();

const text = ref('');
const hintId = useId();
const emojiOpen = ref(false);
interface EmojiChoice { emoji: string; label: string; keywords: string }
interface EmojiGroup { label: string; items: EmojiChoice[] }
const commonEmoji = [['😀', '开心'], ['😊', '微笑'], ['😂', '笑哭'], ['🤣', '大笑'], ['🥹', '感动'], ['🤦', '捂脸'], ['😍', '喜欢'], ['😎', '酷'], ['🤔', '思考'], ['😅', '汗颜'], ['😭', '大哭'], ['👍', '点赞'], ['🙏', '感谢'], ['🤝', '握手'], ['👌', '好的'], ['❤️', '爱心'], ['🌹', '玫瑰'], ['🎉', '庆祝']].map(([emoji, label]) => ({ emoji, label, keywords: emoji + ' ' + label }));
const emojiLibrary = shallowRef<EmojiGroup[]>([]);
const emojiLibraryLoading = ref(false);
const emojiLibraryError = ref(false);
const emojiCategory = ref('常用');
const emojiSearch = ref('');
const emojiLimit = ref(120);
const emojiGroups = computed(() => [{ label: '常用', items: commonEmoji }, ...emojiLibrary.value]);
const emojiTotal = computed(() => emojiLibrary.value.reduce((total, group) => total + group.items.length, 0));
const filteredEmoji = computed(() => {
  const query = emojiSearch.value.trim().toLowerCase();
  if (query) {
    const terms = query.split(/\s+/);
    return emojiLibrary.value.flatMap(group => group.items).filter(item => terms.every(term => item.keywords.includes(term)));
  }
  return emojiGroups.value.find(group => group.label === emojiCategory.value)?.items || commonEmoji;
});
const visibleEmoji = computed(() => filteredEmoji.value.slice(0, emojiLimit.value));
const brandStickerLabels = ['收到', '谢谢', '赞', '好的', '没问题', '安排', '稍等', '在的', '马上来', '已确认', '已处理', '请查收', '辛苦了', '不客气', '欢迎', '抱歉', '加油', '晚安', '早上好', '合作愉快', '太棒了', '稳了', '祝顺利', '恭喜', '一路顺风', '新年快乐', '生日快乐', '开工大吉', '晚点回', '正在看', '再联系', '拜托了'];
watch([emojiSearch, emojiCategory], () => { emojiLimit.value = 120; });
async function loadEmojiLibrary() {
  if (emojiLibrary.value.length || emojiLibraryLoading.value) return;
  emojiLibraryLoading.value = true;
  emojiLibraryError.value = false;
  try {
    const response = await fetch(emojiLibraryUrl);
    if (!response.ok) throw new Error('表情库读取失败');
    const library: { groups: EmojiGroup[] } = await response.json();
    emojiLibrary.value = library.groups;
  } catch { emojiLibraryError.value = true; }
  finally { emojiLibraryLoading.value = false; }
}
let emojiInserted = false;
watch(emojiOpen, value => { if (value) { emojiInserted = false; void loadEmojiLibrary(); } });
function onEmojiCloseAutoFocus(event: Event) {
  if (emojiInserted) event.preventDefault();
  emojiInserted = false;
}
const composer = ref<{ focus: () => void; selectRange: (start: number, end: number) => void }>();
let selection = { start: 0, end: 0 };
function rememberSelection(event: Event) {
  if (event.target instanceof HTMLTextAreaElement) selection = { start: event.target.selectionStart, end: event.target.selectionEnd };
}
async function insertEmoji(emoji: string) {
  if (inputDisabled.value) return;
  const start = Math.min(selection.start, text.value.length);
  const end = Math.min(selection.end, text.value.length);
  text.value = text.value.slice(0, start) + emoji + text.value.slice(end);
  selection = { start: start + emoji.length, end: start + emoji.length };
  emojiInserted = true;
  emojiOpen.value = false;
  await nextTick(); composer.value?.focus(); composer.value?.selectRange(selection.start, selection.end);
}
async function sendSticker(label: string) {
  if (props.disabled || props.submitting || mediaBusy.value) return;
  const operation = ++uploadVersion;
  uploading.value = true; emojiOpen.value = false;
  try {
    const image = new window.Image();
    image.src = brandCat;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 148;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器暂不支持表情图片');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 12, 4, 104, 104);
    context.fillStyle = '#20352b'; context.font = 'bold 17px sans-serif'; context.textAlign = 'center'; context.fillText(label, 64, 134, 112);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('表情图片生成失败')), 'image/webp', 0.75));
    if (operation !== uploadVersion || props.disabled) return;
    const extension = blob.type === 'image/webp' ? 'webp' : 'png';
    const uploaded = await uploadImFile(new File([blob], `umaomao-sticker.${extension}`, { type: blob.type }), 'IM_IMAGE');
    if (operation === uploadVersion && !props.disabled) emit('send', { type: 'image', mediaFileId: uploaded.id });
  } catch (error) { if (operation === uploadVersion) Message.error(error instanceof Error ? error.message : '表情发送失败'); }
  finally { if (operation === uploadVersion) uploading.value = false; }
}
const isPhone = useMediaQuery('(max-width:700px)');
const inputDisabled = computed(() => props.disabled || (props.submitting && !isPhone.value));
const sending = ref(false);
const uploading = ref(false);
const preparingVideo = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const videoInputRef = ref<HTMLInputElement>();
const recording = ref(false);
const startingRecording = ref(false);
const mediaBusy = computed(() => uploading.value || preparingVideo.value || recording.value || startingRecording.value);
watch(mediaBusy, value => emit('media-busy', value), { flush: 'sync' });
const recordingSeconds = ref(0);
let mediaRecorder: MediaRecorder | undefined;
let recordingStartedAt = 0;
let recordingTimer: ReturnType<typeof setInterval> | undefined;
let uploadVersion = 0;
let videoConfirmation: ReturnType<typeof Modal.confirm> | undefined;
let cancelVideoRead: (() => void) | undefined;

const canRecord = computed(() => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);

function clearRecordingTimer() {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = undefined;
}

function chooseVideo() {
  if (props.disabled || props.submitting || mediaBusy.value) return;
  videoInputRef.value?.click();
}

async function readVideo(file: File) {
  return new Promise<{ duration: number; cover?: Blob }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.onloadedmetadata = video.onseeked = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (cancelVideoRead === cancel) cancelVideoRead = undefined;
    };
    const finish = (result?: { duration: number; cover?: Blob }) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result) resolve(result);
      else reject(new Error('无法读取视频信息，请检查文件格式后重试'));
    };
    const timer = setTimeout(() => finish(), 15000);
    const cancel = () => finish();
    cancelVideoRead = cancel;
    video.onerror = () => finish();
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
        finish({ duration });
        return;
      }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 640 / Math.max(video.videoWidth, 1));
          canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
          canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
          canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(cover => finish({ duration, cover: cover || undefined }), 'image/jpeg', 0.82);
        } catch { finish({ duration }); }
      };
      video.currentTime = Math.min(0.1, video.duration / 10);
    };
    video.src = url;
  });
}

async function onVideoSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.disabled || props.submitting || mediaBusy.value) return;
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) return void Message.warning('请选择 MP4、WebM 或 MOV 视频');
  if (file.size > 50 * 1024 * 1024) return void Message.warning('视频不能超过 50MB');
  const contextOperation = ++uploadVersion;
  preparingVideo.value = true;
  let metadata: { duration: number; cover?: Blob };
  try { metadata = await readVideo(file); } catch (error) {
    if (contextOperation === uploadVersion) Message.error(error instanceof Error ? error.message : '视频读取失败');
    return;
  } finally {
    if (contextOperation === uploadVersion) preparingVideo.value = false;
  }
  if (contextOperation !== uploadVersion || props.disabled || props.submitting) return;
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > 60) return void Message.warning('视频时长须在 60 秒以内');
  videoConfirmation = Modal.confirm({
    title: '发送视频？',
    content: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB · ${metadata.duration}秒`,
    async onOk() {
      if (contextOperation !== uploadVersion || props.disabled || props.submitting || mediaBusy.value) return;
      const operation = ++uploadVersion;
      uploading.value = true;
      try {
        const videoFile = await uploadImFile(file, 'IM_VIDEO', metadata.duration);
        let coverFileId: string | number | undefined;
        let coverUrl: string | undefined;
        if (operation !== uploadVersion || props.disabled) return;
        if (metadata.cover) {
          try {
            const cover = await uploadImFile(new File([metadata.cover], `video-cover-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'IM_IMAGE');
            coverFileId = cover.id;
            coverUrl = cover.url;
          } catch { /* 封面失败不阻断视频发送。 */ }
        }
        if (operation === uploadVersion && !props.disabled) emit('send', { type: 'video', mediaFileId: videoFile.id, coverFileId, coverUrl, duration: metadata.duration });
      } catch (error) {
        if (operation === uploadVersion) Message.error(error instanceof Error ? error.message : '视频上传失败');
      } finally {
        if (operation === uploadVersion) uploading.value = false;
      }
    },
    onClose() { videoConfirmation = undefined; }
  });
}

async function send() {
  const content = text.value.trim();
  if (!content) return;
  if (props.submitting || sending.value || mediaBusy.value) return;
  if (props.disabled) {
    Message.warning(props.disabledText);
    return;
  }
  sending.value = true;
  try {
    emit('send', { type: 'text', content });
    text.value = '';
  } finally {
    sending.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (shouldSendOnEnter(e)) {
    e.preventDefault();
    send();
  }
}

function keepPhoneInputFocus(event: PointerEvent) {
  const active = document.activeElement;
  if (isPhone.value && active instanceof HTMLTextAreaElement && event.currentTarget instanceof HTMLElement
    && event.currentTarget.closest('.message-input')?.contains(active)) event.preventDefault();
}

function chooseImage() {
  if (props.disabled || props.submitting || mediaBusy.value) return;
  fileInputRef.value?.click();
}

async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.disabled || props.submitting || mediaBusy.value) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'].includes(file.type)) {
    Message.warning('请选择 JPG、PNG、WebP、GIF、AVIF 或 BMP 图片');
    return;
  }

  const operation = ++uploadVersion;
  uploading.value = true;
  try {
    const uploaded = await uploadImFile(file, 'IM_IMAGE');
    if (operation === uploadVersion && !props.disabled) emit('send', { type: 'image', mediaFileId: uploaded.id });
  } catch (error) {
    if (operation !== uploadVersion) return;
    Message.error(error instanceof Error ? error.message : '图片上传失败');
  } finally {
    if (operation === uploadVersion) uploading.value = false;
  }
}

async function startRecording() {
  if (props.disabled || props.submitting || mediaBusy.value) return;
  if (!canRecord.value) {
    Message.warning('当前浏览器不支持语音录制，请使用最新版 Chrome');
    return;
  }
  const operation = ++uploadVersion;
  startingRecording.value = true;
  let recordingStream: MediaStream | undefined;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingStream = stream;
    if (operation !== uploadVersion || props.disabled || props.submitting) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const chunks: BlobPart[] = [];
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find(type => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
    catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
    mediaRecorder = recorder;
    recordingStartedAt = Date.now();
    recordingSeconds.value = 0;
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      if (operation !== uploadVersion) return;
      recording.value = false;
      clearRecordingTimer();
      const duration = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));
      if (!chunks.length) {
        mediaRecorder = undefined;
        Message.warning('未录到有效语音，请检查麦克风后重试');
        return;
      }
      uploading.value = true;
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const uploaded = await uploadImFile(new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type }), 'IM_VOICE', duration);
        if (operation === uploadVersion && !props.disabled) emit('send', { type: 'audio', mediaFileId: uploaded.id });
      } catch (error) {
        if (operation !== uploadVersion) return;
        Message.error(error instanceof Error ? error.message : '语音上传失败');
      } finally {
        if (operation === uploadVersion) {
          uploading.value = false;
          mediaRecorder = undefined;
        }
      }
    };
    recorder.onerror = () => {
      stream.getTracks().forEach(track => track.stop());
      if (operation !== uploadVersion) return;
      cancelMedia();
      Message.error('语音录制失败，请检查麦克风后重试');
    };
    recorder.start();
    recording.value = true;
    recordingTimer = setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - recordingStartedAt) / 1000);
    }, 1000);
  } catch {
    recordingStream?.getTracks().forEach(track => track.stop());
    if (operation === uploadVersion) {
      cancelMedia();
      Message.warning('无法使用麦克风，请检查浏览器权限后重试');
    }
  } finally {
    if (operation === uploadVersion) startingRecording.value = false;
  }
}

function cancelMedia() {
  emojiOpen.value = false;
  uploadVersion += 1;
  cancelVideoRead?.();
  videoConfirmation?.close();
  videoConfirmation = undefined;
  preparingVideo.value = false;
  uploading.value = false;
  recording.value = false;
  startingRecording.value = false;
  clearRecordingTimer();
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  mediaRecorder = undefined;
}
watch(() => props.contextKey, () => { text.value = ''; cancelMedia(); }, { flush: 'sync' });
watch(() => props.disabled, value => { if (value) cancelMedia(); }, { flush: 'sync' });

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

onBeforeUnmount(() => {
  cancelMedia();
  emit('media-busy', false);
});


</script>

<template>

  <div class="message-input">
    <div class="chat-compose">
      <Textarea ref="composer" v-model="text" @select="rememberSelection" @click="rememberSelection" @keyup="rememberSelection" :placeholder="disabled ? disabledText : placeholder" :disabled="inputDisabled" rows="2" class="textarea" aria-label="聊天消息" :aria-describedby="hintId" @keydown="onKeydown" />
      <div class="compose-toolbar">
        <div class="chat-quick media-toolbar">
      <PopoverRoot v-model:open="emojiOpen">
        <PopoverTrigger as-child><button type="button" aria-label="选择聊天表情" title="选择聊天表情" :disabled="inputDisabled || mediaBusy" class="compose-tool" :class="{ 'is-active': emojiOpen }"><Icon icon="lucide:smile" aria-hidden="true" /></button></PopoverTrigger>
        <PopoverPortal>
          <PopoverContent class="im-emoji-panel" side="top" align="start" :side-offset="8" :collision-padding="12" aria-label="聊天表情" @close-auto-focus="onEmojiCloseAutoFocus">
            <header class="emoji-panel-header"><h3>聊天表情</h3><PopoverClose as-child><button type="button" class="emoji-panel-close" aria-label="关闭聊天表情"><Icon icon="lucide:x" aria-hidden="true" /></button></PopoverClose></header>
            <input v-model="emojiSearch" class="emoji-search" type="search" aria-label="搜索表情" placeholder="搜索表情，如笑哭、点赞、猫" />
            <nav class="emoji-categories" aria-label="表情分类"><button v-for="group in emojiGroups" :key="group.label" type="button" :aria-pressed="!emojiSearch.trim() && emojiCategory === group.label" @click="emojiCategory = group.label; emojiSearch = ''">{{ group.label }}</button></nav>
            <p v-if="emojiLibraryLoading" class="emoji-library-status" role="status">正在读取表情…</p>
            <p v-if="emojiLibraryError" class="emoji-library-status" role="alert">表情库读取失败<button type="button" class="text-link" @click="loadEmojiLibrary">重试</button></p>
            <div :key="emojiCategory + ':' + emojiSearch" class="emoji-results">
              <div class="emoji-grid" role="group" :aria-label="emojiSearch.trim() ? '表情搜索结果' : emojiCategory + '表情'"><button v-for="item in visibleEmoji" :key="item.emoji" type="button" :aria-label="'插入表情：' + item.label" :title="item.label" :disabled="inputDisabled" @click="insertEmoji(item.emoji)">{{ item.emoji }}</button></div>
              <button v-if="filteredEmoji.length > emojiLimit" type="button" class="emoji-more" @click="emojiLimit += 120">显示更多（还有 {{ filteredEmoji.length - emojiLimit }} 个）</button>
              <p v-if="!visibleEmoji.length && !emojiLibraryLoading && !emojiLibraryError" class="emoji-library-status">没有找到相关表情，换个词试试</p>
            </div>
            <p v-if="emojiTotal" class="emoji-library-count">{{ emojiSearch.trim() ? '找到 ' + filteredEmoji.length : '共 ' + emojiTotal }} 个表情</p>
            <h3 class="brand-stickers-title">Umaomao 表情</h3><div class="brand-stickers" role="group" aria-label="Umaomao 图片表情"><button v-for="label in brandStickerLabels" :key="label" type="button" :aria-label="'发送贴纸：' + label" :title="label" :disabled="disabled || submitting || mediaBusy" @click="sendSticker(label)"><img :src="brandCat" alt="" /><span>{{ label }}</span></button></div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
      <input ref="fileInputRef" class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.bmp" @change="onImageSelected" />
      <input ref="videoInputRef" class="file-input" type="file" accept="video/mp4,video/webm,video/quicktime" @change="onVideoSelected" />
      <Tooltip><TooltipTrigger as-child><button type="button" aria-label="上传聊天图片" :disabled="disabled || submitting || mediaBusy" @click="chooseImage" class="compose-tool"><Icon icon="lucide:image-plus" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>上传图片</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger as-child><button type="button" aria-label="上传聊天视频" :disabled="disabled || submitting || mediaBusy" @click="chooseVideo" class="compose-tool"><Icon icon="lucide:video" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>上传视频</TooltipContent></Tooltip>
      <Tooltip>
        <TooltipTrigger as-child><span class="voice-trigger" tabindex="0">
          <button type="button" :class="{ 'is-recording': recording }" :aria-label="recording ? '结束录音并发送' : '录制语音'" :disabled="disabled || submitting || uploading || preparingVideo || startingRecording || !canRecord" @click="recording ? stopRecording() : startRecording()" class="compose-tool">
            <Icon :icon="recording ? 'lucide:square' : 'lucide:mic'" aria-hidden="true" />
          </button>
        </span></TooltipTrigger>
        <TooltipContent>{{ disabled ? disabledText : submitting ? '上一条消息正在发送，请稍候' : uploading || preparingVideo ? '媒体正在处理，请稍候' : !canRecord ? '当前浏览器不支持语音录制，请使用支持麦克风录音的浏览器' : startingRecording ? '正在等待麦克风权限' : recording ? '结束录音后发送语音' : '需要允许浏览器使用麦克风' }}</TooltipContent>
      </Tooltip>
      <span v-if="uploading || preparingVideo" class="media-state" role="status"><Icon icon="lucide:loader-circle" width="15" class="animate-spin" />{{ preparingVideo ? '正在读取视频…' : '媒体上传中…' }}</span>
      <span v-else-if="recording" class="media-state recording-state" role="status"><span class="recording-dot" />正在录音 {{ recordingSeconds }}s</span>
      <span v-else-if="startingRecording" class="media-state" role="status">正在开启麦克风…</span>
        </div>
        <button type="button" :disabled="disabled || submitting || mediaBusy || !text.trim()" @pointerdown="keepPhoneInputFocus" @click="send" class="primary compose-submit">{{ sending || submitting ? '发送中' : '发送' }}<Icon v-if="sending || submitting" icon="lucide:loader-circle" class="animate-spin" width="16" /><UmIcon v-else name="arrow" /></button>
      </div>
    </div>
    <p :id="hintId" class="message-input-hint"><span>Enter 发送，Shift+Enter 换行</span><span :aria-label="`已输入 ${text.length} 字`">{{ text.length }} 字</span></p>
  </div>
</template>

<style scoped>
:global(.im-emoji-panel) { z-index:1100; width:320px; max-width:calc(100vw - 24px); max-height:var(--reka-popover-content-available-height); overflow-y:auto; overscroll-behavior:contain; padding:12px; border:1px solid var(--line); border-radius:12px; background:var(--paper); color:var(--ink); box-shadow:0 8px 28px #0003; }
.emoji-panel-header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.emoji-panel-header h3,.brand-stickers-title { margin:0; font-size:13px; font-weight:600; line-height:1.5; }
.emoji-panel-close { display:grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--muted); }
.emoji-panel-close svg { width:18px; height:18px; }
.emoji-search { width:100%; min-width:0; height:34px; margin-bottom:8px; padding:6px 10px; border:1px solid var(--line); border-radius:7px; background:var(--paper); color:var(--ink); font-size:12px; }
.emoji-search:focus-visible { outline:2px solid var(--green); outline-offset:1px; }
.emoji-categories { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:3px; margin-bottom:8px; padding:3px; border-radius:8px; background:var(--soft); }
.emoji-categories button { min-width:0; min-height:30px; padding:4px 2px; border-radius:6px; background:transparent; color:var(--muted); font-size:12px; }
.emoji-categories button[aria-pressed="true"] { background:var(--paper); color:var(--green); font-weight:600; box-shadow:0 1px 3px #00000012; }
.emoji-results { max-height:188px; overflow-y:auto; overscroll-behavior:contain; margin-bottom:8px; }
.emoji-library-status { display:flex; align-items:center; gap:6px; margin:0; padding:8px 0; color:var(--muted); font-size:12px; }
.emoji-library-count { margin:0 0 10px; color:var(--muted); font-size:10px; }
.emoji-more { width:100%; min-height:32px; border-radius:6px; background:var(--soft); color:var(--green); font-size:12px; }
.emoji-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; }.emoji-grid button { min-width:0; min-height:44px; padding:0; font-size:25px; border-radius:6px; background:transparent; }.emoji-grid button:hover,.emoji-panel-close:hover { background:var(--soft); }.brand-stickers { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); grid-auto-rows:56px; gap:4px; max-height:176px; overflow-y:auto; overscroll-behavior:contain; margin-top:8px; }
.brand-stickers button { display:grid; justify-items:center; align-content:center; gap:3px; min-width:0; padding:4px 2px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); font-size:9px; line-height:12px; }
.brand-stickers button > span { min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.brand-stickers button:hover { background:var(--soft); }.brand-stickers img { width:28px; height:28px; max-width:100%; }
@media(max-width:360px) { .brand-stickers { grid-template-columns:repeat(5,minmax(0,1fr)); } }
:global(.im-emoji-panel button:focus-visible) { outline:2px solid var(--green); outline-offset:-2px; }
:global(.im-emoji-panel button:disabled) { opacity:.5; cursor:not-allowed; }
.message-input { display:flex; flex-direction:column; gap:6px; flex-shrink:0; min-width:0; margin-top:8px; border-top:1px solid var(--line); padding-top:10px; }
.media-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:4px; min-width:0; margin:0; }
.media-toolbar .compose-tool { display:grid; place-items:center; width:42px; height:42px; min-height:42px; max-width:100%; padding:0; border:0; border-radius:8px; background:transparent; color:var(--muted); }
.media-toolbar .compose-tool :deep(svg) { width:23px; height:23px; }
.media-toolbar .compose-tool:hover:not(:disabled) { background:var(--soft); color:var(--green); }
.media-toolbar .compose-tool.is-active { background:var(--soft); color:var(--green); }
.media-toolbar .compose-tool:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.compose-tool:disabled { opacity:.5; cursor:not-allowed; }
.file-input { display:none; }
.voice-trigger { display:inline-flex; min-width:0; max-width:100%; }
.chat-compose { display:flex; flex-direction:column; align-items:stretch; gap:0; min-width:0; border:1px solid var(--yb-control-border,var(--line)); border-radius:12px; background:var(--paper); }
.chat-compose:focus-within { border-color:var(--green); box-shadow:0 0 0 2px color-mix(in srgb,var(--green) 12%,transparent); }
.chat-compose .textarea { width:100%; min-width:0; height:76px; min-height:76px; max-height:160px; resize:vertical; padding:14px 16px 8px; border:0; border-radius:12px; background:transparent; box-shadow:none; font-size:14px; line-height:1.6; }
.chat-compose .textarea:focus-visible { outline:0; box-shadow:none; }
.compose-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 10px 10px; }
.chat-compose .compose-submit { display:flex; align-items:center; justify-content:center; flex-shrink:0; min-height:42px; padding:9px 16px; gap:8px; border-radius:8px; font-size:13px; line-height:1.6; }
.compose-submit :deep(svg) { width:18px; height:18px; }
.message-input-hint { display:flex; justify-content:space-between; gap:12px; margin:0; color:var(--muted); font-size:10px; line-height:1.5; }
.message-input-hint > span:last-child { flex-shrink:0; }
.media-state { display:inline-flex; align-items:center; gap:6px; min-width:0; margin:0 0 0 6px; color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
.media-toolbar .compose-tool.is-recording,.media-toolbar .compose-tool.is-recording:hover,.recording-state { color:var(--yb-danger); }.recording-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
@media(max-width:700px) {
  .message-input { margin-top:6px; padding-top:8px; }
  .media-toolbar { gap:2px; }
  .media-toolbar .compose-tool { width:44px; height:44px; min-height:44px; }
  .chat-compose .textarea { height:72px; min-height:72px; font-size:13px; padding:12px 12px 6px; }
  .compose-toolbar { padding:0 6px 6px; gap:6px; }
  .chat-compose .compose-submit { min-height:44px; padding:9px 12px; gap:6px; font-size:12px; }
  .message-input-hint { font-size:9px; }
}
</style>
