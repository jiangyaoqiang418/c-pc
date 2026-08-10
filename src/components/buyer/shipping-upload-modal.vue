<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { enums } from '@shared';

interface Props {
  visible: boolean;
  order?: Api.Order.OrderRecord;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', orderId: string | number, trackingNumber: string, carrier: Api.Order.ShippingCarrier): void;
}>();

const form = reactive<{
  carrier: Api.Order.ShippingCarrier;
  trackingNumber: string;
}>({ carrier: 'SF_INTL', trackingNumber: '' });

const CARRIER_OPTIONS: Api.Order.ShippingCarrier[] = ['SF_INTL', 'FEDEX', 'DHL', '4PX', 'EMS'];

watch(
  () => props.visible,
  v => {
    if (v) {
      form.carrier = 'SF_INTL';
      form.trackingNumber = '';
    }
  }
);

function submit() {
  if (!props.order) return;
  if (!form.trackingNumber || form.trackingNumber.length < 6) {
    Message.warning('请输入有效的运单号（至少 6 位）');
    return;
  }
  emit('confirm', props.order.id, form.trackingNumber.trim(), form.carrier);
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="上传发货信息"
    :ok-loading="props.submitting"
    ok-text="确认发货"
    @update:visible="(v) => $emit('update:visible', v)"
    @ok="submit"
  >
    <template v-if="order">
      <div class="hint">订单 {{ order.code }} · {{ order.productTitle }}</div>
      <a-alert type="info" class="alert">
        填写真实物流信息后订单状态变为「运输中」，平台将开始拉取物流轨迹
      </a-alert>
      <a-form :model="form" layout="vertical">
        <a-form-item label="物流公司" required>
          <a-radio-group v-model="form.carrier">
            <a-radio v-for="c in CARRIER_OPTIONS" :key="c" :value="c">
              {{ enums.CARRIER_META[c].label }}
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="运单号" required>
          <a-input v-model="form.trackingNumber" placeholder="请输入运单号" />
        </a-form-item>
      </a-form>
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
