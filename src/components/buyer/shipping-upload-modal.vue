<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import DateTimeInput from '@/components/common/date-time-input.vue';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { fetchCarriers } from '@/service/api/order';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { Message } from '@/lib/feedback';
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
  <a-modal :visible="visible" title="填写发货信息" :width="740" :ok-loading="props.submitting" :ok-button-props="{ disabled: uploading || carrierLoading || !!carrierError || !selectedCarrier }" :closable="!submitting && !uploading" :mask-closable="!submitting && !uploading" :esc-to-close="!submitting && !uploading" :on-before-cancel="() => !submitting && !uploading" ok-text="确认发货" @update:visible="value => emit('update:visible', value)" :on-before-ok="submit">
    <template v-if="order"><p class="order-hint">订单 {{ order.code }} · {{ order.productTitle }}</p><Alert class="shipping-note"><AlertDescription>填写真实物流信息后订单状态变为「运输中」，平台将开始拉取物流轨迹。</AlertDescription></Alert>
      <div class="shipping-form"><Alert v-if="carrierError" variant="destructive"><AlertDescription class="error-row"><span>{{ carrierError }}</span><Button type="button" variant="outline" size="sm" :disabled="carrierLoading || submitting" @click="loadCarriers">重新加载</Button></AlertDescription></Alert>
        <fieldset class="carrier-field" :disabled="submitting || carrierLoading"><legend>物流公司 <span>*</span></legend><Skeleton v-if="carrierLoading" class="carrier-skeleton" /><div v-else class="carrier-options"><label v-for="carrier in carriers" :key="carrier.code" :class="{ selected: form.carrier === carrier.code }"><input v-model="form.carrier" type="radio" :name="'shipping-carrier-' + String(order.id)" :value="carrier.code" /><span>{{ carrier.name }}</span></label></div></fieldset>
        <div class="field-grid"><div class="field"><Label for="shipping-tracking">运单号 <span>*</span></Label><Input id="shipping-tracking" v-model="form.trackingNumber" :disabled="submitting" placeholder="请输入运单号" /></div><div v-if="selectedCarrier?.customNameRequired" class="field"><Label for="shipping-carrier-name">承运商名称 <span>*</span></Label><Input id="shipping-carrier-name" v-model="form.carrierName" :disabled="submitting" placeholder="请输入承运商名称" /></div><div class="field"><Label for="shipping-eta">预计送达时间</Label><DateTimeInput id="shipping-eta" v-model="form.eta" :disabled="submitting" /></div><div class="field"><Label for="shipping-purchase-no">采购单号</Label><Input id="shipping-purchase-no" v-model="form.purchaseNo" :disabled="submitting" placeholder="可选，用于采购核对" /></div></div>
        <div class="field"><Label>采购凭证</Label><AftersaleEvidenceUploader v-model="form.purchaseVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.purchase = $event" /></div><div class="field"><Label>发货凭证</Label><AftersaleEvidenceUploader v-model="form.shipVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.shipping = $event" /></div><div class="field"><Label for="shipping-remark">发货备注</Label><Textarea id="shipping-remark" v-model="form.remark" :disabled="submitting" maxlength="500" :rows="3" placeholder="选填，请填写发货备注" /><small class="counter">{{ form.remark.length }}/500</small></div>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
.order-hint { margin:0 0 18px; color:var(--yb-muted); font-size:13px; overflow-wrap:anywhere; }.shipping-note { margin-bottom:24px; }.shipping-form { display:grid; gap:24px; }.carrier-field { margin:0; padding:0; border:0; min-width:0; }.carrier-field legend { font-size:14px; font-weight:500; margin-bottom:12px; }.carrier-field legend>span,.field label>span { color:var(--yb-danger); }.carrier-options { display:flex; flex-wrap:wrap; gap:10px; }.carrier-options label { display:flex; align-items:center; gap:8px; padding:11px 14px; border:1px solid var(--yb-hairline); border-radius:7px; font-size:13px; cursor:pointer; }.carrier-options label.selected { background:var(--yb-primary-soft); border-color:var(--yb-primary); color:var(--yb-primary); }.carrier-options input { accent-color:var(--yb-primary); }.carrier-field:disabled label { opacity:.55; cursor:not-allowed; }.field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }.field { display:grid; gap:10px; min-width:0; }.counter { font-size:12px; color:var(--yb-muted); text-align:right; }.error-row { display:flex; justify-content:space-between; gap:15px; align-items:center; }.carrier-skeleton { height:45px; }@media(max-width:700px) { .field-grid { grid-template-columns:1fr; } }
</style>
