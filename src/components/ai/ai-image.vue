<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { fetchAiImageAccess } from '@/service/api/ai';
import { useUserStore } from '@/stores/user';
const props = defineProps<{ fileId: string }>();
const user = useUserStore();
const url = ref(''); const error = ref(''); const loading = ref(false); const expanded = ref(false);
let version = 0; let retried = false;
async function load(force = false) {
  const operation = ++version; loading.value = true; error.value = ''; url.value = '';
  try { const data = await fetchAiImageAccess(props.fileId, force); if (operation === version) url.value = data.url; }
  catch(e) { if (operation === version) error.value = e instanceof Error ? e.message : '图片加载失败，请重试'; }
  finally { if (operation === version) loading.value = false; }
}
function failed() { if (!retried) { retried = true; void load(true); } else { error.value = '图片加载失败，请重试'; url.value = ''; } }
function retry() { retried = false; void load(true); }
async function preview() { await load(); if (url.value) expanded.value = true; }
watch([() => props.fileId, () => user.currentUser?.id, () => user.sessionVersion], () => { retried = false; expanded.value = false; void load(); }, { immediate:true, flush:'sync' });
onBeforeUnmount(() => { version++; url.value = ''; });
</script>
<template>
  <div class="ai-image"><span v-if="loading" role="status">正在加载图片…</span><p v-if="error" role="alert">{{ error }} <button type="button" @click="retry">重试</button></p><button v-if="url" type="button" aria-label="查看图片" @click="preview"><img :src="url" alt="咨询图片" @error="failed" /></button><a-modal v-model:visible="expanded" title="咨询图片" :footer="false"><img v-if="url" class="full-image" :src="url" alt="咨询图片大图" @error="failed" /></a-modal></div>
</template>
<style scoped>
.ai-image img { max-width:180px; max-height:180px; border-radius:8px; object-fit:contain; }.ai-image .full-image { max-width:100%; max-height:70vh; }button { min-height:32px; }p { color:var(--danger); }
</style>
