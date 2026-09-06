<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { fetchCarriers } from '@/service/api/order';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { Message } from '@arco-design/web-vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';

interface Props {
  visible: boolean;
  order?: Api.RealOrder.Record;
  submitting?: boolean;
}
const props = defineProps<Props>();
const uploadStates = reactive({ purchase: false, shipping: false });
const uploading = computed(() => uploadStates.purchase || uploadStates.shipping);
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
}>({ carrier: '', carrierName: '', trackingNumber: '', eta: '', purchaseNo: '', purchaseVouchers: [], shipVouchers: [], remark: '' });

const carriers = ref<Api.RealOrder.CarrierDTO[]>([]);
const carrierLoading = ref(false);
const carrierError = ref('');
const carrierGuard = createLatestRequestGuard();
const selectedCarrier = computed(() => carriers.value.find(item => item.code === form.carrier));
async function loadCarriers() {
  const isCurrent = carrierGuard.begin();
  carrierLoading.value = true;
  carrierError.value = '';
  try {
    const result = await fetchCarriers({ signal: isCurrent.signal });
    if (!isCurrent() || !props.visible) return;
    carriers.value = result;
    if (!form.carrier) form.carrier = result.find(item => item.defaultCarrier)?.code || '';
    if (!result.length) carrierError.value = '暂无启用的承运商，暂不可发货';
  } catch {
    if (isCurrent()) { carriers.value = []; carrierError.value = '承运商读取失败，请重新加载'; }
  } finally { if (isCurrent()) carrierLoading.value = false; }
}
onBeforeUnmount(carrierGuard.invalidate);
watch(() => form.carrier, () => { form.carrierName = ''; });

watch(
  [() => props.visible, () => props.order?.id],
  ([v]) => {
    carrierGuard.invalidate();
    carriers.value = [];
    if (v) {
      form.carrier = '';
      form.carrierName = '';
      form.trackingNumber = '';
      form.eta = '';
      form.purchaseNo = '';
      form.purchaseVouchers = [];
      form.shipVouchers = [];
      form.remark = '';
      void loadCarriers();
    }
  }, { immediate: true }
);

function submit() {
  if (!props.order || props.submitting || uploading.value) return false;
  if (carrierLoading.value || carrierError.value || !selectedCarrier.value) {
    Message.warning('请先读取并选择启用的承运商');
    return false;
  }
  if (form.trackingNumber.trim().length < 6) {
    Message.warning('请输入有效的运单号（至少 6 位）');
    return false;
  }
  if (selectedCarrier.value.customNameRequired && !form.carrierName.trim()) {
    Message.warning('请选择其他承运商时请填写承运商名称');
    return false;
  }
  emit('confirm', {
    id: props.order.id,
    carrier: form.carrier,
    carrierName: selectedCarrier.value.customNameRequired ? form.carrierName.trim() : undefined,
    trackingNo: form.trackingNumber.trim(),
    eta: form.eta || undefined,
    purchaseNo: form.purchaseNo.trim() || undefined,
    purchaseVouchers: [...form.purchaseVouchers],
    shipVouchers: [...form.shipVouchers],
    remark: form.remark.trim() || undefined
  });
  // 成功后由父页面关闭；校验失败或接口失败保留当前表单。
  return false;
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="上传发货信息"
    :ok-loading="props.submitting"
    :ok-button-props="{ disabled: uploading || carrierLoading || !!carrierError || !selectedCarrier }"
    ok-text="确认发货"
    @update:visible="(v) => $emit('update:visible', v)"
    :on-before-ok="submit"
  >
    <template v-if="order">
      <div class="hint">订单 {{ order.code }} · {{ order.productTitle }}</div>
      <a-alert type="info" class="alert">
        填写真实物流信息后订单状态变为「运输中」，平台将开始拉取物流轨迹
      </a-alert>
      <a-form :model="form" layout="vertical" :disabled="submitting">
        <a-alert v-if="carrierError" type="warning">{{ carrierError }}<template #action><a-button :loading="carrierLoading" @click="loadCarriers">重新加载</a-button></template></a-alert>
        <a-form-item label="物流公司" required>
          <a-radio-group v-model="form.carrier" :disabled="carrierLoading">
            <a-radio v-for="c in carriers" :key="c.code" :value="c.code">
              {{ c.name }}
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="运单号" required>
          <a-input v-model="form.trackingNumber" placeholder="请输入运单号" />
        </a-form-item>
        <a-form-item v-if="selectedCarrier?.customNameRequired" label="承运商名称" required><a-input v-model="form.carrierName" placeholder="请输入承运商名称" /></a-form-item>
        <a-form-item label="预计送达时间"><a-date-picker v-model="form.eta" show-time value-format="x" style="width: 100%" /></a-form-item>
        <a-form-item label="采购单号"><a-input v-model="form.purchaseNo" placeholder="可选，用于采购核对" /></a-form-item>
        <a-form-item label="采购凭证"><AftersaleEvidenceUploader v-model="form.purchaseVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.purchase = $event" /></a-form-item>
        <a-form-item label="发货凭证"><AftersaleEvidenceUploader v-model="form.shipVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.shipping = $event" /></a-form-item>
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
