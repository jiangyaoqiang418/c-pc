<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message, Modal } from '@/lib/feedback';
import * as realAddressApi from '@/service/api/address';
import AddressForm from '@/components/profile/address-form.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { RequestError } from '@/service/request';

const userStore = useUserStore();

const list = ref<Api.RealAddress.AddressRecord[]>([]);
const loading = ref(false);
const loadError = ref('');
const modalOpen = ref(false);
const editing = ref<Partial<Api.RealAddress.AddressRecord>>();
const submitting = ref(false);
const defaultingId = ref<string | number>();
const deletingId = ref<string | number>();
const deletionPending = ref(false);
const requestGuard = createLatestRequestGuard();
let defaultWriteVersion = 0;
let deleteWriteVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
let submitWriteVersion = 0;
let modalVersion = 0;
watch(modalOpen, () => { modalVersion += 1; }, { flush: 'sync' });

async function load() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    list.value = [];
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loading.value = true;
  loadError.value = '';
  try {
    const addresses = await realAddressApi.fetchMyAddresses({ signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    list.value = addresses;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    loadError.value = '地址列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  confirmationModal?.close();
  defaultWriteVersion += 1;
  deleteWriteVersion += 1;
  submitWriteVersion += 1;
  requestGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  confirmationModal?.close();
  defaultWriteVersion += 1;
  deleteWriteVersion += 1;
  submitWriteVersion += 1;
  submitting.value = false;
  defaultingId.value = undefined;
  deletingId.value = undefined;
  deletionPending.value = false;
  modalOpen.value = false;
  editing.value = undefined;
  list.value = [];
  void load();
});

function openAdd() {
  modalVersion += 1;
  editing.value = {};
  modalOpen.value = true;
}

function openEdit(a: Api.RealAddress.AddressRecord) {
  modalVersion += 1;
  editing.value = { ...a };
  modalOpen.value = true;
}

async function setDefault(a: Api.RealAddress.AddressRecord) {
  if (defaultingId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const addressId = a.id;
  const operation = ++defaultWriteVersion;
  const isCurrentWrite = () => operation === defaultWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  defaultingId.value = a.id;
  try {
    await realAddressApi.setDefaultAddress(addressId);
    if (!isCurrentWrite()) return;
    Message.success('已设为默认');
    await load();
  } catch {
    // 请求层已展示错误，保留当前默认地址状态供用户重试。
  } finally {
    if (operation === defaultWriteVersion) defaultingId.value = undefined;
  }
}

function onDelete(a: Api.RealAddress.AddressRecord) {
  if (deletingId.value !== undefined || deletionPending.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const addressId = a.id;
  const operation = ++deleteWriteVersion;
  const isCurrentWrite = () => operation === deleteWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  deletionPending.value = true;
  confirmationModal = Modal.confirm({
    title: '删除地址？',
    content: `${a.receiverName} · ${a.detail}`,
    okText: '确认删除',
    okButtonProps: { status: 'danger' },
    onCancel() {
      if (!isCurrentWrite()) return;
      deleteWriteVersion += 1;
      deletionPending.value = false;
    },
    async onOk() {
      if (!isCurrentWrite()) {
        return;
      }
      deletingId.value = addressId;
      try {
        await realAddressApi.deleteAddress(addressId);
        if (!isCurrentWrite()) return;
        Message.success('已删除');
        await load();
      } catch {
        // 请求层已展示错误，保留当前地址，避免删除失败却从页面消失。
      } finally {
        if (operation === deleteWriteVersion) {
          deletingId.value = undefined;
          deletionPending.value = false;
        }
      }
    }
  });
}

async function onSubmit(form: Api.RealAddress.AddressSaveParams) {
  if (!userStore.currentUser || submitting.value) return;
  const requestedUserId = userStore.currentUser.id;
  const operation = ++submitWriteVersion;
  const isCurrentWrite = () => operation === submitWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  const editingId = editing.value?.id;
  const submittedModalVersion = modalVersion;
  submitting.value = true;
  try {
    const params: Api.RealAddress.AddressSaveParams = { ...form, id: editing.value?.id };
    try {
      if (editingId) await realAddressApi.updateAddress(params);
      else await realAddressApi.createAddress(params);
      if (!isCurrentWrite()) return;
      Message.success(editingId ? '已更新' : '已添加');
      if (submittedModalVersion === modalVersion) modalOpen.value = false;
      await load();
      if (isCurrentWrite() && loadError.value) Message.warning('地址已保存，但列表读取失败，请重新加载，勿重复新增');
    } catch (error) {
      if (error instanceof RequestError && error.code === 'UNKNOWN_OPERATION_RESULT') Message.warning(error.message);
      // 普通业务错误由请求层展示；缺失成功编号需在页面明确提示核实。
    }
  } finally {
    if (operation === submitWriteVersion) submitting.value = false;
  }
}


</script>

<template>
  <div class="address-page">
    <div class="page-heading compact"><h1>收货地址</h1></div>
    <div class="section-heading"><span>{{ loading ? '正在读取收货地址…' : loadError ? '地址读取失败' : `${list.length} 个收货地址` }}</span><button type="button" class="primary" :disabled="submitting || deletionPending" @click="openAdd">＋ 新增地址</button></div>
    <section :aria-busy="loading" aria-label="收货地址列表">
      <div v-if="loading && !list.length" class="address-grid"><Skeleton v-for="n in 4" :key="n" class="address-loading" /></div>
      <div v-else-if="loadError" class="empty paper" role="alert"><UmIcon name="pin" /><h2>收货地址读取失败</h2><p>{{ loadError }}</p><button type="button" class="primary" @click="load">重新加载</button></div>
      <div v-else class="address-grid" :class="{ refreshing: loading }">
        <article v-for="a in list" :key="a.id" class="paper address-card">
          <span v-if="a.isDefault" class="pill">默认地址</span>
          <h3>{{ a.receiverName }} <small>{{ a.receiverPhone }}</small></h3>
          <p>{{ a.country }} {{ a.province }} {{ a.city }} {{ a.district }}<br />{{ a.detail }}<template v-if="a.postalCode"><br />{{ a.postalCode }}</template></p>
          <div class="button-row">
            <button type="button" :disabled="submitting || deletionPending" @click="openEdit(a)"><UmIcon name="edit" />编辑</button>
            <button v-if="!a.isDefault" type="button" :disabled="defaultingId !== undefined || loading" @click="setDefault(a)">{{ defaultingId === a.id ? '设置中…' : '设为默认' }}</button>
            <button type="button" :disabled="deletingId !== undefined || deletionPending || loading" @click="onDelete(a)">{{ deletingId === a.id ? '删除中…' : '删除' }}</button>
          </div>
        </article>
        <button type="button" class="add-address" :disabled="submitting || deletionPending || loading" @click="openAdd"><UmIcon name="plus" />添加一个新地址</button>
      </div>
    </section>
    <AModal v-model:visible="modalOpen" :title="editing?.id ? '编辑收货地址' : '添加收货地址'" :footer="false" :width="540" :mask-closable="!submitting" :esc-to-close="!submitting" :closable="!submitting"><AddressForm :key="modalVersion" v47 :model-value="editing" :submitting="submitting" @submit="onSubmit" /></AModal>
  </div>
</template>

<style scoped>
.address-card h3,.address-card p { overflow-wrap:anywhere; }
.address-card .button-row { flex-wrap:wrap; }
.address-card .button-row button { display:inline-flex; align-items:center; gap:6px; }
.address-loading { height:215px; border-radius:10px; }
.refreshing { opacity:.65; }
</style>
