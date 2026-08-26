<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';

interface Props {
  visible: boolean;
  order?: Api.RealOrder.Record;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', params: Api.RealOrder.OrderShipParams): void;
}>();

const form = reactive<{
  carrier: Api.RealOrder.Carrier;
  carrierName: string;
  trackingNumber: string;
  eta: string;
  purchaseNo: string;
  purchaseVouchers: string[];
  shipVouchers: string[];
  remark: string;
}>({ carrier: 'SF', carrierName: '', trackingNumber: '', eta: '', purchaseNo: '', purchaseVouchers: [], shipVouchers: [], remark: '' });

const CARRIER_OPTIONS: Api.RealOrder.Carrier[] = [
  'SF', 'JD', 'EMS', 'YTO', 'ZTO', 'STO', 'YUNDA', 'JITU',
  'DHL', 'UPS', 'FEDEX', 'USPS', 'YAMATO', 'SAGAWA', 'JAPAN_POST', 'OTHER'
];

watch(
  () => props.visible,
  v => {
    if (v) {
      form.carrier = 'SF';
      form.carrierName = '';
      form.trackingNumber = '';
      form.eta = '';
      form.purchaseNo = '';
      form.purchaseVouchers = [];
      form.shipVouchers = [];
      form.remark = '';
    }
  }
);

function submit() {
  if (!props.order) return;
  if (!form.trackingNumber || form.trackingNumber.length < 6) {
    Message.warning('请输入有效的运单号（至少 6 位）');
    return;
  }
  if (form.carrier === 'OTHER' && !form.carrierName.trim()) {
    Message.warning('请选择其他承运商时请填写承运商名称');
    return;
  }
  emit('confirm', {
    id: props.order.id,
    carrier: form.carrier,
    carrierName: form.carrierName.trim() || undefined,
    trackingNo: form.trackingNumber.trim(),
    eta: form.eta || undefined,
    purchaseNo: form.purchaseNo.trim() || undefined,
    purchaseVouchers: form.purchaseVouchers,
    shipVouchers: form.shipVouchers,
    remark: form.remark.trim() || undefined
  });
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
              {{ c }}
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="运单号" required>
          <a-input v-model="form.trackingNumber" placeholder="请输入运单号" />
        </a-form-item>
        <a-form-item v-if="form.carrier === 'OTHER'" label="承运商名称" required><a-input v-model="form.carrierName" placeholder="请输入承运商名称" /></a-form-item>
        <a-form-item label="预计送达时间"><a-date-picker v-model="form.eta" show-time value-format="x" style="width: 100%" /></a-form-item>
        <a-form-item label="采购单号"><a-input v-model="form.purchaseNo" placeholder="可选，用于采购核对" /></a-form-item>
        <a-form-item label="采购凭证"><AftersaleEvidenceUploader v-model="form.purchaseVouchers" scene="ORDER_VOUCHER" :max="6" /></a-form-item>
        <a-form-item label="发货凭证"><AftersaleEvidenceUploader v-model="form.shipVouchers" scene="ORDER_VOUCHER" :max="6" /></a-form-item>
        <a-form-item label="发货备注"><a-textarea v-model="form.remark" :max-length="500" show-word-limit /></a-form-item>
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
