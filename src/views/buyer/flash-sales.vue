<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import UmIcon from '@/components/common/um-icon.vue';
import EmptyState from '@/components/common/empty-state.vue';
import AmountInput from '@/components/common/amount-input.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message, Modal } from '@/lib/feedback';
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

function selectTab(value: unknown) {
  if (value === 'sessions' || value === 'mine') activeTab.value = value;
}
function selectProduct(value: unknown) {
  if (typeof value === 'string' && products.value.some(item => String(item.id) === value)) form.productId = value;
}
</script>

<template>
  <div class="flash-page shop-container">
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>秒杀报名</h1><p>为在售商品选择可报名场次，可按需设置秒杀价和秒杀库存。</p></div><Button class="outline" variant="outline" :disabled="loading" @click="load"><UmIcon name="return" />刷新</Button></header>
    <div class="buyer-tabs" role="group" aria-label="秒杀报名"><button type="button" :class="{ active:activeTab === 'sessions' }" :aria-pressed="activeTab === 'sessions'" @click="selectTab('sessions')">可报名场次</button><button type="button" :class="{ active:activeTab === 'mine' }" :aria-pressed="activeTab === 'mine'" @click="selectTab('mine')">我的报名 <small>{{ enrollments.length }}</small></button></div>
    <EmptyState v-if="loadError" title="秒杀数据加载失败" :description="loadError" action-text="重新加载" @action="loadSection(activeTab === 'sessions' ? 'sessions' : 'enrollments')" />
    <div v-else-if="loading" class="buyer-skeleton" aria-busy="true"><Skeleton v-for="n in 2" :key="n" class="h-72" /></div>
    <template v-else-if="activeTab === 'sessions'"><div v-if="sessions.length" class="buyer-flash-grid"><article v-for="(session,index) in sessions" :key="session.id" class="buyer-session"><span class="eyebrow">{{ String(index + 1).padStart(2,'0') }} / CURATED EVENT</span><UmIcon name="clock" /><h2>{{ session.name }}</h2><div><small>开始 {{ formatTime(session.startTime) }}</small><small>结束 {{ formatTime(session.endTime) }}</small></div><p class="buyer-inline-hint">已报名 {{ session.itemCount ?? '—' }} 件商品</p><button type="button" class="primary full" :disabled="sectionLoading.products || !!sectionErrors.products" @click="openEnroll(session)">{{ sectionLoading.products ? '正在读取商品…' : '选择在售商品报名' }}<UmIcon name="arrow" /></button></article></div><EmptyState v-else icon="lucide:zap" title="暂无可报名场次" description="可报名场次开放后会展示在这里。" /></template>
    <template v-else><template v-if="enrollments.length"><article v-for="item in enrollments" :key="JSON.stringify([item.sessionId,item.productId])" class="paper buyer-enrollment"><div class="buyer-order-product"><img v-if="item.image" :src="item.image" :alt="item.title || '秒杀商品'" @error="setImageFallback" /><span><small>{{ sessionName(item.sessionId) }}</small><b>{{ item.title }}</b><small>结束 {{ formatTime(item.sessionEndTime) }}</small></span></div><dl class="buyer-dl"><dt>商品原价</dt><dd>{{ item.price === undefined || item.price === null ? '—' : formatAmount(item.price) }} USDT</dd><dt>秒杀价</dt><dd>{{ item.flashPrice === undefined || item.flashPrice === null ? '未单独设置' : formatAmount(item.flashPrice) + ' USDT' }}</dd><dt>秒杀库存</dt><dd>{{ item.flashStock ?? '未单独设置' }}</dd></dl><button type="button" class="outline" :disabled="!!cancelingEnrollmentKey" @click="cancel(item)">{{ cancelingEnrollmentKey === item.sessionId + ':' + item.productId ? '处理中…' : '取消报名' }}</button></article></template><EmptyState v-else title="暂无报名记录" action-text="查看可报名场次" @action="activeTab = 'sessions'" /></template>
    <Alert v-if="sectionErrors.products"><AlertDescription class="error-row"><span>{{ sectionErrors.products }}，已有报名与场次仍可查看。</span><Button class="outline" variant="outline" size="sm" :disabled="sectionLoading.products" @click="loadSection('products')">重试商品读取</Button></AlertDescription></Alert>
    <a-modal content-class="buyer-dialog" v-model:visible="modalOpen" :key="modalVersion" title="报名秒杀场次" :ok-loading="submitting" :closable="!submitting" :mask-closable="!submitting" :esc-to-close="!submitting" :on-before-cancel="() => !submitting" :on-before-ok="() => { void submit(); return false; }"><div class="enroll-form"><div class="buyer-field"><Label for="flash-product">报名商品 <span>*</span></Label><Select :model-value="form.productId || undefined" :disabled="submitting" @update:model-value="selectProduct"><SelectTrigger id="flash-product" class="full"><SelectValue placeholder="请选择在售商品" /></SelectTrigger><SelectContent><SelectItem v-for="product in products" :key="String(product.id)" :value="String(product.id)">{{ product.title }}（U {{ formatAmount(product.price) }} / 库存 {{ product.stock }}）</SelectItem><p v-if="!products.length" class="select-empty">暂无可报名商品</p></SelectContent></Select><Button class="outline" v-if="productLoadedCount < productTotal" type="button" variant="outline" :disabled="loadingMoreProducts || submitting" @click="loadMoreProducts">{{ loadingMoreProducts ? '正在读取…' : '加载更多商品' }}（已读取 {{ productLoadedCount }} / {{ productTotal }}，可报名 {{ products.length }}）</Button></div><div class="buyer-field"><Label for="flash-price">秒杀价（USDT）</Label><AmountInput id="flash-price" v-model="form.flashPrice" :disabled="submitting" :min="0.01" :precision="2" placeholder="选填" /><p v-if="selectedProduct" class="helper">商品原价 U {{ formatAmount(selectedProduct.price) }}</p></div><div class="buyer-field"><Label for="flash-stock">秒杀库存</Label><AmountInput id="flash-stock" v-model="form.flashStock" :disabled="submitting" :min="1" :max="selectedProduct?.stock" :precision="0" placeholder="选填" /></div></div></a-modal>
  </div>
</template>

<style scoped>
.error-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.enroll-form { display:grid; gap:20px; }
.full { width:100%; }
.select-empty { padding:16px; color:var(--muted); }
</style>
