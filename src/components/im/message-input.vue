<script setup lang="ts">
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
  placeholder: '输入消息，Enter 发送 / Shift+Enter 换行'
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
    <div class="chat-quick media-toolbar">
      <input ref="fileInputRef" class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.bmp" @change="onImageSelected" />
      <input ref="videoInputRef" class="file-input" type="file" accept="video/mp4,video/webm,video/quicktime" @change="onVideoSelected" />
      <button type="button" aria-label="上传聊天图片" :disabled="disabled || submitting || mediaBusy" @click="chooseImage" class="text-link"><Icon icon="lucide:image-plus" width="17" />图片</button>
      <button type="button" aria-label="上传聊天视频" :disabled="disabled || submitting || mediaBusy" @click="chooseVideo" class="text-link"><Icon icon="lucide:video" width="17" />视频</button>
      <Tooltip>
        <TooltipTrigger as-child><span class="voice-trigger" tabindex="0">
          <button type="button" :class="{ 'is-recording': recording }" :aria-label="recording ? '结束录音并发送' : '录制语音'" :disabled="disabled || submitting || uploading || preparingVideo || startingRecording || !canRecord" @click="recording ? stopRecording() : startRecording()" class="text-link">
            <Icon :icon="recording ? 'lucide:square' : 'lucide:mic'" width="17" />{{ recording ? '结束录音 ' + recordingSeconds + 's' : startingRecording ? '正在开启麦克风' : '语音' }}
          </button>
        </span></TooltipTrigger>
        <TooltipContent>{{ disabled ? disabledText : submitting ? '上一条消息正在发送，请稍候' : uploading || preparingVideo ? '媒体正在处理，请稍候' : !canRecord ? '当前浏览器不支持语音录制，请使用支持麦克风录音的浏览器' : startingRecording ? '正在等待麦克风权限' : recording ? '结束录音后发送语音' : '需要允许浏览器使用麦克风' }}</TooltipContent>
      </Tooltip>
      <span v-if="uploading || preparingVideo" class="media-state" role="status"><Icon icon="lucide:loader-circle" width="15" class="animate-spin" />{{ preparingVideo ? '正在读取视频…' : '媒体上传中…' }}</span>
      <span v-else-if="recording" class="media-state recording-state" role="status"><span class="recording-dot" />正在录音</span>
    </div>
    <div class="chat-compose"><Textarea v-model="text" :placeholder="disabled ? disabledText : placeholder" :disabled="inputDisabled" rows="2" class="textarea" aria-label="聊天消息" @keydown="onKeydown" />

      <button type="button" :disabled="disabled || submitting || mediaBusy || !text.trim()" @pointerdown="keepPhoneInputFocus" @click="send" class="primary"><Icon v-if="sending || submitting" icon="lucide:loader-circle" class="animate-spin" width="16" /><UmIcon v-else name="arrow" />{{ sending || submitting ? '发送中' : '发送' }}</button>
    </div><p class="message-input-hint">Enter 发送 · Shift+Enter 换行</p>
  </div>
</template>

<style scoped>
.message-input { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; gap:8px 12px; flex-shrink:0; margin-top:8px; border-top:1px solid var(--line); padding-top:10px; }
.media-toolbar { grid-column:1; grid-row:2; display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; margin:0; }
.media-toolbar button { min-height:32px; max-width:100%; padding:5px 8px; gap:6px; font-size:12px; line-height:1.4; }
.file-input { display:none; }
.voice-trigger { display:inline-flex; min-width:0; max-width:100%; }
.chat-compose { display:contents; }
.chat-compose .textarea { grid-column:1/-1; grid-row:1; width:100%; min-width:0; height:56px; min-height:56px; max-height:96px; resize:vertical; padding:8px 12px; border:1px solid var(--line); border-radius:6px; background:var(--paper); box-shadow:none; font-size:14px; line-height:1.5; }
.chat-compose>.primary { grid-column:2; grid-row:2; justify-self:end; min-height:34px; padding:7px 14px; gap:7px; font-size:12px; line-height:1.4; }
.message-input-hint { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.media-state { display:inline-flex; flex-basis:100%; align-items:center; gap:6px; min-width:0; margin:0; color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
.is-recording,.recording-state { color:var(--yb-danger); }.recording-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
@media(max-width:700px) {
  .message-input { gap:6px 8px; margin-top:6px; padding-top:8px; }
  .media-toolbar { gap:4px; }
  .media-toolbar button { min-height:30px; padding:5px 6px; gap:4px; font-size:11px; }
  .media-toolbar button :deep(svg) { width:15px; height:15px; }
  .chat-compose .textarea { height:48px; min-height:48px; font-size:13px; padding:8px 10px; }
  .chat-compose>.primary { min-height:32px; padding:6px 11px; gap:5px; }
}
</style>
