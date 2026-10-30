<script setup lang="ts">
import { computed } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from '@/components/common/v47-sheet-grip.vue';
import { setImageFallback } from '@/utils/image-placeholder';

const props = withDefaults(defineProps<{ modelValue: boolean; images: string[]; startIndex?: number; title?: string; review?: boolean }>(), { startIndex: 0, title: '商品图片' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const source = computed(() => props.images[Math.max(0, Math.min(props.images.length - 1, props.startIndex))]);
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal force-mount>
      <Transition name="modal" :css="review">
        <DialogOverlay v-if="modelValue" force-mount :class="review ? 'modal-overlay v47-reference-mask' : 'zoom-overlay'">
          <DialogContent force-mount :class="review ? 'um-dialog dialog review-photo-dialog v47-reference-dialog' : 'zoom-content'" @click="!review && emit('update:modelValue', false)">
            <V47SheetGrip v-if="review" :open="modelValue" @dismiss="emit('update:modelValue', false)" />
            <header :class="{ 'um-dialog-header': review }">
              <DialogTitle as="h2" :class="review ? 'um-dialog-title' : 'sr-only'">{{ title }}</DialogTitle>
              <DialogClose :class="review ? 'icon-btn dialog-close' : 'icon-btn zoom-close'" aria-label="关闭大图" @click.stop><UmIcon name="close" /></DialogClose>
            </header>
            <DialogDescription class="sr-only">{{ review ? '点击关闭按钮或按 Escape 关闭评价配图。' : '点击图片、关闭按钮或按 Escape 关闭大图。' }}</DialogDescription>
            <div :class="review ? 'um-dialog-body' : 'zoom-image-wrap'">
            <img v-if="source" :class="{ 'review-photo-full':review }" :src="source" :alt="title" @error="setImageFallback" />
            <p v-if="review" class="demo-note">顾客上传的评价配图</p>
            </div>
          </DialogContent>
        </DialogOverlay>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped src="./v47-detail-dialog-adapter.css"></style>
<style scoped>
.zoom-overlay { z-index:105; }
.zoom-content { position:fixed; inset:0; z-index:106; display:flex; align-items:center; justify-content:center; padding:24px; outline:none; }
.zoom-image-wrap { display:contents; }
.zoom-image-wrap > img { max-width:90vw; max-height:88dvh; object-fit:contain; border-radius:6px; }
.zoom-close { position:absolute; top:25px; right:25px; color:white; background:#ffffff20; }
@media (max-width:700px) { .zoom-content { padding:16px; } .zoom-image-wrap { display:contents; }
.zoom-image-wrap > img { max-width:100%; max-height:85dvh; } .zoom-close { top:15px; right:15px; } }
</style>
