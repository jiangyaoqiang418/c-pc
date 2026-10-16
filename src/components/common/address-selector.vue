<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Message } from '@/lib/feedback';
import * as realAddressApi from '@/service/api/address';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { RequestError } from '@/service/request';
import AddressForm from '@/components/profile/address-form.vue';
import { useUserStore } from '@/stores/user';

interface Props {
  modelValue?: string | number;
  userId: string | number;
}
const props = defineProps<Props>();
const userStore = useUserStore();
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
const loadedSession = ref(-1);
const pendingCreatedId = ref<string | number>();
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
let writeVersion = 0;
const selectionValid = computed(() => !loading.value && !loadError.value
  && loadedSession.value === userStore.sessionVersion
  && loadedUserId.value === String(props.userId)
  && String(userStore.currentUser?.id) === String(props.userId)
  && list.value.some(address => isSelected(address)));
watch(selectionValid, valid => emit('validity', valid), { immediate: true, flush: 'sync' });

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = props.userId ? String(props.userId) : '';
  if (!userId || String(userStore.currentUser?.id) !== userId) {
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
    loadedSession.value = userStore.sessionVersion;
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
watch([() => props.userId, () => userStore.sessionVersion], (next, previous) => {
  if (String(next[0]) === String(previous[0]) && next[1] === previous[1]) return;
  writeVersion += 1;
  submitting.value = false;
  modalOpen.value = false;
  loadedUserId.value = '';
  loadedSession.value = -1;
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
  if (loading.value || loadError.value || loadedUserId.value !== String(props.userId)
    || loadedSession.value !== userStore.sessionVersion || String(userStore.currentUser?.id) !== String(props.userId)) return;
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
  if (submitting.value || String(userStore.currentUser?.id) !== String(props.userId)) return false;
  const userId = String(props.userId);
  const session = userStore.sessionVersion;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && userStore.sessionVersion === session
    && String(userStore.currentUser?.id) === userId && String(props.userId) === userId;
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
    <div class="section-heading"><slot name="heading" /><button type="button" class="text-link" :disabled="submitting || loading" @click="openAdd">＋ 新增地址</button></div>
    <Alert v-if="loadError" variant="destructive" class="address-error"><AlertDescription>{{ loadError }}</AlertDescription><button type="button" class="outline" :disabled="loading" @click="load">重新加载</button></Alert>
    <div v-if="loading && !list.length" class="address-list" aria-label="正在读取收货地址"><Skeleton v-for="i in 2" :key="i" class="address-skeleton" /></div>
    <fieldset v-else-if="list.length" class="address-list" :disabled="loading || !!loadError">
      <legend class="sr-only">选择收货地址</legend>
      <label v-for="a in list" :key="a.id" class="address-option" :class="{ active:isSelected(a) }"><input type="radio" :name="groupId" :checked="isSelected(a)" :aria-label="`${a.receiverName}，${a.receiverPhone}，${a.detail}`" @change="onSelect(a)" /><div><b>{{ a.receiverName }}</b> <span>{{ a.receiverPhone }}</span><small>{{ a.country }} {{ a.province }} {{ a.city }} {{ a.district }} {{ a.detail }}<template v-if="a.postalCode"> · {{ a.postalCode }}</template></small></div><span v-if="a.isDefault" class="pill">默认</span></label>
    </fieldset>
    <div v-else-if="!loadError" class="address-empty"><UmIcon name="pin" /><p>添加一个地址，让好物找到你。</p><button type="button" class="outline" :disabled="submitting || loading" @click="openAdd">添加收货地址</button></div>
    <a-modal v-model:visible="modalOpen" title="添加收货地址" :width="540" :footer="false" :mask-closable="!submitting" :esc-to-close="!submitting" :closable="!submitting"><AddressForm :key="String(userId) + ':' + userStore.sessionVersion + ':' + modalOpen" v47 :submitting="submitting" @submit="submit" /></a-modal>
  </div>
</template>

<style scoped>
.address-list { padding:0; margin:0; border:0; min-width:0; }.address-list:disabled .address-option { opacity:.55; cursor:not-allowed; }.address-option > input[type="radio"] { flex:0 0 15px; width:15px; height:15px; padding:0; }.address-option > div { flex:1; min-width:0; overflow-wrap:anywhere; }.address-option > .pill { flex-shrink:0; }.address-option small { overflow-wrap:anywhere; }.section-heading > .text-link { margin-left:auto; }.address-skeleton { height:96px; margin-bottom:12px; }.address-error { margin-bottom:12px; }.address-error button { margin-top:12px; }
</style>
