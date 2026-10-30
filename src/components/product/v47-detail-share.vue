<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from '@/components/common/v47-sheet-grip.vue';

defineProps<{ modelValue: boolean; url: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
function selectAddress(event: FocusEvent) { if (event.target instanceof HTMLInputElement) event.target.select(); }
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal force-mount>
      <Transition name="modal">
        <DialogOverlay v-if="modelValue" force-mount class="modal-overlay v47-reference-mask">
          <DialogContent force-mount class="um-dialog dialog v47-reference-dialog">
            <V47SheetGrip :open="modelValue" @dismiss="emit('update:modelValue', false)" />
            <header class="um-dialog-header"><DialogTitle as="h2" class="um-dialog-title">分享商品</DialogTitle><DialogClose class="icon-btn dialog-close" aria-label="关闭分享弹窗"><UmIcon name="close" /></DialogClose></header>
            <div class="um-dialog-body">
            <DialogDescription as="p">复制下方地址，分享这件商品。</DialogDescription>
            <input class="full" :value="url" readonly aria-label="商品页面地址" @focus="selectAddress" />
            <p class="demo-note">复制页面完整地址，即可分享当前商品。</p>
            </div>
          </DialogContent>
        </DialogOverlay>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped src="./v47-detail-dialog-adapter.css"></style>
