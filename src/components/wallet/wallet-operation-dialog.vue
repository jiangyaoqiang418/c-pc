<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from '@/components/common/v47-sheet-grip.vue';

const props = defineProps<{ visible: boolean; title: string; description: string; deposit?: boolean; busy?: boolean }>();
const emit = defineEmits<{ dismiss: [] }>();
function update(value: boolean) { if (!value && !props.busy) emit('dismiss'); }
function preventBusy(event: Event) { if (props.busy) event.preventDefault(); }
</script>

<template>
  <DialogRoot :open="visible" @update:open="update"><DialogPortal force-mount><Transition name="modal"><DialogOverlay v-if="visible" force-mount class="modal-overlay v47-wallet-overlay"><DialogContent force-mount class="dialog wallet-operation-dialog" :class="{ 'deposit-dialog': deposit }" @escape-key-down="preventBusy" @interact-outside="preventBusy">
    <V47SheetGrip :disabled="busy" @dismiss="update(false)" />
    <button class="dialog-close icon-btn" aria-label="关闭钱包操作" :disabled="busy" @click="update(false)"><UmIcon name="close" /></button>
    <div class="deposit-heading"><DialogTitle as="h2">{{ title }}</DialogTitle><DialogDescription as="p">{{ description }}</DialogDescription></div>
    <slot />
  </DialogContent></DialogOverlay></Transition></DialogPortal></DialogRoot>
</template>

<style>
.v47-wallet-overlay { z-index:1000; }
</style>
