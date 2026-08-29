<script setup lang="ts">
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
  <a-modal
    :visible="visible"
    :title="agreement?.title || '协议'"
    width="720px"
    :body-style="{ padding: 0, maxHeight: '70vh', overflow: 'auto' }"
    :ok-text="'我已阅读'"
    :cancel-text="'关闭'"
    @update:visible="(v) => $emit('update:visible', v)"
    @ok="$emit('update:visible', false)"
  >
    <a-spin :loading="loading" style="width: 100%">
      <div v-if="agreement" class="body">
        <div class="version">
          <span class="ver">版本 {{ agreement.version }}</span>
          <span class="dot">·</span>
          <span>生效于 {{ formatDateValue(agreement.effectiveAt, true) }}</span>
          <span class="dot">·</span>
          <span>发布人 {{ agreement.publishedBy }}</span>
        </div>
        <pre class="content">{{ agreement.body }}</pre>
      </div>
      <a-alert v-else-if="loadError" type="error" :closable="false" class="load-error">
        {{ loadError }}
        <template #action><a-button size="mini" @click="load">重新加载</a-button></template>
      </a-alert>
    </a-spin>
  </a-modal>
</template>

<style scoped>
.body {
  padding: 16px 24px 24px;
}
.version {
  font-size: 12px;
  color: #86909c;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 0 0 12px;
  border-bottom: 1px dashed #f2f3f5;
  margin-bottom: 16px;
}
.ver {
  background: #f3f7ff;
  color: var(--bw-brand-primary);
  padding: 2px 8px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
}
.dot {
  opacity: 0.4;
}
.content {
  font-size: 13px;
  line-height: 1.7;
  color: #4e5969;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  margin: 0;
}
</style>
