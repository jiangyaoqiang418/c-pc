<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as flashSaleApi from '@/service/api/flash-sale';
import * as productApi from '@/service/api/product';

const activeTab = ref<'sessions' | 'mine'>('sessions');
const sessions = ref<Api.RealFlashSale.SessionDTO[]>([]);
const enrollments = ref<Api.RealFlashSale.EnrollmentDTO[]>([]);
const products = ref<Api.RealProduct.Record[]>([]);
const loading = ref(false);
const loadError = ref('');
const submitting = ref(false);
const modalOpen = ref(false);
const form = reactive<{
  sessionId: string;
  productId: string;
  flashPrice?: number;
  flashStock?: number;
}>({ sessionId: '', productId: '' });

const selectedProduct = computed(() => products.value.find(item => String(item.id) === form.productId));

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [sessionList, myList, productPage] = await Promise.all([
      flashSaleApi.fetchAvailableFlashSaleSessions(),
      flashSaleApi.fetchMyFlashSaleEnrollments(),
      productApi.fetchMyProducts({ status: 'NORMAL' })
    ]);
    sessions.value = sessionList;
    enrollments.value = myList;
    products.value = productPage.records.filter(item => item.shelfStatus === 'on-shelf');
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '秒杀数据暂时无法加载';
  } finally {
    loading.value = false;
  }
}

function openEnroll(session: Api.RealFlashSale.SessionDTO) {
  form.sessionId = session.id;
  form.productId = '';
  form.flashPrice = undefined;
  form.flashStock = undefined;
  modalOpen.value = true;
}

async function submit() {
  if (!form.productId) {
    Message.warning('请选择报名商品');
    return;
  }
  if (form.flashPrice !== undefined && form.flashPrice <= 0) {
    Message.warning('秒杀价必须大于 0');
    return;
  }
  if (form.flashStock !== undefined && form.flashStock < 1) {
    Message.warning('秒杀库存至少为 1');
    return;
  }
  submitting.value = true;
  try {
    try {
      await flashSaleApi.enrollFlashSale({
        sessionId: form.sessionId,
        productId: form.productId,
        flashPrice: form.flashPrice,
        flashStock: form.flashStock
      });
      Message.success('秒杀报名成功');
      modalOpen.value = false;
      activeTab.value = 'mine';
      await load();
    } catch {
      // 请求层已展示业务错误，保留表单供用户修正后重试。
    }
  } finally {
    submitting.value = false;
  }
}

function cancel(item: Api.RealFlashSale.EnrollmentDTO) {
  Modal.confirm({
    title: '取消秒杀报名？',
    content: `确认取消「${item.title}」的本场报名？`,
    async onOk() {
      try {
        await flashSaleApi.cancelFlashSaleEnrollment(item.sessionId, item.productId);
        Message.success('已取消报名');
        await load();
      } catch {
        // 请求层已展示业务错误，避免未处理的确认回调异常。
      }
    }
  });
}

function sessionName(sessionId: string) {
  return sessions.value.find(item => item.id === sessionId)?.name || sessionId;
}

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

onMounted(load);
</script>

<template>
  <div class="page shop-container">
    <div class="page-head">
      <div>
        <h1>秒杀报名</h1>
        <p>为在售商品选择可报名场次，可按需设置秒杀价和秒杀库存。</p>
      </div>
      <a-button @click="load">刷新</a-button>
    </div>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="sessions" title="可报名场次" />
        <a-tab-pane key="mine" title="我的报名" />
      </a-tabs>
    </a-card>

    <a-spin :loading="loading" style="width: 100%">
      <a-result v-if="loadError" status="error" title="秒杀数据加载失败" :subtitle="loadError">
        <template #extra><a-button type="primary" @click="load">重新加载</a-button></template>
      </a-result>
      <div v-else-if="activeTab === 'sessions'" class="session-grid">
        <a-card v-for="session in sessions" :key="session.id" :bordered="false" class="session-card">
          <div class="session-title">{{ session.name }}</div>
          <div class="session-time">{{ formatTime(session.startTime) }} 至 {{ formatTime(session.endTime) }}</div>
          <div class="session-meta">已报名商品 {{ session.itemCount || 0 }} 件</div>
          <a-button type="primary" long @click="openEnroll(session)">选择商品报名</a-button>
        </a-card>
        <a-empty v-if="!sessions.length" description="暂无可报名场次" />
      </div>

      <a-card v-else :bordered="false" :body-style="{ padding: 0 }" class="table-card">
        <a-table :data="enrollments" :pagination="false" row-key="productId">
          <template #columns>
            <a-table-column title="商品" :width="260">
              <template #cell="{ record }">
                <div class="product-cell">
                  <img v-if="record.image" :src="record.image" :alt="record.title || '秒杀商品'" />
                  <span>{{ record.title }}</span>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="场次" :width="180">
              <template #cell="{ record }">{{ sessionName(record.sessionId) }}</template>
            </a-table-column>
            <a-table-column title="原价" :width="120">
              <template #cell="{ record }">U {{ formatAmount(record.price || 0) }}</template>
            </a-table-column>
            <a-table-column title="秒杀价" :width="120">
              <template #cell="{ record }">U {{ formatAmount(record.flashPrice || record.price || 0) }}</template>
            </a-table-column>
            <a-table-column title="秒杀库存" data-index="flashStock" :width="120" />
            <a-table-column title="结束时间" :width="180"><template #cell="{ record }">{{ formatTime(record.sessionEndTime) }}</template></a-table-column>
            <a-table-column title="操作" :width="100">
              <template #cell="{ record }"><a-button type="text" status="danger" @click="cancel(record)">取消报名</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </a-card>
    </a-spin>

    <a-modal v-model:visible="modalOpen" title="报名秒杀场次" :ok-loading="submitting" @ok="submit">
      <a-form :model="form" layout="vertical">
        <a-form-item label="报名商品" required>
          <a-select v-model="form.productId" placeholder="请选择在售商品">
            <a-option v-for="product in products" :key="String(product.id)" :value="String(product.id)">
              {{ product.title }}（U {{ formatAmount(product.price) }} / 库存 {{ product.stock }}）
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="秒杀价">
          <a-input-number v-model="form.flashPrice" :min="0.01" :precision="2" placeholder="不填则由后端按规则处理" />
          <div v-if="selectedProduct" class="form-hint">商品原价 U {{ formatAmount(selectedProduct.price) }}</div>
        </a-form-item>
        <a-form-item label="秒杀库存">
          <a-input-number v-model="form.flashStock" :min="1" :max="selectedProduct?.stock" placeholder="不填则由后端按规则处理" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.page { padding-top: 16px; }
.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-head h1 { margin: 0 0 6px; font-size: 20px; }
.page-head p { margin: 0; color: #86909c; font-size: 13px; }
.session-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
.session-card { border: 1px solid #f2f3f5; }
.session-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
.session-time, .session-meta { color: #86909c; font-size: 12px; margin-bottom: 10px; }
.table-card { margin-top: 16px; }
.product-cell { display: flex; align-items: center; gap: 10px; }
.product-cell img { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; }
.form-hint { margin-top: 6px; color: #86909c; font-size: 12px; }
</style>
