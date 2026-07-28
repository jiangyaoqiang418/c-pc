<script setup lang="ts">
import { ref } from 'vue';
import { Message } from '@arco-design/web-vue';

interface Props {
  side: 'front' | 'back' | 'face';
  modelValue?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const uploading = ref(false);

const sideLabel: Record<'front' | 'back' | 'face', string> = {
  front: '身份证人像面',
  back: '身份证国徽面',
  face: '人脸采集'
};

const placeholderUrl: Record<'front' | 'back' | 'face', string> = {
  front: 'https://placehold.co/360x220/F2F3F5/86909C?text=Front+ID',
  back: 'https://placehold.co/360x220/F2F3F5/86909C?text=Back+ID',
  face: 'https://placehold.co/220x220/F2F3F5/86909C?text=Face'
};

async function startUpload() {
  if (props.modelValue) return;
  uploading.value = true;
  try {
    await new Promise(r => setTimeout(r, 1100));
    const mockUrl = `https://picsum.photos/seed/kyc-${props.side}-${Date.now()}/360/220`;
    emit('update:modelValue', mockUrl);
    Message.success('上传成功（原型模拟）');
  } finally {
    uploading.value = false;
  }
}

function clear() {
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="id-uploader" :class="{ uploaded: !!modelValue, face: side === 'face' }">
    <div class="preview" @click="startUpload">
      <img v-if="modelValue" :src="modelValue" :alt="sideLabel[side]" class="img" />
      <img v-else :src="placeholderUrl[side]" :alt="sideLabel[side]" class="img placeholder" />
      <div v-if="uploading" class="overlay">识别中…</div>
      <div v-else-if="!modelValue" class="overlay click">点击上传 {{ sideLabel[side] }}</div>
    </div>
    <div class="meta">
      <span class="title">{{ sideLabel[side] }}</span>
      <a-link v-if="modelValue" status="danger" @click="clear">重新上传</a-link>
      <span v-else class="hint">原型模式，自动生成占位图</span>
    </div>
  </div>
</template>

<style scoped>
.id-uploader {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.id-uploader.face {
  width: 220px;
}
.id-uploader:not(.face) {
  width: 360px;
}
.preview {
  position: relative;
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px dashed #c9cdd4;
  transition: border-color 0.15s;
  background: #f7f8fa;
}
.id-uploader:not(.face) .preview {
  aspect-ratio: 360 / 220;
}
.id-uploader.face .preview {
  aspect-ratio: 1;
  border-radius: 50%;
}
.id-uploader.uploaded .preview {
  border-color: var(--bw-brand-primary);
  border-style: solid;
}
.preview:hover {
  border-color: var(--bw-brand-primary);
}
.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.img.placeholder {
  opacity: 0.5;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
}
.overlay.click {
  background: rgba(255, 255, 255, 0.85);
  color: #4e5969;
}
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 12px;
}
.title {
  color: #1d2129;
  font-weight: 500;
}
.hint {
  color: #86909c;
}
</style>
