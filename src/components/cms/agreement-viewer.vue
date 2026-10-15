<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@iconify/vue';
import { onBeforeUnmount, ref, watch } from 'vue';
import { cmsApi } from '@shared';
import { formatDateValue } from '@/utils/date-range';

interface Props {
  visible: boolean;
  kind: Api.Cms.AgreementKind;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const agreement = ref<Api.Cms.Agreement>();
const loading = ref(false);
const loadError = ref('');
let loadVersion = 0;

async function load() {
  const operation = ++loadVersion;
  loading.value = true;
  loadError.value = '';
  try {
    const next = await cmsApi.fetchAgreementCurrent(props.kind);
    if (operation === loadVersion && props.visible) agreement.value = next;
  } catch {
    if (operation === loadVersion && props.visible) {
      agreement.value = undefined;
      loadError.value = '协议内容加载失败，请稍后重试。';
    }
  } finally {
    if (operation === loadVersion) loading.value = false;
  }
}

watch(
  () => [props.visible, props.kind] as const,
  ([v]) => {
    loadVersion += 1;
    if (v) {
      agreement.value = undefined;
      void load();
    } else {
      loading.value = false;
      loadError.value = '';
    }
  }
);

onBeforeUnmount(() => {
  loadVersion += 1;
});


</script>

<template>

  <AModal :visible="visible" :title="agreement?.title || '协议'" :width="720" ok-text="我已阅读" cancel-text="关闭" @update:visible="(v: boolean) => $emit('update:visible', v)" @ok="$emit('update:visible', false)">
    <div class="status-banner agreement-demo-note" role="note"><Icon icon="lucide:info" width="18" /><span>当前为演示协议，非正式发布版本。</span></div>
    <div v-if="loading" aria-busy="true" aria-label="正在读取协议"><Skeleton v-for="n in 5" :key="n" class="line-skeleton" /></div>
    <div v-else-if="agreement" class="agreement-body"><div class="version"><span>版本 {{ agreement.version }}</span><span>生效于 {{ formatDateValue(agreement.effectiveAt, true) }}</span><span>发布人 {{ agreement.publishedBy }}</span></div><pre class="content">{{ agreement.body }}</pre></div>
    <div v-else-if="loadError" class="error" role="alert"><span>{{ loadError }}</span><button type="button" class="outline" @click="load">重新读取</button></div>
  </AModal>

</template>

<style scoped>
.agreement-demo-note { display:flex; align-items:center; gap:10px; margin-bottom:20px; font-size:13px; }
.version { display:flex; flex-wrap:wrap; gap:12px; padding-bottom:16px; margin-bottom:20px; border-bottom:1px solid var(--line); font-size:12px; color:var(--muted); }
.version span:first-child { padding:4px 8px; border-radius:6px; background:var(--soft); }
.content { font:inherit; line-height:1.9; color:var(--ink); white-space:pre-wrap; overflow-wrap:anywhere; margin:0; }
.error { display:flex; align-items:center; gap:16px; color:var(--yb-danger); font-size:13px; }.error span { flex:1; }
.line-skeleton { height:28px; border-radius:8px; margin-bottom:12px; }
</style>
