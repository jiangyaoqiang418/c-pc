<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
const sending = ref(false);
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const videoInputRef = ref<HTMLInputElement>();
const recording = ref(false);
const startingRecording = ref(false);
const mediaBusy = computed(() => uploading.value || recording.value || startingRecording.value);
watch(mediaBusy, value => emit('media-busy', value), { flush: 'sync' });
const recordingSeconds = ref(0);
let mediaRecorder: MediaRecorder | undefined;
let recordingStartedAt = 0;
let recordingTimer: ReturnType<typeof setInterval> | undefined;
let uploadVersion = 0;

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
    const cleanup = () => URL.revokeObjectURL(url);
    video.onerror = () => { cleanup(); reject(new Error('无法读取视频信息')); };
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration);
      video.currentTime = Math.min(0.1, Math.max(0, video.duration / 10));
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 640 / Math.max(video.videoWidth, 1));
          canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
          canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
          canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(cover => { cleanup(); resolve({ duration, cover: cover || undefined }); }, 'image/jpeg', 0.82);
        } catch { cleanup(); resolve({ duration }); }
      };
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
  let metadata: { duration: number; cover?: Blob };
  try { metadata = await readVideo(file); } catch (error) { return void Message.error(error instanceof Error ? error.message : '视频读取失败'); }
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > 60) return void Message.warning('视频时长须在 60 秒以内');
  Modal.confirm({
    title: '发送视频？',
    content: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB · ${metadata.duration}秒`,
    async onOk() {
      const operation = ++uploadVersion;
      uploading.value = true;
      try {
        const videoFile = await uploadImFile(file, 'IM_VIDEO', metadata.duration);
        let coverFileId: string | number | undefined;
        let coverUrl: string | undefined;
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
    }
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

function chooseImage() {
  if (props.disabled || props.submitting || mediaBusy.value) return;
  fileInputRef.value?.click();
}

async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.disabled || props.submitting || mediaBusy.value) return;
  if (!file.type.startsWith('image/')) {
    Message.warning('请选择图片文件');
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
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (operation !== uploadVersion) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
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
      if (!chunks.length) return;
      uploading.value = true;
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const uploaded = await uploadImFile(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), 'IM_VOICE', duration);
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
    recorder.start();
    recording.value = true;
    recordingTimer = setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - recordingStartedAt) / 1000);
    }, 1000);
  } catch {
    if (operation === uploadVersion) Message.warning('无法使用麦克风，请检查浏览器权限后重试');
  } finally {
    if (operation === uploadVersion) startingRecording.value = false;
  }
}

watch(() => props.contextKey, () => {
  uploadVersion += 1;
  text.value = '';
  uploading.value = false;
  recording.value = false;
  startingRecording.value = false;
  clearRecordingTimer();
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
});

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

onBeforeUnmount(() => {
  uploadVersion += 1;
  emit('media-busy', false);
  clearRecordingTimer();
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
});


</script>

<template>

  <div class="input-area">
    <div class="toolbar">
      <input ref="fileInputRef" class="file-input" type="file" accept="image/*" @change="onImageSelected" />
      <input ref="videoInputRef" class="file-input" type="file" accept="video/mp4,video/webm,video/quicktime" @change="onVideoSelected" />
      <Button type="button" variant="ghost" size="sm" aria-label="上传聊天图片" :disabled="disabled || submitting || mediaBusy" @click="chooseImage"><Icon icon="lucide:image-plus" width="17" />图片</Button>
      <Button type="button" variant="ghost" size="sm" aria-label="上传聊天视频" :disabled="disabled || submitting || mediaBusy" @click="chooseVideo"><Icon icon="lucide:video" width="17" />视频</Button>
      <Tooltip>
        <TooltipTrigger as-child><span class="voice-trigger" tabindex="0">
          <Button type="button" variant="ghost" size="sm" :class="{ 'is-recording': recording }" :aria-label="recording ? '结束录音并发送' : '录制语音'" :disabled="disabled || submitting || uploading || startingRecording || !canRecord" @click="recording ? stopRecording() : startRecording()">
            <Icon :icon="recording ? 'lucide:square' : 'lucide:mic'" width="17" />{{ recording ? '结束录音 ' + recordingSeconds + 's' : startingRecording ? '正在开启麦克风' : '语音' }}
          </Button>
        </span></TooltipTrigger>
        <TooltipContent>{{ !canRecord ? '当前浏览器不支持语音录制，请使用支持麦克风录音的浏览器' : recording ? '结束录音后发送语音' : '需要允许浏览器使用麦克风' }}</TooltipContent>
      </Tooltip>
      <span v-if="uploading" class="media-state" role="status"><Icon icon="lucide:loader-circle" width="15" class="animate-spin" />媒体上传中…</span>
      <span v-else-if="recording" class="media-state recording-state" role="status"><span class="recording-dot" />正在录音</span>
    </div>
    <Textarea v-model="text" :placeholder="disabled ? disabledText : placeholder" :disabled="disabled || submitting" rows="3" class="textarea" aria-label="聊天消息" @keydown="onKeydown" />
    <div class="footer">
      <span class="hint">Enter 发送 · Shift+Enter 换行</span>
      <Button type="button" size="sm" :disabled="disabled || submitting || mediaBusy || !text.trim()" @click="send"><Icon :icon="sending || submitting ? 'lucide:loader-circle' : 'lucide:send'" :class="{ 'animate-spin': sending || submitting }" width="16" />{{ sending || submitting ? '发送中' : '发送' }}</Button>
    </div>
  </div>
</template>

<style scoped>

.input-area { flex-shrink: 0; padding: 14px 22px 16px; border-top: 1px solid var(--yb-hairline); background: var(--yb-surface); }
.toolbar { display: flex; align-items: center; gap: 4px; margin-bottom: 10px; min-height: 32px; flex-wrap: wrap; }
.file-input { display: none; }.voice-trigger { display: inline-flex; border-radius: 6px; }.voice-trigger:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: 2px; }
.textarea { min-height: 78px; max-height: 150px; resize: vertical; background: var(--yb-bg); }
.footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 10px; }
.hint, .media-state { color: var(--yb-muted); font-size: 12px; }.media-state { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.is-recording, .recording-state { color: var(--yb-danger); }.recording-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

</style>
