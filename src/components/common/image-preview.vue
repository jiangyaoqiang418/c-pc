<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BusinessDialog from './business-dialog.vue';
import { Button } from '@/components/ui/button';
import { setImageFallback } from '@/utils/image-placeholder';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  images: string[];
  startIndex?: number;
  title?: string;
}>(), { startIndex: 0, title: '图片预览' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'update:current': [value: number] }>();
const current = ref(0);
watch([() => props.modelValue, () => props.startIndex, () => props.images], () => {
  if (props.modelValue) current.value = Math.max(0, Math.min(props.images.length - 1, props.startIndex));
}, { immediate: true });
function move(direction: number) {
  if (props.images.length) {
    current.value = (current.value + direction + props.images.length) % props.images.length;
    emit('update:current', current.value);
  }
}
</script>

<template>
  <BusinessDialog :visible="modelValue" :title="title" :width="920" :footer="false" @update:visible="emit('update:modelValue', $event)">
    <div class="image-preview" @keydown.left.prevent="move(-1)" @keydown.right.prevent="move(1)">
      <Button v-if="images.length > 1" variant="outline" size="icon" class="preview-prev" aria-label="上一张图片" @click="move(-1)"><Icon icon="lucide:chevron-left" width="20" /></Button>
      <img v-if="images[current]" :key="images[current]" :src="images[current]" :alt="`${title} ${current + 1}`" @error="setImageFallback" />
      <Button v-if="images.length > 1" variant="outline" size="icon" class="preview-next" aria-label="下一张图片" @click="move(1)"><Icon icon="lucide:chevron-right" width="20" /></Button>
      <span v-if="images.length" class="preview-count" aria-live="polite">{{ current + 1 }} / {{ images.length }}</span>
    </div>
  </BusinessDialog>
</template>

<style scoped>
.image-preview { position: relative; display: grid; place-items: center; min-height: 200px; background: var(--yb-fill); border-radius: 8px; padding: 16px 52px 40px; }
.image-preview img { max-width: 100%; max-height: calc(100dvh - 220px); object-fit: contain; }
.preview-prev, .preview-next { position: absolute; top: 50%; transform: translateY(-50%); }
.preview-prev { left: 8px; }.preview-next { right: 8px; }
.preview-count { position: absolute; bottom: 12px; color: var(--yb-muted); font-size: 13px; }
</style>
