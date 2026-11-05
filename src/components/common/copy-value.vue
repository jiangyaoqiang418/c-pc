<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { Message } from '@/lib/feedback';

const props = withDefaults(defineProps<{ value?: string | number | null; label?: string }>(), { label: '内容' });
const text = computed(() => props.value == null ? '' : String(props.value));
const available = computed(() => !!text.value.trim() && text.value !== '—');
const copying = ref(false);
async function copy() {
  if (!available.value || copying.value) return;
  copying.value = true;
  try { await navigator.clipboard.writeText(text.value); Message.success(`${props.label}已复制`); }
  catch { Message.error('复制失败，请选择完整内容手动复制'); }
  finally { copying.value = false; }
}
</script>

<template>
  <span class="copy-value"><span>{{ available ? text : '—' }}</span><button v-if="available" type="button" :aria-label="`复制${label}`" :title="`复制${label}`" :disabled="copying" @click.stop.prevent="copy" @keydown.stop><Icon icon="lucide:copy" aria-hidden="true" /><span class="sr-only">复制</span></button></span>
</template>

<style scoped>
.copy-value { overflow-wrap:anywhere; }.copy-value > button { display:inline-flex; vertical-align:middle; align-items:center; justify-content:center; width:32px; height:32px; margin-inline-start:4px; padding:6px; border-radius:4px; background:transparent; color:var(--green); }.copy-value > button:hover { background:var(--soft); }.copy-value > button:focus-visible { outline:2px solid var(--green); outline-offset:2px; }.copy-value svg { width:16px; height:16px; }
@media (pointer:coarse) { .copy-value > button { width:44px; height:44px; } }
</style>
