<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
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
      <button class="tool-btn" type="button" title="上传聊天图片" aria-label="上传聊天图片" :disabled="disabled || submitting || mediaBusy" @click="chooseImage">
        {{ uploading ? '图片上传中…' : '🖼 图片' }}
      </button>
      <button class="tool-btn" type="button" title="上传聊天视频" :disabled="disabled || submitting || mediaBusy" @click="chooseVideo">🎬 视频</button>
      <button
        class="tool-btn voice-btn"
        type="button"
        :title="recording ? '结束录音' : '录制语音'"
        :aria-label="recording ? '结束录音' : '录制语音'"
        :disabled="disabled || submitting || uploading || startingRecording || !canRecord"
        @click="recording ? stopRecording() : startRecording()"
      >
        {{ recording ? `■ 结束录音 ${recordingSeconds}s` : uploading ? '语音上传中…' : '🎙 语音' }}
      </button>
    </div>
    <a-textarea
      v-model="text"
      :placeholder="disabled ? disabledText : placeholder"
      :auto-size="{ minRows: 2, maxRows: 5 }"
      :disabled="disabled || submitting"
      class="textarea"
      @keydown="onKeydown"
    />
    <div class="footer">
      <span class="hint">Enter 发送 · Shift+Enter 换行</span>
      <a-button type="primary" :disabled="disabled || submitting || mediaBusy || !text.trim()" :loading="sending || submitting" @click="send">发送</a-button>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  padding: 12px 16px;
  border-top: 1px solid #f2f3f5;
  background: #fff;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.file-input {
  display: none;
}
.tool-btn {
  background: transparent;
  border: none;
  color: #4e5969;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}
.tool-btn:hover:not(:disabled) {
  background: #f7f8fa;
  color: var(--bw-brand-primary);
}
.tool-btn:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
}
.tool-btn:disabled {
  color: #c9cdd4;
  cursor: not-allowed;
}
.voice-btn:not(:disabled) { color: #00b42a; }
.textarea {
  margin-bottom: 8px;
}
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hint {
  font-size: 11px;
  color: #86909c;
}
</style>
