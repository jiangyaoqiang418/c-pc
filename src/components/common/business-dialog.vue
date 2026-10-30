<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { Button } from '@/components/ui/button';
import { Message } from '@/lib/feedback';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from './v47-sheet-grip.vue';
import { provideDialogFooter } from './dialog-footer';

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
  keydown: [event: KeyboardEvent];
}>();
const pending = ref(false);
const footerTarget = provideDialogFooter();
let operation = 0;
// A late guard must not close a dialog that the parent has since reopened.
watch(() => props.visible, () => { operation += 1; pending.value = false; }, { flush: 'sync' });
onBeforeUnmount(() => { operation += 1; });
const busy = computed(() => pending.value || props.okLoading);
const buyerDialog = computed(() => props.contentClass?.split(/\s+/).includes('buyer-dialog'));
const dialogWidth = computed(() => typeof props.width === 'number' || /^\d+$/.test(props.width)
  ? `${props.width}px` : props.width);

async function cancel() {
  if (busy.value) return;
  const current = ++operation;
  pending.value = true;
  try {
    if (await props.onBeforeCancel?.() === false) return;
    if (current !== operation || !props.visible) return;
    emit('cancel');
    emit('update:visible', false);
    emit('close');
  } catch (error) {
    if (current === operation && props.visible) Message.error(error instanceof Error ? error.message : '操作未完成，请稍后重试');
  } finally { if (current === operation) pending.value = false; }
}

async function confirm() {
  if (busy.value || props.okButtonProps?.disabled) return;
  const current = ++operation;
  pending.value = true;
  try {
    if (await props.onBeforeOk?.() === false) return;
    if (current !== operation || !props.visible) return;
    emit('ok');
    emit('update:visible', false);
    emit('close');
  } catch (error) {
    if (current === operation && props.visible) Message.error(error instanceof Error ? error.message : '操作未完成，请核对后重试');
  } finally { if (current === operation) pending.value = false; }
}
</script>

<template>
  <DialogRoot :open="visible" @update:open="value => { if (!value) void cancel(); }">
    <DialogPortal force-mount>
      <Transition name="modal">
        <DialogOverlay v-if="visible" force-mount class="um-dialog-mask modal-overlay">
          <DialogContent force-mount class="um-dialog dialog" :class="contentClass" :style="{ width: dialogWidth }"
            @keydown="emit('keydown', $event)"
            @escape-key-down="event => { if (!escToClose || busy) event.preventDefault(); }"
            @pointer-down-outside="event => { if (!maskClosable || busy) event.preventDefault(); }">
            <V47SheetGrip v-if="closable" :open="visible" :disabled="busy" @dismiss="cancel" />
            <header class="um-dialog-header">
              <DialogTitle class="um-dialog-title">{{ title }}</DialogTitle>
              <button v-if="closable" type="button" class="um-dialog-close icon-btn dialog-close" :class="{ 'buyer-dialog-close': buyerDialog }" :disabled="busy" aria-label="关闭弹窗" @click="cancel"><UmIcon name="close" /></button>
            </header>
            <DialogDescription class="sr-only">请核对弹窗内容后继续操作。</DialogDescription>
            <div class="um-dialog-body"><slot /></div>
            <footer ref="footerTarget" class="um-dialog-footer" :class="{ 'buyer-dialog-footer': buyerDialog }">
              <slot name="footer">
                <template v-if="footer">
                <Button v-if="!hideCancel" class="outline" variant="outline" :disabled="busy" @click="cancel">{{ cancelText }}</Button>
                <Button class="primary" :class="{ 'um-dialog-danger': okButtonProps?.status === 'danger' }" :variant="okButtonProps?.status === 'danger' ? 'destructive' : 'default'" :disabled="busy || okButtonProps?.disabled" @click="confirm">
                  <Icon v-if="busy" icon="lucide:loader-circle" class="animate-spin" />{{ okText }}
                </Button>
                </template>
              </slot>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.um-dialog-mask.modal-overlay { position:fixed; inset:0; z-index:1000; }
:root[data-ui-layout] .um-dialog.dialog { position:relative; z-index:1000; display:flex!important; flex-direction:column; flex-shrink:0; max-width:calc(100vw - 32px); max-height:calc(100dvh - 48px)!important; padding:0!important; overflow:hidden!important; outline:none; }
.um-dialog-header { display:flex; flex:none; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--line); }
.um-dialog-header .um-dialog-title { flex:1; min-width:0; margin:0; text-align:left; overflow-wrap:anywhere; }
:root .um-dialog-header .dialog-close { position:static!important; flex:none; display:grid; place-items:center; margin:0 0 0 auto; padding:0; width:44px; height:44px; }
.um-dialog:not(.buyer-dialog) .um-dialog-title { font-size:23px; }
:root .um-dialog .um-dialog-danger { background:var(--yb-danger)!important; border-color:var(--yb-danger)!important; color:var(--yb-on-danger, #fff)!important; }
:root .um-dialog .um-dialog-danger:hover { background:color-mix(in srgb,var(--yb-danger) 85%,var(--ink))!important; }
.um-dialog-close:disabled { opacity:.4; cursor:not-allowed; }
.um-dialog-body { flex:1 1 auto; min-height:0; min-width:0; overflow:auto; overscroll-behavior:contain; padding:24px; overflow-wrap:anywhere; }
.um-dialog-body { --dialog-scrollbar-thumb:color-mix(in srgb,var(--muted) 40%,transparent); --dialog-scrollbar-hover:color-mix(in srgb,var(--muted) 65%,transparent); }
.um-dialog-body,.um-dialog-body * { scrollbar-width:thin; scrollbar-color:var(--dialog-scrollbar-thumb) transparent; }
@supports selector(::-webkit-scrollbar) {
  .um-dialog-body,.um-dialog-body * { scrollbar-width:auto; scrollbar-color:auto; }
  .um-dialog-body::-webkit-scrollbar,.um-dialog-body ::-webkit-scrollbar { width:6px; height:6px; }
  .um-dialog-body::-webkit-scrollbar-track,.um-dialog-body ::-webkit-scrollbar-track { background:transparent; }
  .um-dialog-body::-webkit-scrollbar-thumb,.um-dialog-body ::-webkit-scrollbar-thumb { background:var(--dialog-scrollbar-thumb); border-radius:999px; }
  .um-dialog-body::-webkit-scrollbar-thumb:hover,.um-dialog-body ::-webkit-scrollbar-thumb:hover { background:var(--dialog-scrollbar-hover); }
  .um-dialog-body::-webkit-scrollbar-button,.um-dialog-body ::-webkit-scrollbar-button { display:none; width:0; height:0; }
}
.um-dialog-footer { flex:none; display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:12px; margin:0; padding:16px 24px; border-top:1px solid var(--line); }
.um-dialog-footer:empty { display:none; }
.um-dialog-action-group { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:12px; width:100%; }
:root .um-dialog-footer .full { width:auto; }
:root .um-dialog-footer button { max-width:100%; margin-top:0; }
.um-dialog-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12px; margin-top:24px; padding-top:20px; border-top:1px solid var(--line); }
@media (max-width:700px) {
  .um-dialog.dialog { width:100%!important; max-width:100%; }
  .um-dialog:not(.buyer-dialog) .um-dialog-title { font-size:21px; }
  :root[data-ui-layout] .um-dialog.dialog { max-height:calc(100dvh - 16px)!important; }
  .um-dialog-header { padding:14px 18px; }
  .um-dialog-body { padding:18px; }
  .um-dialog-footer { padding:14px 18px max(14px,env(safe-area-inset-bottom)); }
}
</style>
