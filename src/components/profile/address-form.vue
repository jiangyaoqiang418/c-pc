<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { prepareAddress } from '@/service/api/address';
interface Props {
  modelValue?: Partial<Api.RealAddress.AddressRecord>;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'submit', form: Omit<Api.RealAddress.AddressRecord, 'id' | 'createdAt' | 'updatedAt'>): void;
}>();

const form = reactive({
  receiverName: '',
  receiverPhone: '',
  country: '中国',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false
});

function sync() {
  if (props.modelValue) {
    form.receiverName = props.modelValue.receiverName || '';
    form.receiverPhone = props.modelValue.receiverPhone || '';
    form.country = props.modelValue.country || '中国';
    form.province = props.modelValue.province || '';
    form.city = props.modelValue.city || '';
    form.district = props.modelValue.district || '';
    form.detail = props.modelValue.detail || '';
    form.isDefault = !!props.modelValue.isDefault;
  }
}
watch(() => props.modelValue, sync, { immediate: true });

const prepared = computed(() => prepareAddress({ ...form, detailAddress: form.detail }));
const canSubmit = computed(() => !prepared.value.error);

function submit() {
  if (props.submitting) return;
  if (!canSubmit.value) {
    Message.warning(prepared.value.error);
    return;
  }
  const values = prepared.value.params;
  emit('submit', { ...form, receiverName: values.receiverName, receiverPhone: values.receiverPhone,
    country: values.country, province: values.province || '', city: values.city || '', district: values.district || '', detail: values.detailAddress });
}
</script>

<template>
  <a-form :model="form" layout="vertical">
    <a-row :gutter="12">
      <a-col :span="12">
        <a-form-item label="收货人" required>
          <a-input v-model="form.receiverName" placeholder="姓名" />
        </a-form-item>
      </a-col>
      <a-col :span="12">
        <a-form-item label="手机号" required>
          <a-input v-model="form.receiverPhone" placeholder="收件人电话，可含国家/地区区号" :max-length="32" />
        </a-form-item>
      </a-col>
    </a-row>
    <a-form-item label="国家/地区" required>
      <a-input v-model="form.country" placeholder="如 中国" />
    </a-form-item>
    <a-row :gutter="12">
      <a-col :span="8">
        <a-form-item label="省" required>
          <a-input v-model="form.province" placeholder="如 北京市" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="市">
          <a-input v-model="form.city" placeholder="如 北京市" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="区/县">
          <a-input v-model="form.district" placeholder="如 朝阳区" />
        </a-form-item>
      </a-col>
    </a-row>
    <a-form-item label="详细地址" required>
      <a-textarea v-model="form.detail" :rows="2" placeholder="街道、门牌号、楼层" />
    </a-form-item>
    <a-form-item>
      <a-checkbox v-model="form.isDefault">设为默认地址</a-checkbox>
    </a-form-item>
    <div class="actions">
      <a-button type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">保存</a-button>
    </div>
  </a-form>
</template>

<style scoped>
.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
