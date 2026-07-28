<script setup lang="ts">
import { ref } from 'vue';
import { Message } from '@arco-design/web-vue';

interface Props {
  disabled?: boolean;
  disabledText?: string;
  placeholder?: string;
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  disabledText: '当前会话已禁用发送',
  placeholder: '输入消息，Enter 发送 / Shift+Enter 换行'
});

const emit = defineEmits<{
  (e: 'send', payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }): void;
}>();

const text = ref('');
const sending = ref(false);

async function send() {
  const content = text.value.trim();
  if (!content) return;
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

function sendImage() {
  if (props.disabled) return;
  const url = `https://picsum.photos/seed/im-${Date.now()}/360/360`;
  emit('send', { type: 'image', mediaUrl: url });
}
</script>

<template>
  <div class="input-area">
    <div class="toolbar">
      <button class="tool-btn" :disabled="disabled" @click="sendImage">🖼 图片</button>
      <button class="tool-btn" disabled>📎 附件 · Phase 4</button>
      <button class="tool-btn" disabled>😀 表情 · Phase 4</button>
      <button class="tool-btn" disabled>💳 卡片 · Phase 4</button>
    </div>
    <a-textarea
      v-model="text"
      :placeholder="disabled ? disabledText : placeholder"
      :auto-size="{ minRows: 2, maxRows: 5 }"
      :disabled="disabled"
      class="textarea"
      @keydown="onKeydown"
    />
    <div class="footer">
      <span class="hint">Enter 发送 · Shift+Enter 换行</span>
      <a-button type="primary" :disabled="disabled || !text.trim()" :loading="sending" @click="send">发送</a-button>
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
