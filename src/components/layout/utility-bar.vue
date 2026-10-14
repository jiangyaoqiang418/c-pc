<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import ReferenceRateTicker from './reference-rate-ticker.vue';
import UmIcon from '@/components/common/um-icon.vue';

const router = useRouter();
const regionOpen = ref(false);
function manageAddress() { regionOpen.value = false; void router.push('/address'); }
</script>

<template>
  <ReferenceRateTicker class="utility-bar">
    <template #utilities><div class="rate-utilities"><DialogRoot v-model:open="regionOpen"><DialogTrigger as-child><button type="button"><UmIcon name="pin" />中国大陆</button></DialogTrigger><DialogPortal><DialogOverlay class="modal-overlay region-overlay" /><DialogContent as="section" class="dialog region-dialog"><DialogClose as-child><button type="button" class="dialog-close icon-btn region-close" aria-label="关闭对话框"><UmIcon name="close" /></button></DialogClose><DialogTitle as="h2">配送至哪里？</DialogTitle><DialogDescription as="p">配送信息将在结算时根据收货地址核对。</DialogDescription><button type="button" class="primary full region-confirm" @click="manageAddress">管理收货地址</button></DialogContent></DialogPortal></DialogRoot><span>中文 / USDT</span><button type="button" @click="router.push('/help')">帮助中心</button></div></template>
  </ReferenceRateTicker>
</template>

<style scoped>
.region-dialog { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:171; width:540px; max-width:calc(100vw - 48px); }
.region-overlay { z-index:170; }
.region-confirm { width:100%; }
.region-overlay[data-state="open"] { animation:regionFadeIn .2s; } .region-overlay[data-state="closed"] { animation:regionFadeOut .2s; }
.region-dialog[data-state="open"] { animation:regionIn .3s cubic-bezier(.22,1,.36,1); } .region-dialog[data-state="closed"] { animation:regionOut .16s; }
@keyframes regionFadeIn { from { opacity:0; } to { opacity:1; } } @keyframes regionFadeOut { from { opacity:1; } to { opacity:0; } }
@keyframes regionIn { from { opacity:0; transform:translate(-50%,calc(-50% + 18px)) scale(.97); } to { opacity:1; transform:translate(-50%,-50%); } } @keyframes regionOut { from { opacity:1; transform:translate(-50%,-50%); } to { opacity:0; transform:translate(-50%,calc(-50% + 8px)) scale(.985); } }
@media (prefers-reduced-motion:reduce) { .region-overlay[data-state],.region-dialog[data-state] { animation:none; } }
</style>
