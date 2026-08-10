<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { enums, formatAmount, orderApi } from '@shared';
import AftersaleCaseTypePicker from '@/components/aftersale/aftersale-case-type-picker.vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as aftersaleApi from '@/service/aftersale-adapter';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const orderId = computed(() => Number(route.params.orderId));
const order = ref<Api.Order.OrderRecord>();
const loading = ref(false);
const submitting = ref(false);

const form = reactive<{
  caseType?: Api.Order.AftersaleCaseType;
  appeal: string;
  evidenceUrls: string[];
}>({
  appeal: '',
  evidenceUrls: []
});

async function load() {
  loading.value = true;
  try {
    order.value = await orderApi.fetchOrderDetail(orderId.value);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const aftersaleMeta = computed(() => (order.value ? enums.AFTERSALE_TYPE_META[order.value.aftersaleType] : undefined));

async function submit() {
  if (!form.caseType) {
    Message.warning('请选择售后类型');
    return;
  }
  if (form.appeal.trim().length < 10) {
    Message.warning('问题描述至少 10 字');
    return;
  }
  if (!order.value || !userStore.currentUser) return;
  Modal.confirm({
    title: '确认提交售后申请？',
    content: `提交后将进入审核流程，平台会在 24h 内与您和买手沟通处理。`,
    okText: '确认提交',
    async onOk() {
      submitting.value = true;
      try {
        const r = await aftersaleApi.createAftersale({
          orderId: order.value!.id,
          customerId: userStore.currentUser!.id,
          caseType: form.caseType!,
          appeal: form.appeal.trim(),
          evidenceUrls: form.evidenceUrls
        });
        if (r.ok && r.case) {
          Message.success(`售后申请已提交，工单编号 ${r.case.code}`);
          router.push({ name: 'aftersale-detail', params: { id: String(r.case.id) } });
        } else {
          Message.error(r.message || '提交失败');
        }
      } finally {
        submitting.value = false;
      }
    }
  });
}
</script>

<template>
  <div class="aftersale-create-page shop-container">
    <a-spin :loading="loading">
      <template v-if="order">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item @click="router.push('/order')">我的订单</a-breadcrumb-item>
          <a-breadcrumb-item @click="router.push({ name: 'order-detail', params: { id: String(order.id) } })">
            {{ order.code }}
          </a-breadcrumb-item>
          <a-breadcrumb-item>申请售后</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="order-card" :body-style="{ padding: '14px 20px' }" :bordered="false">
          <div class="order-row">
            <img :src="order.productCover || `https://picsum.photos/seed/${order.productId}/80/80`" class="cover" />
            <div class="info">
              <div class="title">{{ order.productTitle }}</div>
              <div class="meta">
                <OrderStatusTag :status="order.status" size="small" />
                <span class="dot">·</span>
                <span>买手 {{ order.shopperName }}</span>
                <span class="dot">·</span>
                <span>下单 {{ new Date(order.createdAt).toLocaleDateString() }}</span>
              </div>
            </div>
            <div class="amount">U {{ formatAmount(order.totalAmount) }}</div>
          </div>
        </a-card>

        <a-alert v-if="order.overseasCustoms" type="warning" class="overseas" closable>
          🌏 该商品为海外直邮，过关后不支持退货退款，建议优先选择 PARTIAL_REFUND / REPAIR
        </a-alert>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="step-title">1. 选择售后类型</div>
          <AftersaleCaseTypePicker v-model="form.caseType" />
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="step-title">2. 描述问题 <span class="hint">（至少 10 字）</span></div>
          <a-textarea
            v-model="form.appeal"
            placeholder="请详细描述遇到的问题，例如：商品损坏、与描述不符、未按时发货等"
            :rows="5"
            :max-length="500"
            show-word-limit
          />
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="step-title">3. 上传凭证 <span class="hint">（可选）</span></div>
          <AftersaleEvidenceUploader v-model="form.evidenceUrls" :max="6" />
        </a-card>

        <a-card class="step-card actions-card" :body-style="{ padding: '14px 20px' }" :bordered="false">
          <a-space>
            <a-button @click="router.back()">取消</a-button>
            <a-button type="primary" size="large" :loading="submitting" @click="submit">
              提交售后申请
            </a-button>
          </a-space>
          <a-tag v-if="aftersaleMeta" :color="aftersaleMeta.color" size="small">
            售后类型：{{ aftersaleMeta.label }}
          </a-tag>
        </a-card>
      </template>

      <EmptyState v-else-if="!loading" title="订单不存在" action-text="返回订单" @action="router.push('/order')" />
    </a-spin>
  </div>
</template>

<style scoped>
.aftersale-create-page {
  padding-top: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.bread {
  margin-bottom: 12px;
}
.order-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.order-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 16px;
  align-items: center;
}
.cover {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  background: #f7f8fa;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 6px;
}
.meta {
  font-size: 12px;
  color: #86909c;
  display: flex;
  gap: 6px;
  align-items: center;
}
.dot {
  opacity: 0.4;
}
.amount {
  font-size: 18px;
  font-weight: 700;
  color: #f53f3f;
  font-family: ui-monospace, monospace;
}
.overseas {
  margin-bottom: 12px;
}
.step-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.step-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 14px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.hint {
  color: #86909c;
  font-size: 12px;
  font-weight: 400;
}
.actions-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.actions-card :deep(.arco-card-body) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
</style>
