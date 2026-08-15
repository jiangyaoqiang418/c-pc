<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import * as realAddressApi from '@/service/api/address';

interface Props {
  modelValue?: string | number;
  userId: string | number;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number): void;
  (e: 'changed', addr: Api.RealAddress.AddressRecord): void;
}>();

const list = ref<Api.RealAddress.AddressRecord[]>([]);
const loading = ref(false);
const loadError = ref('');
const modalOpen = ref(false);
const submitting = ref(false);

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

async function load() {
  if (!props.userId) return;
  loading.value = true;
  loadError.value = '';
  try {
    list.value = await realAddressApi.fetchMyAddresses();
    if (list.value.length && props.modelValue == null) {
      const def = list.value.find(a => a.isDefault) || list.value[0];
      emit('update:modelValue', def.id);
      emit('changed', def);
    }
  } catch {
    list.value = [];
    loadError.value = '收货地址加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.userId, load);

function onSelect(addr: Api.RealAddress.AddressRecord) {
  emit('update:modelValue', addr.id);
  emit('changed', addr);
}

function isSelected(addr: Api.RealAddress.AddressRecord) {
  return props.modelValue !== undefined && props.modelValue !== null && String(props.modelValue) === String(addr.id);
}

function openAdd() {
  form.receiverName = '';
  form.receiverPhone = '';
  form.country = '中国';
  form.province = '';
  form.city = '';
  form.district = '';
  form.detail = '';
  form.isDefault = false;
  modalOpen.value = true;
}

async function submit() {
  if (!form.receiverName || !form.receiverPhone || !form.country || !form.province || !form.detail) {
    Message.warning('请完善地址信息');
    return;
  }
  submitting.value = true;
  try {
    try {
      const created = await realAddressApi.createAddress({
        receiverName: form.receiverName,
        receiverPhone: form.receiverPhone,
        country: form.country,
        province: form.province,
        city: form.city,
        district: form.district,
        detailAddress: form.detail,
        defaultFlag: form.isDefault
      });
      modalOpen.value = false;
      Message.success('地址已添加');
      await load();
      onSelect(created);
    } catch {
      // 请求层已展示错误，保留表单供用户修正后重试。
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="address-selector">
    <a-spin :loading="loading" style="width: 100%">
      <div class="address-list">
        <a-alert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
          <template #action><a-link @click="load">重新加载</a-link></template>
        </a-alert>
        <div
          v-for="a in list"
          :key="a.id"
          class="address-row"
          :class="{ active: isSelected(a) }"
          @click="onSelect(a)"
        >
          <div class="row-radio">
            <span class="radio-dot" :class="{ checked: isSelected(a) }" />
          </div>
          <div class="row-info">
            <div class="row-head">
              <span class="receiver">{{ a.receiverName }}</span>
              <span class="phone">{{ a.receiverPhone }}</span>
              <a-tag v-if="a.isDefault" color="arcoblue" size="small">默认</a-tag>
            </div>
            <div class="row-detail">{{ a.country }} · {{ a.province }} · {{ a.city }} · {{ a.district }} · {{ a.detail }}</div>
          </div>
        </div>
        <a-button class="add-btn" long type="dashed" @click="openAdd">+ 新增收货地址</a-button>
      </div>
    </a-spin>

    <a-modal v-model:visible="modalOpen" title="新增收货地址" :confirm-loading="submitting" @ok="submit">
      <a-form :model="form" layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="收货人" required>
              <a-input v-model="form.receiverName" placeholder="姓名" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="手机号" required>
              <a-input v-model="form.receiverPhone" placeholder="11 位手机号" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="国家/地区" required>
          <a-input v-model="form.country" placeholder="如 中国" />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="省" required>
              <a-input v-model="form.province" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="市">
              <a-input v-model="form.city" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="区/县">
              <a-input v-model="form.district" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="详细地址" required>
          <a-textarea v-model="form.detail" :rows="2" placeholder="街道、门牌号" />
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model="form.isDefault">设为默认地址</a-checkbox>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.address-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.address-row {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.address-row:hover {
  border-color: #94c1ff;
  background: #f7faff;
}
.address-row.active {
  border-color: var(--bw-brand-primary);
  background: #f3f7ff;
}
.row-radio {
  display: flex;
  align-items: center;
}
.radio-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid #c9cdd4;
  display: inline-block;
  position: relative;
}
.radio-dot.checked {
  border-color: var(--bw-brand-primary);
}
.radio-dot.checked::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bw-brand-primary);
}
.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.receiver {
  font-weight: 600;
  color: #1d2129;
}
.phone {
  color: #4e5969;
  font-size: 13px;
}
.row-detail {
  color: #4e5969;
  font-size: 13px;
  margin-top: 4px;
}
.add-btn {
  margin-top: 4px;
}
</style>
