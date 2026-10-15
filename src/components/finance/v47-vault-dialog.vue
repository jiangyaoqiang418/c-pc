<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from '@/components/common/v47-sheet-grip.vue';

const props = defineProps<{ visible: boolean; title: string; description: string; eyebrow?: string; icon?: string; busy?: boolean }>();
const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
function update(value: boolean) { if (!props.busy) emit('update:visible', value); }
function preventBusy(event: Event) { if (props.busy) event.preventDefault(); }
</script>

<template>
  <DialogRoot :open="visible" @update:open="update"><DialogPortal force-mount><Transition name="vault-sheet"><DialogOverlay v-if="visible" force-mount class="vault-modal-backdrop v47-vault-backdrop"><DialogContent force-mount class="vault-dialog" @escape-key-down="preventBusy" @interact-outside="preventBusy">
    <V47SheetGrip :disabled="busy" @dismiss="update(false)" />
    <button class="vault-dialog-close icon-btn" aria-label="关闭确认" :disabled="busy" @click="update(false)"><UmIcon name="close" /></button>
    <span class="vault-confirm-icon"><UmIcon :name="icon || 'shield'" /></span><span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
    <DialogTitle as="h2">{{ title }}</DialogTitle><DialogDescription as="p">{{ description }}</DialogDescription>
    <slot />
  </DialogContent></DialogOverlay></Transition></DialogPortal></DialogRoot>
</template>

<style>
.v47-vault-backdrop { z-index:1000; }
</style>
