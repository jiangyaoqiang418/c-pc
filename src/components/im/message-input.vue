<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { uploadFile } from '@/service/api/product';

interface Props {
  disabled?: boolean;
  disabledText?: string;
  placeholder?: string;
  submitting?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  disabledText: '当前会话已禁用发送',
  placeholder: '输入消息，Enter 发送 / Shift+Enter 换行'
});

type OutgoingMessage = {
  type: 'text' | 'image' | 'audio';
  content?: string;
  mediaUrl?: string;
  duration?: number;
};

const emit = defineEmits<{ (e: 'send', payload: OutgoingMessage): void }>();

const text = ref('');
const sending = ref(false);
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const recording = ref(false);
const recordingSeconds = ref(0);
let mediaRecorder: MediaRecorder | undefined;
let recordingStartedAt = 0;
let recordingTimer: ReturnType<typeof setInterval> | undefined;

const canRecord = computed(() => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);

function clearRecordingTimer() {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = undefined;
}

async function send() {
  const content = text.value.trim();
  if (!content) return;
  if (props.submitting || sending.value) return;
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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function chooseImage() {
  if (props.disabled || props.submitting || uploading.value) return;
  fileInputRef.value?.click();
}

async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    Message.warning('请选择图片文件');
    return;
  }

  uploading.value = true;
  try {
    const uploaded = await uploadFile(file, 'im');
    if (!uploaded.url) throw new Error('上传结果缺少图片地址');
    emit('send', { type: 'image', mediaUrl: uploaded.url });
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '图片上传失败');
  } finally {
    uploading.value = false;
  }
}

async function startRecording() {
  if (props.disabled || props.submitting || uploading.value || recording.value) return;
  if (!canRecord.value) {
    Message.warning('当前浏览器不支持语音录制，请使用最新版 Chrome');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: BlobPart[] = [];
    mediaRecorder = new MediaRecorder(stream);
    recordingStartedAt = Date.now();
    recordingSeconds.value = 0;
    mediaRecorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      recording.value = false;
      clearRecordingTimer();
      const duration = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));
      if (!chunks.length) return;
      uploading.value = true;
      try {
        const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        const uploaded = await uploadFile(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), 'im');
        if (!uploaded.url) throw new Error('上传结果缺少语音地址');
        emit('send', { type: 'audio', mediaUrl: uploaded.url, duration });
      } catch (error) {
        Message.error(error instanceof Error ? error.message : '语音上传失败');
      } finally {
        uploading.value = false;
        mediaRecorder = undefined;
      }
    };
    mediaRecorder.start();
    recording.value = true;
    recordingTimer = setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - recordingStartedAt) / 1000);
    }, 1000);
  } catch {
    Message.warning('无法使用麦克风，请检查浏览器权限后重试');
  }
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

onBeforeUnmount(() => {
  clearRecordingTimer();
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
});
</script>

<template>
  <div class="input-area">
    <div class="toolbar">
      <input ref="fileInputRef" class="file-input" type="file" accept="image/*" @change="onImageSelected" />
      <button class="tool-btn" :disabled="disabled || submitting || uploading" @click="chooseImage">
        {{ uploading ? '图片上传中…' : '🖼 图片' }}
      </button>
      <button class="tool-btn voice-btn" :disabled="disabled || submitting || uploading || !canRecord" @click="recording ? stopRecording() : startRecording()">
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
      <a-button type="primary" :disabled="disabled || submitting || !text.trim()" :loading="sending || submitting" @click="send">发送</a-button>
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
