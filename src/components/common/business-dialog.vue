<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { Button } from '@/components/ui/button';
import { Message } from '@/lib/feedback';
import UmIcon from '@/components/common/um-icon.vue';

const props = withDefaults(defineProps<{
  visible?: boolean;
  title?: string;
  width?: string | number;
  footer?: boolean;
  closable?: boolean;
  maskClosable?: boolean;
  escToClose?: boolean;
  okLoading?: boolean;
  okText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  okButtonProps?: { disabled?: boolean; status?: string };
  onBeforeOk?: () => boolean | void | Promise<boolean | void>;
  onBeforeCancel?: () => boolean | void | Promise<boolean | void>;
}>(), {
  visible: false, width: 520, footer: true, closable: true, maskClosable: true,
  escToClose: true, okText: '确定', cancelText: '取消', title: '提示'
});
const emit = defineEmits<{
  'update:visible': [value: boolean];
  ok: [];
  cancel: [];
  close: [];
}>();
const pending = ref(false);
const busy = computed(() => pending.value || props.okLoading);
const dialogWidth = computed(() => typeof props.width === 'number' || /^\d+$/.test(props.width)
  ? `${props.width}px` : props.width);

async function cancel() {
  if (busy.value) return;
  pending.value = true;
  try {
    if (await props.onBeforeCancel?.() === false) return;
    emit('cancel');
    emit('update:visible', false);
    emit('close');
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '操作未完成，请稍后重试');
  } finally { pending.value = false; }
}

async function confirm() {
  if (busy.value || props.okButtonProps?.disabled) return;
  pending.value = true;
  try {
    if (await props.onBeforeOk?.() === false) return;
    emit('ok');
    emit('update:visible', false);
    emit('close');
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '操作未完成，请核对后重试');
  } finally { pending.value = false; }
}
</script>

<template>
  <DialogRoot :open="visible" @update:open="value => { if (!value) void cancel(); }">
    <DialogPortal>
      <DialogOverlay class="um-dialog-mask modal-overlay" />
      <DialogContent class="um-dialog dialog" :style="{ width: dialogWidth }"
        @escape-key-down="event => { if (!escToClose || busy) event.preventDefault(); }"
        @pointer-down-outside="event => { if (!maskClosable || busy) event.preventDefault(); }">
        <header class="um-dialog-header">
          <DialogTitle class="um-dialog-title">{{ title }}</DialogTitle>
          <button v-if="closable" type="button" class="um-dialog-close" :disabled="busy" aria-label="关闭弹窗" @click="cancel"><UmIcon name="close" /></button>
        </header>
        <DialogDescription class="sr-only">请核对弹窗内容后继续操作。</DialogDescription>
        <div class="um-dialog-body"><slot /></div>
        <footer v-if="footer" class="um-dialog-footer">
          <slot name="footer">
            <Button v-if="!hideCancel" class="outline" variant="outline" :disabled="busy" @click="cancel">{{ cancelText }}</Button>
            <Button :class="{ primary: okButtonProps?.status !== 'danger' }" :variant="okButtonProps?.status === 'danger' ? 'destructive' : 'default'" :disabled="busy || okButtonProps?.disabled" @click="confirm">
              <Icon v-if="busy" icon="lucide:loader-circle" class="animate-spin" />{{ okText }}
            </Button>
          </slot>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.um-dialog-mask { position: fixed; inset: 0; z-index: 1000; }
.um-dialog { position: fixed; top: 50%; left: 50%; z-index: 1000; transform: translate(-50%, -50%); display: flex; flex-direction: column; padding: 0; margin: 0; max-width: calc(100vw - 32px); max-height: calc(100dvh - 48px); overflow: hidden; outline: none; }
.um-dialog-header { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; padding: 24px 24px 16px; gap: 16px; }
.um-dialog-title { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.4; }
.um-dialog-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; color: var(--muted-foreground); }
.um-dialog-close:hover { background: var(--soft); }
.um-dialog-close:disabled { opacity: .4; cursor: not-allowed; }
.um-dialog-body { min-height: 0; overflow-y: auto; padding: 0 24px 24px; line-height: 1.65; overflow-wrap: anywhere; }
.um-dialog-footer { display: flex; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; gap: 12px; padding: 16px 24px 24px; border-top: 1px solid var(--border); }
@media (prefers-reduced-motion: reduce) { .um-dialog-mask[data-state="open"], .um-dialog[data-state="open"] { animation: none; } }
</style>
