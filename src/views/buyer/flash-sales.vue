<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as flashSaleApi from '@/service/api/flash-sale';
import * as productApi from '@/service/api/product';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { setImageFallback } from '@/utils/image-placeholder';

const activeTab = ref<'sessions' | 'mine'>('sessions');
const userStore = useUserStore();
const sessions = ref<Api.RealFlashSale.SessionDTO[]>([]);
const enrollments = ref<Api.RealFlashSale.EnrollmentDTO[]>([]);
const products = ref<Api.RealProduct.Record[]>([]);
const productPageNo = ref(1);
const productTotal = ref(0);
const productLoadedCount = ref(0);
const loadingMoreProducts = ref(false);
const productPageGuard = createLatestRequestGuard();
type Section = 'sessions' | 'enrollments' | 'products';
const sectionLoading = reactive({ sessions: false, enrollments: false, products: false });
const sectionErrors = reactive({ sessions: '', enrollments: '', products: '' });
const sectionGuards = { sessions: createLatestRequestGuard(), enrollments: createLatestRequestGuard(), products: createLatestRequestGuard() };
const loading = computed(() => activeTab.value === 'sessions' ? sectionLoading.sessions : sectionLoading.enrollments);
const loadError = computed(() => activeTab.value === 'sessions' ? sectionErrors.sessions : sectionErrors.enrollments);
const submitting = ref(false);
const cancelingEnrollmentKey = ref('');
const modalOpen = ref(false);
const form = reactive<{
  sessionId: string;
  productId: string;
  flashPrice?: number;
  flashStock?: number;
}>({ sessionId: '', productId: '' });
let submitWriteVersion = 0;
let cancelWriteVersion = 0;
let modalVersion = 0;
watch(modalOpen, () => { modalVersion += 1; }, { flush: 'sync' });
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

const selectedProduct = computed(() => products.value.find(item => String(item.id) === form.productId));

async function loadSection(section: Section) {
  const isCurrent = sectionGuards[section].begin();
  if (section === 'products') {
    productPageGuard.invalidate();
    loadingMoreProducts.value = false;
    productPageNo.value = 1;
    productLoadedCount.value = 0;
    productTotal.value = 0;
  }
  const userId = String(userStore.currentUser?.id || '');
  sectionErrors[section] = '';
  if (!userId) {
    sectionLoading[section] = false;
    if (section === 'sessions') sessions.value = [];
    else if (section === 'enrollments') enrollments.value = [];
    else products.value = [];
    return;
  }
  sectionLoading[section] = true;
  try {
    if (section === 'sessions') {
      const result = await flashSaleApi.fetchAvailableFlashSaleSessions({ signal: isCurrent.signal });
      if (!isCurrent()) return;
      sessions.value = result;
    } else if (section === 'enrollments') {
      const result = await flashSaleApi.fetchMyFlashSaleEnrollments({ signal: isCurrent.signal });
      if (!isCurrent()) return;
      enrollments.value = result;
    } else {
      const result = await productApi.fetchMyProducts({ status: 'NORMAL', current: 1, size: 20, signal: isCurrent.signal });
      if (!isCurrent()) return;
      products.value = result.records.filter(item => item.shelfStatus === 'on-shelf');
      productTotal.value = result.total;
      productLoadedCount.value = result.records.length;
    }
  } catch {
    if (!isCurrent()) return;
    sectionErrors[section] = { sessions: '场次读取失败', enrollments: '报名记录读取失败', products: '报名商品读取失败' }[section];
    if (section === 'sessions') sessions.value = [];
    else if (section === 'enrollments') enrollments.value = [];
    else products.value = [];
  } finally {
    if (isCurrent()) sectionLoading[section] = false;
  }
}

function load() {
  return Promise.all((Object.keys(sectionGuards) as Section[]).map(loadSection));
}

async function loadMoreProducts() {
  if (loadingMoreProducts.value || sectionLoading.products || productLoadedCount.value >= productTotal.value) return;
  const isCurrent = productPageGuard.begin();
  loadingMoreProducts.value = true;
  try {
    const nextPage = productPageNo.value + 1;
    const result = await productApi.fetchMyProducts({ status: 'NORMAL', current: nextPage, size: 20, signal: isCurrent.signal });
    if (!isCurrent()) return;
    if (!result.records.length && productLoadedCount.value < result.total) {
      Message.warning('商品分页暂未返回后续记录，请稍后重试');
      return;
    }
    const merged = new Map(products.value.map(item => [String(item.id), item]));
    result.records.filter(item => item.shelfStatus === 'on-shelf').forEach(item => merged.set(String(item.id), item));
    products.value = [...merged.values()];
    productPageNo.value = nextPage;
    productTotal.value = result.total;
    productLoadedCount.value += result.records.length;
  } catch {
    // 保留已选商品，允许重新加载当前下一页。
  } finally {
    if (isCurrent()) loadingMoreProducts.value = false;
  }
}

function openEnroll(session: Api.RealFlashSale.SessionDTO) {
  if (sectionLoading.products || sectionErrors.products) return;
  modalVersion += 1;
  form.sessionId = session.id;
  form.productId = '';
  form.flashPrice = undefined;
  form.flashStock = undefined;
  modalOpen.value = true;
}

