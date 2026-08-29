<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import * as realAddressApi from '@/service/api/address';
import AddressForm from '@/components/profile/address-form.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

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
let submitWriteVersion = 0;

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
  defaultWriteVersion += 1;
  deleteWriteVersion += 1;
  submitWriteVersion += 1;
  requestGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
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
  editing.value = {};
  modalOpen.value = true;
}

function openEdit(a: Api.RealAddress.AddressRecord) {
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
  Modal.confirm({
    title: '删除地址？',
    content: `${a.receiverName} · ${a.detail}`,
    okText: '确认删除',
    okButtonProps: { status: 'danger' },
    onCancel() {
      deleteWriteVersion += 1;
      deletionPending.value = false;
    },
    async onOk() {
      deletingId.value = addressId;
      if (!isCurrentWrite()) {
        deletingId.value = undefined;
        deletionPending.value = false;
        return;
      }
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

async function onSubmit(form: Omit<Api.RealAddress.AddressRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  if (!userStore.currentUser || submitting.value) return;
  const requestedUserId = userStore.currentUser.id;
  const operation = ++submitWriteVersion;
  const isCurrentWrite = () => operation === submitWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  const editingId = editing.value?.id;
  submitting.value = true;
  try {
    const params: Api.RealAddress.AddressSaveParams = {
      id: editing.value?.id,
      receiverName: form.receiverName,
      receiverPhone: form.receiverPhone,
      country: form.country,
      province: form.province,
      city: form.city,
      district: form.district,
      detailAddress: form.detail,
      postalCode: editing.value?.postalCode,
      idCardNo: editing.value?.idCardNo,
      defaultFlag: form.isDefault,
      tag: editing.value?.tag
    };
    try {
      if (editingId) await realAddressApi.updateAddress(params);
      else await realAddressApi.createAddress(params);
      if (!isCurrentWrite()) return;
      Message.success(editingId ? '已更新' : '已添加');
      modalOpen.value = false;
      await load();
    } catch {
      // 请求层已展示错误，保留表单供用户修改后重试。
    }
  } finally {
    if (operation === submitWriteVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="address-page shop-container">
    <div class="page-head">
      <h1 class="page-title">地址管理</h1>
      <a-button type="primary" @click="openAdd">+ 新增地址</a-button>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="list.length" class="grid">
        <div v-for="a in list" :key="a.id" class="addr-card" :class="{ default: a.isDefault }">
          <div class="head">
            <div class="head-left">
              <span class="name">{{ a.receiverName }}</span>
              <span class="phone">{{ a.receiverPhone }}</span>
            </div>
            <a-tag v-if="a.isDefault" color="arcoblue" size="small">默认</a-tag>
          </div>
          <div class="detail">{{ a.country }} {{ a.province }} {{ a.city }} {{ a.district }} {{ a.detail }}</div>
          <div class="actions">
            <a-button v-if="!a.isDefault" size="small" type="outline" :loading="defaultingId === a.id" @click="setDefault(a)">设为默认</a-button>
            <a-button size="small" type="outline" @click="openEdit(a)">编辑</a-button>
            <a-button size="small" status="danger" type="outline" :loading="deletingId === a.id" @click="onDelete(a)">删除</a-button>
          </div>
        </div>
      </div>
      <EmptyState
        v-else
        :title="loadError || '还没有收货地址'"
        :description="loadError ? '不会把请求失败误显示为没有地址。' : '添加地址后下单更快捷'"
        :action-text="loadError ? '重新加载' : '新增地址'"
        @action="loadError ? load() : openAdd()"
      />
    </a-spin>

    <a-modal v-model:visible="modalOpen" :title="editing?.id ? '编辑地址' : '新增地址'" :footer="false" width="640">
      <AddressForm :model-value="editing" :submitting="submitting" @submit="onSubmit" />
    </a-modal>
  </div>
</template>

<style scoped>
.address-page {
  padding-top: 16px;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.addr-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 16px 20px;
  border: 1px solid #f2f3f5;
  transition: all 0.15s;
}
.addr-card.default {
  border-color: var(--bw-brand-primary);
  background: linear-gradient(135deg, #f3f7ff 0%, #fff 60%);
}
.addr-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.head-left {
  display: flex;
  gap: 12px;
  align-items: baseline;
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}
.phone {
  font-size: 13px;
  color: #4e5969;
}
.detail {
  font-size: 13px;
  color: #4e5969;
  line-height: 1.6;
  margin-bottom: 12px;
  min-height: 2.5em;
}
.actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px dashed #f2f3f5;
}
</style>
