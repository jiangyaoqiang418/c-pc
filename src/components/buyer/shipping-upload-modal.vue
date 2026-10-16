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
import { useUserStore } from '@/stores';
import { getOrderCapabilities } from '@/utils/order';

interface Props {
  visible: boolean;
  order?: Api.RealOrder.Record;
  submitting?: boolean;
  mode?: 'shipping' | 'procure';
}
const props = defineProps<Props>();
const userStore = useUserStore();
const uploadContext = computed(() => `${String(props.order?.id)}:${props.mode}:${props.visible}:${userStore.sessionVersion}:${userStore.currentAudience}`);
const uploadStates = reactive({ purchase: false, shipping: false });
const uploading = computed(() => uploadStates.purchase || uploadStates.shipping);
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', params: Api.RealOrder.OrderShipParams): void;
  (e: 'procure', params: Api.RealOrder.OrderProcureParams): void;
}>();
const procurement = computed(() => props.mode === 'procure');

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
  [() => props.visible, () => props.order?.id, () => props.mode, () => userStore.sessionVersion, () => userStore.currentAudience],
  ([v]) => {
    carrierGuard.invalidate();
    carrierLoading.value = false;
    uploadStates.purchase = false;
    uploadStates.shipping = false;
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
      if (!procurement.value) void loadCarriers();
    }
  }, { immediate: true }
);

function submit() {
  if (!props.visible || !props.order || props.submitting || uploading.value || !userStore.isBuyerActive) return false;
  const permissions = getOrderCapabilities(props.order, userStore.currentUser?.id);
  if (procurement.value ? !permissions.procure : !permissions.ship) return false;
  if (procurement.value) {
    if (!form.purchaseNo.trim() || form.purchaseNo.trim().length > 128) {
      Message.warning('请填写采购单号，最多128字符');
      return false;
    }
    if (form.purchaseVouchers.length < 1 || form.purchaseVouchers.length > 6
      || form.purchaseVouchers.some(url => url.length > 1024 || !/^https:\/\/[^\s]+$/.test(url))) {
      Message.warning('请上传1至6张HTTPS采购凭证');
      return false;
    }
    emit('procure', { id: props.order.id, purchaseNo: form.purchaseNo.trim(), purchaseVouchers: [...form.purchaseVouchers] });
    return false;
  }
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
    shipVouchers: [...form.shipVouchers],
    remark: form.remark.trim() || undefined
  });
  // 成功后由父页面关闭；校验失败或接口失败保留当前表单。
  return false;
}


</script>

<template>
  <a-modal content-class="buyer-dialog buyer-dialog-wide" :visible="visible" :title="procurement ? '完成采购' : '填写发货信息'" :width="740" :ok-loading="props.submitting" :ok-button-props="{ disabled: uploading || (!procurement && (carrierLoading || !!carrierError || !selectedCarrier)) }" :closable="!submitting && !uploading" :mask-closable="!submitting && !uploading" :esc-to-close="!submitting && !uploading" :on-before-cancel="() => !submitting && !uploading" :ok-text="procurement ? '确认采购完成' : '确认发货'" @update:visible="(value: boolean) => emit('update:visible', value)" :on-before-ok="submit">
    <template v-if="order"><p class="order-hint">订单 {{ order.code }} · {{ order.productTitle }}</p><Alert class="shipping-note"><AlertDescription>{{ procurement ? '提交真实采购单号和凭证后，订单进入待发货阶段。采购完成后不能更换这套凭证。' : '填写真实物流信息后订单状态变为「运输中」，平台将开始拉取物流轨迹。' }}</AlertDescription></Alert>
      <div class="shipping-form"><Alert v-if="!procurement && carrierError" variant="destructive"><AlertDescription class="error-row"><span>{{ carrierError }}</span><Button class="outline" type="button" variant="outline" size="sm" :disabled="carrierLoading || submitting" @click="loadCarriers">重新加载</Button></AlertDescription></Alert>
        <fieldset v-if="!procurement" class="carrier-field" :disabled="submitting || carrierLoading"><legend>物流公司 <span>*</span></legend><Skeleton v-if="carrierLoading" class="carrier-skeleton" /><div v-else class="carrier-options"><label v-for="carrier in carriers" :key="carrier.code" :class="{ selected: form.carrier === carrier.code }"><input v-model="form.carrier" type="radio" :name="'shipping-carrier-' + String(order.id)" :value="carrier.code" /><span>{{ carrier.name }}</span></label></div></fieldset>
        <div v-if="!procurement" class="buyer-two-cols"><div class="buyer-field"><Label for="shipping-tracking">运单号 <span>*</span></Label><Input id="shipping-tracking" v-model="form.trackingNumber" :disabled="submitting" placeholder="请输入运单号" /></div><div v-if="selectedCarrier?.customNameRequired" class="buyer-field"><Label for="shipping-carrier-name">承运商名称 <span>*</span></Label><Input id="shipping-carrier-name" v-model="form.carrierName" :disabled="submitting" placeholder="请输入承运商名称" /></div><div class="buyer-field"><Label for="shipping-eta">预计送达时间</Label><DateTimeInput id="shipping-eta" v-model="form.eta" :disabled="submitting" /></div></div>
        <div v-if="procurement" class="buyer-field"><Label for="shipping-purchase-no">采购单号 <span>*</span></Label><Input id="shipping-purchase-no" v-model="form.purchaseNo" :disabled="submitting" maxlength="128" placeholder="请输入真实采购单号" /></div><div v-if="procurement" class="buyer-field"><Label>采购凭证 <span>*</span></Label><AftersaleEvidenceUploader :key="'purchase:' + uploadContext" v-model="form.purchaseVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.purchase = $event" /></div><div v-if="!procurement" class="buyer-field"><Label>发货凭证</Label><AftersaleEvidenceUploader :key="'shipping:' + uploadContext" v-model="form.shipVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.shipping = $event" /></div><div v-if="!procurement" class="buyer-field"><Label for="shipping-remark">发货备注</Label><Textarea id="shipping-remark" v-model="form.remark" :disabled="submitting" maxlength="500" :rows="3" placeholder="选填，请填写发货备注" /><small class="counter">{{ form.remark.length }}/500</small></div>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
.order-hint { margin-bottom:18px; color:var(--muted); overflow-wrap:anywhere; }
.shipping-note { margin-bottom:20px; }
.carrier-field { margin:0 0 20px; padding:0; border:0; min-width:0; }
.carrier-field legend { margin-bottom:12px; }
.carrier-options { display:flex; flex-wrap:wrap; gap:10px; }
.carrier-options label { display:flex; align-items:center; gap:8px; padding:11px 14px; border:1px solid var(--line); border-radius:7px; cursor:pointer; }
.carrier-options label.selected { background:var(--soft); border-color:var(--green); color:var(--green); }
.carrier-field:disabled label { opacity:.55; cursor:not-allowed; }
.counter { text-align:right; color:var(--muted); }
.error-row { display:flex; justify-content:space-between; gap:15px; align-items:center; }
.carrier-skeleton { height:45px; }
</style>
