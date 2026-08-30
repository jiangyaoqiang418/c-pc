<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';

interface Props {
  visible: boolean;
  order?: Api.RealOrder.Record;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'create-track', params: Api.RealOrder.LogisticsTrackParams): void;
  (e: 'mark-exception', params: Api.RealOrder.LogisticsExceptionParams): void;
}>();

const activeTab = ref<'track' | 'exception'>('track');
const track = reactive({
  status: 'IN_TRANSIT' as Api.RealOrder.LogisticsStatus,
  description: '',
  location: '',
  occurredAt: ''
});
const exception = reactive({ description: '', location: '' });

const TRACK_STATUSES: Array<{ value: Api.RealOrder.LogisticsStatus; label: string }> = [
  { value: 'SHIPPED', label: '已发货' },
  { value: 'IN_TRANSIT', label: '运输中' },
  { value: 'DELIVERING', label: '派送中' },
  { value: 'SIGNED', label: '已签收' },
  { value: 'EXCEPTION', label: '异常' },
  { value: 'RETURNED', label: '已退回' }
];

watch(() => props.visible, visible => {
  if (!visible) return;
  activeTab.value = 'track';
  track.status = 'IN_TRANSIT';
  track.description = '';
  track.location = '';
  track.occurredAt = '';
  exception.description = '';
  exception.location = '';
});

function submitTrack() {
  if (!props.order || props.submitting) return;
  if (!track.description.trim()) {
    Message.warning('请填写物流轨迹说明');
    return;
  }
  emit('create-track', {
    orderId: props.order.id,
    status: track.status,
    description: track.description.trim(),
    location: track.location.trim() || undefined,
    occurredAt: track.occurredAt || undefined
  });
}

function submitException() {
  if (!props.order || props.submitting) return;
  if (!exception.description.trim()) {
    Message.warning('请填写异常说明');
    return;
  }
  emit('mark-exception', {
    orderId: props.order.id,
    exception: exception.description.trim(),
    location: exception.location.trim() || undefined
  });
}

function submit() {
  if (activeTab.value === 'track') submitTrack();
  else submitException();
  return false;
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="物流管理"
    :ok-loading="submitting"
    :ok-text="activeTab === 'track' ? '登记轨迹' : '标记异常'"
    @update:visible="value => emit('update:visible', value)"
    :on-before-ok="submit"
  >
    <template v-if="order">
      <p class="hint">订单 {{ order.code }} · 请仅登记已实际发生的物流信息。</p>
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="track" title="登记轨迹" :disabled="submitting">
          <a-form :model="track" layout="vertical" :disabled="submitting">
            <a-form-item label="物流状态" required>
              <a-select v-model="track.status">
                <a-option v-for="item in TRACK_STATUSES" :key="item.value" :value="item.value">{{ item.label }}</a-option>
              </a-select>
            </a-form-item>
            <a-form-item label="轨迹说明" required><a-textarea v-model="track.description" :max-length="200" show-word-limit /></a-form-item>
            <a-form-item label="地点"><a-input v-model="track.location" placeholder="可选" /></a-form-item>
            <a-form-item label="发生时间"><a-date-picker v-model="track.occurredAt" show-time value-format="x" style="width: 100%" /></a-form-item>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="exception" title="标记异常" :disabled="submitting">
          <a-alert type="warning" class="alert" title="标记异常后，后续非异常轨迹会自动清空异常摘要。" />
          <a-form :model="exception" layout="vertical" :disabled="submitting">
            <a-form-item label="异常说明" required><a-textarea v-model="exception.description" :max-length="200" show-word-limit /></a-form-item>
            <a-form-item label="地点"><a-input v-model="exception.location" placeholder="可选" /></a-form-item>
          </a-form>
        </a-tab-pane>
      </a-tabs>
    </template>
  </a-modal>
</template>

<style scoped>
.hint { color: #4e5969; font-size: 13px; margin: 0 0 12px; }
.alert { margin-bottom: 16px; }
</style>