async function submit() {
  if (submitting.value || sectionLoading.products || sectionErrors.products) return;
  if (!form.productId) {
    Message.warning('请选择报名商品');
    return;
  }
  if (form.flashPrice != null && (!Number.isFinite(form.flashPrice) || form.flashPrice <= 0)) {
    Message.warning('秒杀价必须大于 0');
    return;
  }
  if (form.flashStock != null && (!Number.isFinite(form.flashStock) || form.flashStock < 1)) {
    Message.warning('秒杀库存至少为 1');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++submitWriteVersion;
  const submittedModalVersion = modalVersion;
  const requestedSessionId = form.sessionId;
  const requestedProductId = form.productId;
  const isCurrentWrite = () => operation === submitWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    try {
      await flashSaleApi.enrollFlashSale({
        sessionId: requestedSessionId,
        productId: requestedProductId,
        flashPrice: form.flashPrice,
        flashStock: form.flashStock
      });
      if (!isCurrentWrite()) return;
      Message.success('秒杀报名成功');
      if (submittedModalVersion === modalVersion) {
        modalOpen.value = false;
        activeTab.value = 'mine';
      }
      await load();
    } catch {
      // 请求层已展示业务错误，保留表单供用户修正后重试。
    }
  } finally {
    if (operation === submitWriteVersion) submitting.value = false;
  }
}

function cancel(item: Api.RealFlashSale.EnrollmentDTO) {
  const key = `${item.sessionId}:${item.productId}`;
  if (cancelingEnrollmentKey.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++cancelWriteVersion;
  const isCurrentWrite = () => operation === cancelWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancelingEnrollmentKey.value = key;
  confirmationModal = Modal.confirm({
    title: '取消秒杀报名？',
    content: `确认取消「${item.title}」的本场报名？`,
    onCancel() {
      if (!isCurrentWrite()) return;
      cancelWriteVersion += 1;
      cancelingEnrollmentKey.value = '';
    },
    async onOk() {
      if (!isCurrentWrite()) {
        return;
      }
      try {
        await flashSaleApi.cancelFlashSaleEnrollment(item.sessionId, item.productId);
        if (!isCurrentWrite()) return;
        Message.success('已取消报名');
        await load();
      } catch {
        // 请求层已展示业务错误，避免未处理的确认回调异常。
      } finally {
        if (operation === cancelWriteVersion) cancelingEnrollmentKey.value = '';
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
onBeforeUnmount(() => {
  confirmationModal?.close();
  productPageGuard.invalidate();
  submitWriteVersion += 1;
  cancelWriteVersion += 1;
  Object.values(sectionGuards).forEach(guard => guard.invalidate());
});
watch(() => userStore.currentUser?.id, () => {
  confirmationModal?.close();
  productPageGuard.invalidate();
  loadingMoreProducts.value = false;
  productTotal.value = 0;
  submitWriteVersion += 1;
  cancelWriteVersion += 1;
  submitting.value = false;
  cancelingEnrollmentKey.value = '';
  Object.values(sectionGuards).forEach(guard => guard.invalidate());
  sessions.value = [];
  enrollments.value = [];
  products.value = [];
  modalOpen.value = false;
  void load();
});
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
        <template #extra><a-button type="primary" @click="loadSection(activeTab === 'sessions' ? 'sessions' : 'enrollments')">重新加载</a-button></template>
      </a-result>
      <div v-else-if="activeTab === 'sessions'" class="session-grid">
        <a-card v-for="session in sessions" :key="session.id" :bordered="false" class="session-card">
          <div class="session-title">{{ session.name }}</div>
          <div class="session-time">{{ formatTime(session.startTime) }} 至 {{ formatTime(session.endTime) }}</div>
          <div class="session-meta">已报名商品 {{ session.itemCount || 0 }} 件</div>
          <a-button type="primary" long :disabled="sectionLoading.products || !!sectionErrors.products" @click="openEnroll(session)">选择商品报名</a-button>
        </a-card>
        <a-empty v-if="!sessions.length" description="暂无可报名场次" />
      </div>

      <a-card v-else :bordered="false" :body-style="{ padding: 0 }" class="table-card">
        <a-table :data="enrollments.map(item => ({ ...item, rowKey: JSON.stringify([item.sessionId, item.productId]) }))" :pagination="false" row-key="rowKey">
          <template #columns>
            <a-table-column title="商品" :width="260">
              <template #cell="{ record }">
                <div class="product-cell">
                  <img v-if="record.image" :src="record.image" :alt="record.title || '秒杀商品'" @error="setImageFallback" />
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
              <template #cell="{ record }"><a-button type="text" status="danger" :loading="cancelingEnrollmentKey === `${record.sessionId}:${record.productId}`" @click="cancel(record)">取消报名</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </a-card>
    </a-spin>

    <a-alert v-if="sectionErrors.products" type="warning">
      {{ sectionErrors.products }}，已有报名与场次仍可查看。
      <template #action><a-button :loading="sectionLoading.products" @click="loadSection('products')">重试商品读取</a-button></template>
    </a-alert>

    <a-modal v-model:visible="modalOpen" title="报名秒杀场次" :ok-loading="submitting" :on-before-ok="() => { void submit(); return false; }">
      <a-form :model="form" layout="vertical">
        <a-form-item label="报名商品" required>
          <a-select v-model="form.productId" placeholder="请选择在售商品">
            <a-option v-for="product in products" :key="String(product.id)" :value="String(product.id)">
              {{ product.title }}（U {{ formatAmount(product.price) }} / 库存 {{ product.stock }}）
            </a-option>
          </a-select>
          <a-button v-if="productLoadedCount < productTotal" :loading="loadingMoreProducts" @click="loadMoreProducts">加载更多商品（已读取 {{ productLoadedCount }} / {{ productTotal }}，可报名 {{ products.length }}）</a-button>
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
