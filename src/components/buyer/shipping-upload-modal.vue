<script setup lang="ts">
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import DateTimeInput from '@/components/common/date-time-input.vue';
import LogisticsCarrierFields from '@/components/common/logistics-carrier-fields.vue';
import { computed, reactive, ref, watch } from 'vue';
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

const carrierValid = ref(false);

watch(
  [() => props.visible, () => props.order?.id, () => props.mode, () => userStore.sessionVersion, () => userStore.currentAudience],
  ([v]) => {
    carrierValid.value = false;
    uploadStates.purchase = false;
    uploadStates.shipping = false;
    if (v) {
      form.carrier = '';
      form.carrierName = '';
      form.trackingNumber = '';
      form.eta = '';
      form.purchaseNo = '';
      form.purchaseVouchers = [];
      form.shipVouchers = [];
      form.remark = '';
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
  if (!carrierValid.value) {
    Message.warning('请填写运单号并确认物流公司，其他承运商需填写名称');
    return false;
  }
  emit('confirm', {
    id: props.order.id,
    carrier: form.carrier,
    carrierName: form.carrierName.trim() || undefined,
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
  <a-modal content-class="buyer-dialog buyer-dialog-wide" :visible="visible" :title="procurement ? '完成采购' : '填写发货信息'" :width="740" :ok-loading="props.submitting" :ok-button-props="{ disabled: uploading || (!procurement && !carrierValid) }" :closable="!submitting && !uploading" :mask-closable="!submitting && !uploading" :esc-to-close="!submitting && !uploading" :on-before-cancel="() => !submitting && !uploading" :ok-text="procurement ? '确认采购完成' : '确认发货'" @update:visible="(value: boolean) => emit('update:visible', value)" :on-before-ok="submit">
    <template v-if="order"><p class="order-hint">订单 {{ order.code }} · {{ order.productTitle }}</p><Alert class="shipping-note"><AlertDescription>{{ procurement ? '提交真实采购单号和凭证后，订单进入待发货阶段。采购完成后不能更换这套凭证。' : '填写真实物流信息后订单状态变为「运输中」，平台将开始拉取物流轨迹。' }}</AlertDescription></Alert>
      <div class="shipping-form">
        <LogisticsCarrierFields v-if="!procurement" v-model:tracking-no="form.trackingNumber" v-model:carrier-code="form.carrier" v-model:carrier-name="form.carrierName" :context-key="'shipping:' + uploadContext" :active="visible && !procurement" :disabled="submitting" @valid="carrierValid = $event" />
        <div v-if="!procurement" class="buyer-field"><Label for="shipping-eta">预计送达时间</Label><DateTimeInput hour-only id="shipping-eta" v-model="form.eta" :disabled="submitting" /></div>
        <div v-if="procurement" class="buyer-field"><Label for="shipping-purchase-no">采购单号 <span>*</span></Label><Input id="shipping-purchase-no" v-model="form.purchaseNo" :disabled="submitting" maxlength="128" placeholder="请输入真实采购单号" /></div><div v-if="procurement" class="buyer-field"><Label>采购凭证 <span>*</span></Label><AftersaleEvidenceUploader :key="'purchase:' + uploadContext" v-model="form.purchaseVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.purchase = $event" /></div><div v-if="!procurement" class="buyer-field"><Label>发货凭证</Label><AftersaleEvidenceUploader :key="'shipping:' + uploadContext" v-model="form.shipVouchers" scene="ORDER_VOUCHER" :max="6" :disabled="submitting" @uploading="uploadStates.shipping = $event" /></div><div v-if="!procurement" class="buyer-field"><Label for="shipping-remark">发货备注</Label><Textarea id="shipping-remark" v-model="form.remark" :disabled="submitting" maxlength="500" :rows="3" placeholder="选填，请填写发货备注" /><small class="counter">{{ form.remark.length }}/500</small></div>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
.order-hint { margin-bottom:18px; color:var(--muted); overflow-wrap:anywhere; }
.shipping-note { margin-bottom:20px; }
.counter { text-align:right; color:var(--muted); }
</style>
