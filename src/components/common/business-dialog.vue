<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { Button } from '@/components/ui/button';
import { Message } from '@/lib/feedback';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from './v47-sheet-grip.vue';

const props = withDefaults(defineProps<{
  visible?: boolean;
  title?: string;
  width?: string | number;
  contentClass?: string;
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
const buyerDialog = computed(() => props.contentClass?.split(/\s+/).includes('buyer-dialog'));
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
      <DialogContent class="um-dialog dialog" :class="contentClass" :style="{ width: dialogWidth }"
        @escape-key-down="event => { if (!escToClose || busy) event.preventDefault(); }"
        @pointer-down-outside="event => { if (!maskClosable || busy) event.preventDefault(); }">
        <V47SheetGrip v-if="closable" :open="visible" :disabled="busy" @dismiss="cancel" />
        <header class="um-dialog-header">
          <DialogTitle class="um-dialog-title">{{ title }}</DialogTitle>
          <button v-if="closable" type="button" class="um-dialog-close icon-btn dialog-close" :class="{ 'buyer-dialog-close': buyerDialog }" :disabled="busy" aria-label="关闭弹窗" @click="cancel"><UmIcon name="close" /></button>
        </header>
        <DialogDescription class="sr-only">请核对弹窗内容后继续操作。</DialogDescription>
        <div class="um-dialog-body"><slot /></div>
        <footer v-if="footer" class="um-dialog-footer" :class="{ 'buyer-dialog-footer': buyerDialog }">
          <slot name="footer">
            <Button v-if="!hideCancel" class="outline" variant="outline" :disabled="busy" @click="cancel">{{ cancelText }}</Button>
            <Button class="primary" :class="{ 'um-dialog-danger': okButtonProps?.status === 'danger' }" :variant="okButtonProps?.status === 'danger' ? 'destructive' : 'default'" :disabled="busy || okButtonProps?.disabled" @click="confirm">
              <Icon v-if="busy" icon="lucide:loader-circle" class="animate-spin" />{{ okText }}
            </Button>
          </slot>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.um-dialog-mask.modal-overlay { position:fixed; inset:0; z-index:1000; }
.um-dialog.dialog { position:fixed; top:50%; left:50%; z-index:1000; transform:translate(-50%,-50%); display:block; max-width:calc(100vw - 32px); overflow:auto; outline:none; }
.um-dialog-header { display:flex; align-items:center; gap:16px; }
.um-dialog:not(.buyer-dialog) .um-dialog-title { font-size:23px; }
:root .um-dialog .um-dialog-danger { background:var(--yb-danger)!important; border-color:var(--yb-danger)!important; color:#fff!important; }
:root .um-dialog .um-dialog-danger:hover { background:color-mix(in srgb,var(--yb-danger) 85%,var(--ink))!important; }
.um-dialog-close:disabled { opacity:.4; cursor:not-allowed; }
.um-dialog-body { min-height:0; overflow-wrap:anywhere; }
.um-dialog-footer { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12px; margin-top:24px; padding:20px 0 0; border-top:1px solid var(--line); }
@media (max-width:700px) {
  .um-dialog.dialog { top:auto; bottom:0; left:50%; transform:translateX(-50%); width:100%!important; max-width:100%; }
  .um-dialog:not(.buyer-dialog) .um-dialog-title { font-size:21px; }
  :root[data-ui-theme="web3-meme"] .um-dialog.dialog { left:0; transform:none; }
}
</style>
