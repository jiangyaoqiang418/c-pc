<script setup lang="ts">
import { ref, watch } from 'vue';
import { cmsApi } from '@shared';

interface Props {
  visible: boolean;
  kind: Api.Cms.AgreementKind;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const agreement = ref<Api.Cms.Agreement>();
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    agreement.value = await cmsApi.fetchAgreementCurrent(props.kind);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.kind] as const,
  ([v]) => {
    if (v) load();
  }
);
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
          <span>生效于 {{ new Date(agreement.effectiveAt).toLocaleDateString() }}</span>
          <span class="dot">·</span>
          <span>发布人 {{ agreement.publishedBy }}</span>
        </div>
        <pre class="content">{{ agreement.body }}</pre>
      </div>
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
