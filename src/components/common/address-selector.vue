<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Message } from '@/lib/feedback';
import * as realAddressApi from '@/service/api/address';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { RequestError } from '@/service/request';
import AddressForm from '@/components/profile/address-form.vue';

interface Props {
  modelValue?: string | number;
  userId: string | number;
}
const props = defineProps<Props>();
const groupId = useId();
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

function openAdd() {
  if (submitting.value) return;
  modalOpen.value = true;
}

async function submit(params: Api.RealAddress.AddressSaveParams) {
  if (submitting.value) return false;
  const userId = String(props.userId);
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(props.userId) === userId;
  submitting.value = true;
  try {
    try {
      const createdId = await realAddressApi.createAddress(params);
      if (!isCurrentWrite()) return false;
      pendingCreatedId.value = createdId;
      emit('update:modelValue', createdId);
      emit('changed', undefined);
      Message.success('地址已添加');
      await load();
      if (!isCurrentWrite()) return false;
      if (loadError.value) Message.warning('地址已添加，但列表读取未完成，请重新加载核对');
      modalOpen.value = false;
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
  <div class="address-selector" :aria-busy="loading">
    <Alert v-if="loadError" variant="destructive" class="address-error"><AlertDescription>{{ loadError }}</AlertDescription><Button variant="outline" size="sm" :disabled="loading" @click="load">重新加载</Button></Alert>
    <div v-if="loading && !list.length" class="address-list" aria-label="正在读取收货地址"><Skeleton v-for="i in 2" :key="i" class="address-skeleton" /></div>
    <fieldset v-else class="address-list" :disabled="loading || !!loadError">
      <legend class="sr-only">选择收货地址</legend>
      <label v-for="a in list" :key="a.id" class="address-row" :class="{ active: isSelected(a) }">
        <input type="radio" :name="groupId" :checked="isSelected(a)" :aria-label="`${a.receiverName}，${a.receiverPhone}，${a.detail}`" @change="onSelect(a)" />
        <div class="row-info"><div class="row-head"><span class="receiver">{{ a.receiverName }}</span><span class="phone">{{ a.receiverPhone }}</span><span v-if="a.isDefault" class="default-tag">默认地址</span><Icon v-if="isSelected(a)" icon="lucide:check" width="16" class="selected-icon" /></div><div class="row-detail">{{ a.country }} · {{ a.province }} · {{ a.city }} · {{ a.district }} · {{ a.detail }}</div></div>
      </label>
      <p v-if="!list.length && !loadError" class="no-address">还没有收货地址，请添加后继续结算。</p>
    </fieldset>
    <Button class="add-btn" variant="outline" :disabled="submitting || loading" @click="openAdd"><Icon icon="lucide:plus" width="16" />新增收货地址</Button>
    <a-modal v-model:visible="modalOpen" title="新增收货地址" :footer="false" :mask-closable="!submitting">
      <AddressForm :submitting="submitting" @submit="submit" />
    </a-modal>
  </div>
</template>

<style scoped>
.address-list { display: grid; gap: 12px; padding: 0; margin: 0; border: 0; }
.address-row { display: flex; align-items: flex-start; gap: 12px; padding: 18px; border: 1px solid var(--yb-hairline); border-radius: 8px; cursor: pointer; transition: background 150ms, border-color 150ms; }
.address-row:hover, .address-row.active { border-color: var(--yb-primary); background: var(--yb-primary-soft); }
.address-list:disabled .address-row { opacity: .55; cursor: not-allowed; }
.address-row:focus-within { outline: 2px solid var(--yb-primary); outline-offset: 2px; }
.address-row input { margin-top: 4px; width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--yb-primary); }
.row-info { min-width: 0; flex: 1; }
.row-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.receiver { font-size: 15px; font-weight: 600; }
.phone, .row-detail { color: var(--yb-muted); font-size: 13px; }
.row-detail { margin-top: 8px; overflow-wrap: anywhere; }
.default-tag { font-size: 12px; color: var(--yb-primary); border: 1px solid var(--yb-hairline); padding: 0 6px; border-radius: 4px; }
.selected-icon { margin-left: auto; color: var(--yb-primary); }
.add-btn { width: 100%; margin-top: 12px; border-style: dashed; }
.no-address { padding: 16px; margin: 0; font-size: 14px; color: var(--yb-muted); background: var(--yb-fill); border-radius: 8px; }
.address-skeleton { height: 96px; }
.address-error { margin-bottom: 12px; }
.address-error button { margin-top: 12px; }
@media (prefers-reduced-motion: reduce) { .address-row { transition: none; } }
</style>
