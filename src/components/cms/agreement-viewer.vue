<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useUserStore } from '@/stores';
import { fetchAgreementCurrent, contentReadMessage } from '@/service/api/content';
import { createLatestRequestGuard } from '@/utils/latest-request';
import PublicContentBody from './public-content-body.vue';

interface Props {
  visible: boolean;
  kind: Api.RealContent.AgreementKind;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const userStore = useUserStore();
const agreement = ref<Api.RealContent.PublicContentVO>();
const loading = ref(false);
const loadError = ref('');
const loadGuard = createLatestRequestGuard();

async function load() {
  const isCurrent = loadGuard.begin();
  agreement.value = undefined;
  loading.value = true;
  loadError.value = '';
  try {
    const next = await fetchAgreementCurrent(props.kind, { signal: isCurrent.signal });
    if (isCurrent() && props.visible) agreement.value = next;
  } catch (error) {
    if (isCurrent() && props.visible) {
      agreement.value = undefined;
      loadError.value = contentReadMessage(error, '协议内容加载失败，请稍后重试');
    }
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

watch(
  () => [props.visible, props.kind, userStore.currentUser?.id, userStore.sessionVersion] as const,
  ([v]) => {
    loadGuard.invalidate();
    if (v) {
      agreement.value = undefined;
      void load();
    } else {
      agreement.value = undefined;
      loading.value = false;
      loadError.value = '';
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  loadGuard.invalidate();
});


</script>

<template>

  <AModal :visible="visible" :title="agreement?.title || '协议'" :width="720" ok-text="我已阅读" cancel-text="关闭" @update:visible="(v: boolean) => $emit('update:visible', v)" @ok="$emit('update:visible', false)">
    <div v-if="loading" aria-busy="true" aria-label="正在读取协议"><Skeleton v-for="n in 5" :key="n" class="line-skeleton" /></div>
    <PublicContentBody v-else-if="agreement" :content="agreement" />
    <div v-else-if="loadError" class="error" role="alert"><span>{{ loadError }}</span><button type="button" class="outline" @click="load">重新读取</button></div>
  </AModal>

</template>

<style scoped>
.error { display:flex; align-items:center; gap:16px; color:var(--yb-danger); font-size:13px; }.error span { flex:1; }
.line-skeleton { height:28px; border-radius:8px; margin-bottom:12px; }
</style>
