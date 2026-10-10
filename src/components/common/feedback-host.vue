<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { confirmations, notices, closeConfirmation, closeNotice, pauseNotice } from '@/lib/feedback';
import BusinessDialog from './business-dialog.vue';
import FeedbackContent from './feedback-content.vue';

const icons = { success: 'lucide:circle-check', error: 'lucide:circle-x', warning: 'lucide:triangle-alert', info: 'lucide:info', loading: 'lucide:loader-circle' };
function onFocusOut(key: number, event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !(event.currentTarget instanceof Element) || !event.currentTarget.contains(event.relatedTarget)) {
    pauseNotice(key, 'focused', false);
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="um-notices" aria-label="操作提示">
      <TransitionGroup name="um-notice">
        <div v-for="notice in notices" :key="notice.key" class="um-notice" :class="`um-notice-${notice.kind}`"
          :role="notice.kind === 'error' ? 'alert' : 'status'" tabindex="0"
          @mouseenter="pauseNotice(notice.key, 'hovered', true)" @mouseleave="pauseNotice(notice.key, 'hovered', false)"
          @focusin="pauseNotice(notice.key, 'focused', true)" @focusout="onFocusOut(notice.key, $event)">
          <Icon :icon="icons[notice.kind]" class="um-notice-icon" :class="{ 'animate-spin': notice.kind === 'loading' }" />
          <div class="um-notice-text"><FeedbackContent :content="notice.content" /></div>
          <button class="um-notice-close" type="button" aria-label="关闭提示" @click="closeNotice(notice.key)"><Icon icon="lucide:x" /></button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
  <BusinessDialog v-for="item in confirmations" :key="item.key" :visible="true" :title="item.title"
    :width="item.width" :ok-text="item.okText" :cancel-text="item.cancelText" :hide-cancel="!item.showCancel"
    :closable="item.closable ?? false" :mask-closable="item.maskClosable ?? false" :ok-button-props="item.okButtonProps"
    :on-before-cancel="async () => {
      if (await item.onBeforeCancel?.() === false) return false;
      await item.onCancel?.();
      return true;
    }" :on-before-ok="async () => {
      if (await item.onBeforeOk?.() === false) return false;
      await item.onOk?.();
      return true;
    }" @close="closeConfirmation(item.key)">
    <FeedbackContent :content="item.content" />
  </BusinessDialog>
</template>

<style scoped>
.um-notices { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 1400; width: max-content; max-width: calc(100vw - 32px); display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
.um-notice { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--foreground); box-shadow: 0 8px 30px rgb(15 24 20 / .12); max-width: 640px; pointer-events: auto; font-size: 14px; line-height: 1.65; }
.um-notice-icon { flex: none; margin-top: 3px; font-size: 18px; color: var(--primary); }
.um-notice-error .um-notice-icon { color: #c04543; }
.um-notice-warning .um-notice-icon { color: #ad751f; }
.um-notice-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.um-notice-close { border: 0; background: transparent; cursor: pointer; padding: 4px; color: var(--muted-foreground); }
.um-notice-enter-active, .um-notice-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.um-notice-enter-from, .um-notice-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) { .um-notice-enter-active, .um-notice-leave-active { transition: none; } }
</style>
