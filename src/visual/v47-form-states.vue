<script setup lang="ts">
// Imported only by visual-v47.ts. All dictionaries, files and actions stay local.
import { computed, onBeforeUnmount, ref } from 'vue';
import AddressForm from '@/components/profile/address-form.vue';
import BusinessDialog from '@/components/common/business-dialog.vue';
import AftersaleRequestFields from '@/components/aftersale/aftersale-request-fields.vue';
import { Message, Modal } from '@/lib/feedback';
import type { AddressVisualFixture, EvidenceVisualFixture } from './types';

const props = defineProps<{ images: string[] }>();
const addressOpen = ref(false);
const addressVersion = ref(0);
const addressBusy = ref(false);
const dictionaryError = ref(false);
const address = ref<Partial<Api.RealAddress.AddressRecord>>();
const addressResult = ref('');
const addressFixture: AddressVisualFixture = {
  async countries() {
    if (dictionaryError.value) throw new Error('local dictionary failure');
    return [
      { code:'CN', name:'中国大陆', enName:'China', hasRegion:true },
      { code:'JP', name:'日本', enName:'Japan', hasRegion:false },
      { code:'NZ', name:'新西兰', enName:'New Zealand', hasRegion:false }
    ];
  },
  async regions(countryCode, parentCode) {
    if (countryCode !== 'CN') return [];
    if (!parentCode) return [{ code:'320000', name:'江苏省', level:1, leaf:false }, { code:'110000', name:'北京市', level:1, leaf:true }];
    if (parentCode === '320000') return [{ code:'320100', name:'南京市', level:2, parentCode, leaf:false }];
    if (parentCode === '320100') return [{ code:'320102', name:'玄武区', level:3, parentCode, leaf:true }];
    return [];
  }
};
function openAddress(mode: 'add' | 'edit' | 'error' | 'busy') {
  dictionaryError.value = mode === 'error';
  addressBusy.value = mode === 'busy';
  addressResult.value = '';
  address.value = mode === 'edit' ? {
    id:'visual-address-only', receiverName:'本地验收样例', receiverPhone:'00000000000', countryCode:'CN',
    provinceCode:'320000', cityCode:'320100', districtCode:'320102',
    detail:'仅用于界面验收的长地址。'.repeat(18), postalCode:'000000', isDefault:true
  } : undefined;
  addressVersion.value += 1;
  addressOpen.value = true;
}
function receiveAddress(params: Api.RealAddress.AddressSaveParams) {
  addressResult.value = JSON.stringify(params);
}

const reason = ref('');
const evidence = ref<string[]>([]);
const eligible = ref(true);
const busy = ref(false);
const uploading = ref(false);
const confirmationOpen = ref(false);
const uploadFailure = ref(false);
const holdUploads = ref(false);
const pendingUploads: (() => void)[] = [];
const cancelled = ref(0);
let confirmation: ReturnType<typeof Modal.confirm> | undefined;
const disabledReason = computed(() => busy.value || confirmationOpen.value ? '正在处理原申请，请稍候'
  : uploading.value ? '请等待凭证上传完成' : !eligible.value ? '仅待发货或待收货订单可申请仅退款' : '');
const evidenceFixture: EvidenceVisualFixture = {
  async upload(file) {
    if (holdUploads.value) await new Promise<void>(resolve => { pendingUploads.push(resolve); });
    if (uploadFailure.value) throw new Error('local upload failure');
    return { id:'visual-file-only', bucket:'visual-only', filePath:'visual-only', url:props.images[0]!, originalName:file.name };
  }
};
function confirmRefund() {
  if (disabledReason.value) return;
  if (!reason.value.trim()) { Message.warning('请填写退款原因'); return; }
  confirmationOpen.value = true;
  confirmation = Modal.confirm({ title:'确认申请仅退款？',
    content:'申请提交后由买手确认意见，再由平台审核；平台审核通过后退款会原路退回钱包。', okText:'提交申请',
    onBeforeOk:() => { Message.info('本地验收不提交退款，请取消返回。'); return false; },
    onCancel:() => { confirmationOpen.value = false; }, onClose:() => { confirmationOpen.value = false; }
  });
}
onBeforeUnmount(() => { confirmation?.close(); for (const complete of pendingUploads.splice(0)) complete(); });
</script>

<template>
  <div class="visual-form-states">
    <section class="buyer-panel local-controls" aria-label="本地表单验收控制">
      <h1>本地表单验收</h1><p>隔离字典与图片，仅检查组件，不读取账号，不保存地址或提交退款。</p>
      <div class="button-row">
        <button type="button" class="outline" @click="openAddress('add')">打开新增地址</button>
        <button type="button" class="outline" @click="openAddress('edit')">打开长地址编辑</button>
        <button type="button" class="outline" @click="openAddress('error')">打开字典失败态</button>
        <button type="button" class="outline" @click="openAddress('busy')">打开地址忙碌态</button>
      </div>
      <output aria-label="本地地址参数">{{ addressResult }}</output>
      <div class="button-row">
        <button type="button" class="outline" @click="eligible = !eligible">{{ eligible ? '模拟不可申请' : '恢复可申请' }}</button>
        <button type="button" class="outline" @click="busy = !busy">{{ busy ? '解除本地处理中' : '模拟本地处理中' }}</button>
        <button type="button" class="outline" @click="uploadFailure = !uploadFailure">{{ uploadFailure ? '恢复本地上传' : '模拟上传失败' }}</button>
        <button type="button" class="outline" @click="holdUploads = !holdUploads">{{ holdUploads ? '关闭上传等待' : '开启上传等待' }}</button>
        <button type="button" class="outline" @click="pendingUploads.splice(0).forEach(complete => complete())">完成本地上传</button>
        <button type="button" class="outline" :disabled="busy || confirmationOpen" @click="evidence = [...images]">填入六张样例凭证</button>
      </div>
      <output aria-label="本地售后状态">{{ JSON.stringify({ reason, evidenceCount:evidence.length, cancelled, uploading }) }}</output>
    </section>
    <section class="paper narrow" aria-label="本地售后表单">
      <h1>申请仅退款</h1><p>待发货或待收货订单可申请，由平台审核。</p>
      <p v-if="!eligible" id="refund-unavailable" class="error-text">仅“待发货”或“待收货”订单可申请仅退款。</p>
      <AftersaleRequestFields v-model:reason="reason" v-model:evidence-images="evidence" :eligible="eligible" :submitting="busy" :confirmation-open="confirmationOpen" :submit-disabled-reason="disabledReason" evidence-context="visual-only" :evidence-visual-fixture="evidenceFixture" @uploading="uploading = $event" @submit="confirmRefund" @cancel="cancelled += 1" />
    </section>
    <BusinessDialog v-model:visible="addressOpen" :title="address?.id ? '编辑收货地址' : '添加收货地址'" :width="540" :footer="false" :mask-closable="!addressBusy" :esc-to-close="!addressBusy" :closable="!addressBusy">
      <button v-if="addressBusy" type="button" class="outline" @click="addressBusy = false">解除本地地址忙碌</button>
      <AddressForm :key="addressVersion" v47 :model-value="address" :submitting="addressBusy" :visual-fixture="addressFixture" @submit="receiveAddress" />
    </BusinessDialog>
  </div>
</template>

<style scoped>
.local-controls { margin-bottom:24px; }
.local-controls .button-row { flex-wrap:wrap; margin-top:12px; }
.local-controls output { display:block; overflow-wrap:anywhere; }
</style>
