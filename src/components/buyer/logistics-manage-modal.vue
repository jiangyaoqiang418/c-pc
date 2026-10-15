<script setup lang="ts">
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import DateTimeInput from '@/components/common/date-time-input.vue';
import { reactive, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';

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

function selectTab(value: unknown) {
  if (!props.submitting && (value === 'track' || value === 'exception')) activeTab.value = value;
}
function selectStatus(value: unknown) {
  const status = TRACK_STATUSES.find(item => item.value === value);
  if (status) track.status = status.value;
}
</script>

<template>
  <a-modal content-class="buyer-dialog" :visible="visible" title="物流管理" :ok-loading="submitting" :closable="!submitting" :mask-closable="!submitting" :esc-to-close="!submitting" :on-before-cancel="() => !submitting" :ok-text="activeTab === 'track' ? '登记轨迹' : '标记异常'" @update:visible="(value: boolean) => emit('update:visible', value)" :on-before-ok="submit">
    <template v-if="order"><p class="order-hint">订单 {{ order.code }} · 请仅登记已实际发生的物流信息。</p><div class="buyer-tabs" role="group" aria-label="物流管理方式"><button type="button" :class="{ active:activeTab === 'track' }" :aria-pressed="activeTab === 'track'" :disabled="submitting" @click="selectTab('track')">登记轨迹</button><button type="button" :class="{ active:activeTab === 'exception' }" :aria-pressed="activeTab === 'exception'" :disabled="submitting" @click="selectTab('exception')">标记异常</button></div>
      <div v-if="activeTab === 'track'" class="logistics-form"><div class="buyer-field"><Label for="logistics-status">物流状态 <span>*</span></Label><Select :model-value="track.status" :disabled="submitting" @update:model-value="selectStatus"><SelectTrigger id="logistics-status" class="full"><SelectValue placeholder="请选择物流状态" /></SelectTrigger><SelectContent><SelectItem v-for="item in TRACK_STATUSES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></Select></div><div class="buyer-field"><Label for="logistics-description">轨迹说明 <span>*</span></Label><Textarea id="logistics-description" v-model="track.description" :disabled="submitting" maxlength="200" :rows="4" placeholder="请输入物流轨迹说明" /><small class="counter">{{ track.description.length }}/200</small></div><div class="buyer-field"><Label for="logistics-location">地点</Label><Input id="logistics-location" v-model="track.location" :disabled="submitting" placeholder="可选" /></div><div class="buyer-field"><Label for="logistics-occurred-at">发生时间</Label><DateTimeInput id="logistics-occurred-at" v-model="track.occurredAt" :disabled="submitting" /></div></div>
      <div v-else class="logistics-form"><Alert><AlertDescription>标记异常后，后续非异常轨迹会自动清空异常摘要。</AlertDescription></Alert><div class="buyer-field"><Label for="logistics-exception">异常说明 <span>*</span></Label><Textarea id="logistics-exception" v-model="exception.description" :disabled="submitting" maxlength="200" :rows="4" placeholder="请说明物流异常情况" /><small class="counter">{{ exception.description.length }}/200</small></div><div class="buyer-field"><Label for="logistics-exception-location">地点</Label><Input id="logistics-exception-location" v-model="exception.location" :disabled="submitting" placeholder="可选" /></div></div>
    </template>
  </a-modal>
</template>

<style scoped>
.order-hint { color:var(--muted); margin-bottom:20px; overflow-wrap:anywhere; }
.full { width:100%; }
.counter { color:var(--muted); text-align:right; }
</style>
