<script setup lang="ts">
import { useRouter } from 'vue-router';
import { nextTick, ref } from 'vue';
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import ReferenceRateTicker from './reference-rate-ticker.vue';
import UmIcon from '@/components/common/um-icon.vue';
import V47SheetGrip from '@/components/common/v47-sheet-grip.vue';

const router = useRouter();
const regionOpen = ref(false);
function restoreRegionFocus(event: Event) {
  event.preventDefault();
  void nextTick(() => {
    const trigger = document.querySelector<HTMLButtonElement>('[data-region-trigger]');
    const main = document.getElementById('main-content');
    const target = trigger?.getClientRects().length && getComputedStyle(trigger).visibility !== 'hidden' ? trigger : main;
    if (target === main && main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll:true });
  });
}
function manageAddress() { regionOpen.value = false; void router.push('/address'); }
</script>

<template>
  <ReferenceRateTicker class="utility-bar">
    <template #utilities><div class="rate-utilities"><DialogRoot v-model:open="regionOpen"><DialogTrigger as-child><button data-region-trigger type="button"><UmIcon name="pin" />中国大陆</button></DialogTrigger><DialogPortal force-mount><Transition name="modal"><DialogOverlay v-if="regionOpen" force-mount class="modal-overlay region-overlay v47-reference-mask"><DialogContent force-mount as="section" class="dialog region-dialog v47-reference-dialog" @close-auto-focus="restoreRegionFocus"><V47SheetGrip :open="regionOpen" @dismiss="regionOpen = false" /><DialogClose as-child><button type="button" class="dialog-close icon-btn region-close" aria-label="关闭对话框"><UmIcon name="close" /></button></DialogClose><DialogTitle as="h2">配送至哪里？</DialogTitle><DialogDescription as="p">配送信息将在结算时根据收货地址核对。</DialogDescription><button type="button" class="primary full region-confirm" @click="manageAddress">管理收货地址</button></DialogContent></DialogOverlay></Transition></DialogPortal></DialogRoot><span>中文 / USDT</span><button type="button" @click="router.push('/help')">帮助中心</button></div></template>
  </ReferenceRateTicker>
</template>

<style scoped src="../product/v47-detail-dialog-adapter.css"></style>
<style scoped>
.region-dialog { z-index:171; width:540px; max-width:calc(100vw - 48px); }
.region-overlay { z-index:170; }
.region-confirm { width:100%; }
</style>
