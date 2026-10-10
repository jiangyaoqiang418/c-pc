<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message, Modal } from '@/lib/feedback';
import * as realAddressApi from '@/service/api/address';
import AddressForm from '@/components/profile/address-form.vue';
import EmptyState from '@/components/common/empty-state.vue';
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
  <div class="address-page shop-container">
    <header class="page-head"><div><span class="eyebrow">DELIVERY ADDRESS</span><h1>地址管理</h1></div><Button :disabled="submitting || deletionPending" @click="openAdd"><Icon icon="lucide:plus" width="18" />新增地址</Button></header>
    <section :aria-busy="loading" aria-label="收货地址列表">
      <div v-if="loading && !list.length" class="grid"><Skeleton v-for="n in 4" :key="n" class="address-loading" /></div>
      <div v-else-if="list.length" class="grid" :class="{ refreshing: loading }">
        <article v-for="a in list" :key="a.id" class="addr-card" :class="{ default: a.isDefault }"><header class="head"><div><strong>{{ a.receiverName }}</strong><span>{{ a.receiverPhone }}</span></div><small v-if="a.isDefault" class="default-tag">默认地址</small></header><p>{{ a.country }} {{ a.province }} {{ a.city }} {{ a.district }} {{ a.detail }}</p><footer class="actions"><Button v-if="!a.isDefault" size="sm" variant="ghost" :disabled="defaultingId !== undefined || loading" @click="setDefault(a)">{{ defaultingId === a.id ? '设置中…' : '设为默认' }}</Button><Button size="sm" variant="outline" :disabled="submitting || deletionPending" @click="openEdit(a)">编辑</Button><Button size="sm" variant="outline" class="danger" :disabled="deletingId !== undefined || deletionPending || loading" @click="onDelete(a)">{{ deletingId === a.id ? '删除中…' : '删除' }}</Button></footer></article>
        <button type="button" class="add-address-tile" :disabled="submitting || deletionPending || loading" @click="openAdd"><Icon icon="lucide:plus" width="28" /><span>新增收货地址</span></button>
      </div>
      <EmptyState v-else :title="loadError || '还没有收货地址'" :description="loadError ? '请稍后重试。' : '添加地址后下单更快捷'" :action-text="loadError ? '重新加载' : '新增地址'" @action="loadError ? load() : openAdd()" />
    </section>
    <AModal v-model:visible="modalOpen" :title="editing?.id ? '编辑地址' : '新增地址'" :footer="false" :width="640" :mask-closable="!submitting" :esc-to-close="!submitting" :closable="!submitting"><AddressForm :key="modalVersion" :model-value="editing" :submitting="submitting" @submit="onSubmit" /></AModal>
  </div>
</template>

<style scoped>
.add-address-tile { display:grid; align-content:center; justify-items:center; gap:14px; min-height:215px; border:1px dashed var(--yb-hairline-2); border-radius:8px; color:var(--yb-muted); background:transparent; cursor:pointer; }
.add-address-tile:hover { border-color:var(--yb-primary); color:var(--yb-primary); }.add-address-tile:disabled { cursor:not-allowed; opacity:.5; }
.address-page { padding-top:32px; padding-bottom:48px; }.page-head { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:28px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { margin:5px 0 0; font-size:28px; font-weight:650; }.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }.addr-card { padding:26px; background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; transition:border-color .2s,box-shadow .2s,transform .2s; }.addr-card.default { border-color:var(--yb-brand-primary); background:linear-gradient(120deg,var(--yb-primary-soft),var(--yb-paper)); }.addr-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgb(20 40 30 / 5%); }.head { display:flex; justify-content:space-between; align-items:center; gap:12px; }.head>div { display:flex; gap:16px; flex-wrap:wrap; align-items:baseline; }.head strong { font-size:17px; font-weight:600; }.head span { font-size:13px; color:var(--yb-muted); }.default-tag { background:var(--yb-brand-primary); color:var(--yb-paper); border-radius:4px; padding:3px 8px; white-space:nowrap; font-size:12px; }.addr-card p { margin:20px 0; min-height:48px; font-size:14px; line-height:1.8; color:var(--yb-ink-2); overflow-wrap:anywhere; }.actions { display:flex; justify-content:flex-end; gap:12px; padding-top:18px; border-top:1px solid var(--yb-hairline); }.danger { color:var(--destructive); }.address-loading { height:215px; border-radius:10px; }.refreshing { opacity:.65; }@media(max-width:800px) { .grid { grid-template-columns:1fr; } }@media(prefers-reduced-motion:reduce) { .addr-card { transition:none; }.addr-card:hover { transform:none; } }
</style>
