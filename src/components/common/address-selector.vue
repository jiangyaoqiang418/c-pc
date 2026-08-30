<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import * as realAddressApi from '@/service/api/address';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { RequestError } from '@/service/request';

interface Props {
  modelValue?: string | number;
  userId: string | number;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number | undefined): void;
  (e: 'changed', addr: Api.RealAddress.AddressRecord | undefined): void;
  (e: 'validity', valid: boolean): void;
  (e: 'initialized', id: string | number | undefined): void;
}>();

const list = ref<Api.RealAddress.AddressRecord[]>([]);
const loading = ref(false);
const loadError = ref('');
const modalOpen = ref(false);
const submitting = ref(false);
const loadedUserId = ref('');
const pendingCreatedId = ref<string | number>();
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
const selectionValid = computed(() => !loading.value && !loadError.value
  && loadedUserId.value === String(props.userId)
  && list.value.some(address => isSelected(address)));
watch(selectionValid, valid => emit('validity', valid), { immediate: true, flush: 'sync' });

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
  const isCurrent = requestGuard.begin();
  const userId = props.userId ? String(props.userId) : '';
  if (!userId) {
    list.value = [];
    loadedUserId.value = '';
    loading.value = false;
    loadError.value = '';
    return;
  }
  if (loadedUserId.value !== userId) list.value = [];
  loading.value = true;
  loadError.value = '';
  try {
    const next = await realAddressApi.fetchMyAddresses({ signal: isCurrent.signal });
    if (!isCurrent() || String(props.userId) !== userId) return;
    list.value = next;
    loadedUserId.value = userId;
    const selected = pendingCreatedId.value !== undefined
      ? next.find(address => String(address.id) === String(pendingCreatedId.value))
      : next.find(address => isSelected(address)) || next.find(a => a.isDefault) || next[0];
    if (pendingCreatedId.value !== undefined && !selected) {
      loadError.value = '地址已添加，但列表尚未返回新地址，请重新加载核对，勿重复新增。';
      return;
    }
    pendingCreatedId.value = undefined;
    const initializingSelection = props.modelValue === undefined;
    emit('update:modelValue', selected?.id);
    if (initializingSelection) emit('initialized', selected?.id);
    emit('changed', selected);
  } catch {
    if (!isCurrent() || String(props.userId) !== userId) return;
    loadError.value = '收货地址加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent() && String(props.userId) === userId) loading.value = false;
  }
}

onMounted(load);
watch(() => props.userId, (next, previous) => {
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  submitting.value = false;
  modalOpen.value = false;
  resetForm();
  loadedUserId.value = '';
  pendingCreatedId.value = undefined;
  list.value = [];
  emit('update:modelValue', undefined);
  emit('changed', undefined);
  void load();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});

function onSelect(addr: Api.RealAddress.AddressRecord) {
  if (loading.value || loadError.value || loadedUserId.value !== String(props.userId)) return;
  if (!list.value.some(item => String(item.id) === String(addr.id))) return;
  emit('update:modelValue', addr.id);
  emit('changed', addr);
}

function isSelected(addr: Api.RealAddress.AddressRecord) {
  return props.modelValue !== undefined && props.modelValue !== null && String(props.modelValue) === String(addr.id);
}

function resetForm() {
  form.receiverName = '';
  form.receiverPhone = '';
  form.country = '中国';
  form.province = '';
  form.city = '';
  form.district = '';
  form.detail = '';
  form.isDefault = false;
}

function openAdd() {
  if (submitting.value) return;
  resetForm();
  modalOpen.value = true;
}

async function submit() {
  if (submitting.value) return false;
  const prepared = realAddressApi.prepareAddress({ receiverName: form.receiverName, receiverPhone: form.receiverPhone,
    country: form.country, province: form.province, city: form.city, district: form.district,
    detailAddress: form.detail, defaultFlag: form.isDefault });
  if (prepared.error) {
    Message.warning(prepared.error);
    return false;
  }
  const userId = String(props.userId);
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(props.userId) === userId;
  submitting.value = true;
  try {
    try {
      const createdId = await realAddressApi.createAddress(prepared.params);
      if (!isCurrentWrite()) return false;
      pendingCreatedId.value = createdId;
      emit('update:modelValue', createdId);
      emit('changed', undefined);
      Message.success('地址已添加');
      await load();
      if (!isCurrentWrite()) return false;
      if (loadError.value) Message.warning('地址已添加，但列表读取未完成，请重新加载核对');
      return true;
    } catch (error) {
      if (error instanceof RequestError && error.code === 'UNKNOWN_OPERATION_RESULT') Message.warning(error.message);
      // 普通业务错误由请求层展示；缺失成功编号需在页面明确提示核实。
      return false;
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="address-selector">
    <a-spin :loading="loading" style="width: 100%">
      <div class="address-list" role="radiogroup" aria-label="收货地址">
        <a-alert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
          <template #action><a-link role="button" tabindex="0" @click="load" @keydown.enter="load" @keydown.space.prevent="load">重新加载</a-link></template>
        </a-alert>
        <div
          v-for="a in list"
          :key="a.id"
          class="address-row"
          :class="{ active: isSelected(a) }"
          role="radio"
          tabindex="0"
          :aria-checked="isSelected(a)"
          :aria-label="`${a.receiverName}，${a.receiverPhone}，${a.detail}`"
          @click="onSelect(a)"
          @keydown.enter="onSelect(a)"
          @keydown.space.prevent="onSelect(a)"
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

    <a-modal v-model:visible="modalOpen" title="新增收货地址" :ok-loading="submitting" :on-before-ok="submit">
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
.address-row:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
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
