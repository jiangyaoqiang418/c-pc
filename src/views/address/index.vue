<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import * as realAddressApi from '@/service/api/address';
import AddressForm from '@/components/profile/address-form.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const list = ref<Api.RealAddress.AddressRecord[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const editing = ref<Partial<Api.RealAddress.AddressRecord>>();
const submitting = ref(false);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    list.value = await realAddressApi.fetchMyAddresses();
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openAdd() {
  editing.value = {};
  modalOpen.value = true;
}

function openEdit(a: Api.RealAddress.AddressRecord) {
  editing.value = { ...a };
  modalOpen.value = true;
}

async function setDefault(a: Api.RealAddress.AddressRecord) {
  await realAddressApi.setDefaultAddress(a.id);
  Message.success('已设为默认');
  load();
}

function onDelete(a: Api.RealAddress.AddressRecord) {
  Modal.confirm({
    title: '删除地址？',
    content: `${a.receiverName} · ${a.detail}`,
    okText: '确认删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      await realAddressApi.deleteAddress(a.id);
      Message.success('已删除');
      load();
    }
  });
}

async function onSubmit(form: Omit<Api.RealAddress.AddressRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  if (!userStore.currentUser) return;
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
    if (editing.value?.id) await realAddressApi.updateAddress(params);
    else await realAddressApi.createAddress(params);
    Message.success(editing.value?.id ? '已更新' : '已添加');
    modalOpen.value = false;
    load();
  } finally {
    submitting.value = false;
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
            <a-button v-if="!a.isDefault" size="small" type="outline" @click="setDefault(a)">设为默认</a-button>
            <a-button size="small" type="outline" @click="openEdit(a)">编辑</a-button>
            <a-button size="small" status="danger" type="outline" @click="onDelete(a)">删除</a-button>
          </div>
        </div>
      </div>
      <EmptyState
        v-else
        title="还没有收货地址"
        description="添加地址后下单更快捷"
        action-text="新增地址"
        @action="openAdd"
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
