<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { Button } from '@/components/ui/button';
import { Message } from '@/lib/feedback';

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
      <DialogOverlay class="um-dialog-mask" />
      <DialogContent class="um-dialog" :style="{ width: dialogWidth }"
        @escape-key-down="event => { if (!escToClose || busy) event.preventDefault(); }"
        @pointer-down-outside="event => { if (!maskClosable || busy) event.preventDefault(); }">
        <header class="um-dialog-header">
          <DialogTitle class="um-dialog-title">{{ title }}</DialogTitle>
          <button v-if="closable" type="button" class="um-dialog-close" :disabled="busy" aria-label="关闭弹窗" @click="cancel"><Icon icon="lucide:x" /></button>
        </header>
        <DialogDescription class="sr-only">请核对弹窗内容后继续操作。</DialogDescription>
        <div class="um-dialog-body"><slot /></div>
        <footer v-if="footer" class="um-dialog-footer">
          <slot name="footer">
            <Button v-if="!hideCancel" variant="outline" :disabled="busy" @click="cancel">{{ cancelText }}</Button>
            <Button :variant="okButtonProps?.status === 'danger' ? 'destructive' : 'default'" :disabled="busy || okButtonProps?.disabled" @click="confirm">
              <Icon v-if="busy" icon="lucide:loader-circle" class="animate-spin" />{{ okText }}
            </Button>
          </slot>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.um-dialog-mask { position: fixed; inset: 0; z-index: 1100; background: rgb(15 24 20 / .35); backdrop-filter: blur(2px); }
.um-dialog { position: fixed; top: 50%; left: 50%; z-index: 1100; transform: translate(-50%, -50%); max-width: calc(100vw - 32px); max-height: calc(100dvh - 48px); overflow-y: auto; background: var(--card); color: var(--foreground); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 24px 80px rgb(15 24 20 / .18); outline: none; }
.um-dialog-mask[data-state="open"], .um-dialog[data-state="open"] { animation: um-dialog-enter 200ms ease-out; }
.um-dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 24px 16px; gap: 16px; }
.um-dialog-title { margin: 0; font-size: 20px; font-weight: 650; }
.um-dialog-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; color: var(--muted-foreground); }
.um-dialog-close:hover { background: var(--muted); }
.um-dialog-close:disabled { opacity: .4; cursor: not-allowed; }
.um-dialog-body { padding: 0 24px 24px; line-height: 1.65; overflow-wrap: anywhere; }
.um-dialog-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px 24px; border-top: 1px solid var(--border); }
@keyframes um-dialog-enter { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .um-dialog-mask[data-state="open"], .um-dialog[data-state="open"] { animation: none; } }
</style>
