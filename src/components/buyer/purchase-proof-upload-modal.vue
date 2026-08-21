<script setup lang="ts">
import { ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';

interface Props {
  visible: boolean;
  order?: Api.RealOrder.Record;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', orderId: string | number, imageUrl: string): void;
}>();

const images = ref<string[]>([]);
const submitting = ref(false);

watch(
  () => props.visible,
  v => {
    if (v) images.value = [];
  }
);

function submit() {
  if (!props.order) return;
  if (!images.value.length) {
    Message.warning('请上传采购截图');
    return;
  }
  submitting.value = true;
  try {
    emit('confirm', props.order.id, images.value[0]);
  } finally {
    setTimeout(() => (submitting.value = false), 600);
  }
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="上传采购截图"
    :ok-loading="submitting"
    ok-text="确认上传"
    @update:visible="(v) => $emit('update:visible', v)"
    @ok="submit"
  >
    <template v-if="order">
      <div class="hint">订单 {{ order.code }} · {{ order.productTitle }}</div>
      <a-alert type="info" class="alert">
        请上传向商家下单的截图作为采购凭证；上传后订单将变为「已采购待发货」
      </a-alert>
      <AftersaleEvidenceUploader v-model="images" :max="1" />
    </template>
  </a-modal>
</template>

<style scoped>
.hint {
  color: #4e5969;
  font-size: 13px;
  margin-bottom: 12px;
}
.alert {
  margin-bottom: 16px;
}
</style>
