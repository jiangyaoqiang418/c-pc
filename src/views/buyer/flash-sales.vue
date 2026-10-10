<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@iconify/vue';
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
    <header class="page-head"><div><span class="eyebrow">UMAOMAO / FLASH EVENTS</span><h1>秒杀报名</h1><p>为在售商品选择可报名场次，可按需设置秒杀价和秒杀库存。</p></div><Button variant="outline" :disabled="loading" @click="load"><Icon icon="lucide:refresh-cw" />刷新</Button></header>
    <Tabs :model-value="activeTab" @update:model-value="selectTab"><TabsList><TabsTrigger value="sessions">可报名场次</TabsTrigger><TabsTrigger value="mine">我的报名</TabsTrigger></TabsList></Tabs>
    <EmptyState v-if="loadError" title="秒杀数据加载失败" :description="loadError" action-text="重新加载" @action="loadSection(activeTab === 'sessions' ? 'sessions' : 'enrollments')" />
    <div v-else-if="loading" class="loading-grid" aria-busy="true"><Skeleton v-for="n in 2" :key="n" class="session-skeleton" /></div>
    <template v-else-if="activeTab === 'sessions'"><div v-if="sessions.length" class="session-grid"><article v-for="session in sessions" :key="session.id" class="session-card"><span class="eyebrow">FLASH SESSION</span><Icon icon="lucide:zap" class="session-icon" /><h2>{{ session.name }}</h2><div class="session-times"><div><small>开始时间</small><time>{{ formatTime(session.startTime) }}</time></div><div><small>结束时间</small><time>{{ formatTime(session.endTime) }}</time></div></div><p>已报名商品 {{ session.itemCount ?? '—' }} 件</p><Button :disabled="sectionLoading.products || !!sectionErrors.products" @click="openEnroll(session)">{{ sectionLoading.products ? '正在读取商品…' : '选择商品报名' }}<Icon icon="lucide:arrow-right" /></Button></article></div><EmptyState v-else icon="lucide:zap" title="暂无可报名场次" description="可报名场次开放后会展示在这里。" /></template>
    <template v-else><div v-if="enrollments.length" class="enrollment-list"><article v-for="item in enrollments" :key="JSON.stringify([item.sessionId, item.productId])" class="enrollment-card"><div class="product-cell"><img v-if="item.image" :src="item.image" :alt="item.title || '秒杀商品'" @error="setImageFallback" /><div><h2>{{ item.title }}</h2><p>{{ sessionName(item.sessionId) }}</p><small>结束时间：{{ formatTime(item.sessionEndTime) }}</small></div></div><dl><div><dt>原价</dt><dd>U {{ item.price === undefined || item.price === null ? '—' : formatAmount(item.price) }}</dd></div><div><dt>秒杀价</dt><dd>U {{ item.flashPrice === undefined || item.flashPrice === null ? item.price === undefined || item.price === null ? '—' : formatAmount(item.price) : formatAmount(item.flashPrice) }}</dd></div><div><dt>秒杀库存</dt><dd>{{ item.flashStock ?? '—' }}</dd></div></dl><Button variant="ghost" class="cancel-enrollment" :disabled="!!cancelingEnrollmentKey" @click="cancel(item)">{{ cancelingEnrollmentKey === item.sessionId + ':' + item.productId ? '处理中…' : '取消报名' }}</Button></article></div><EmptyState v-else title="暂无报名记录" action-text="查看可报名场次" @action="activeTab = 'sessions'" /></template>
    <Alert v-if="sectionErrors.products"><AlertDescription class="error-row"><span>{{ sectionErrors.products }}，已有报名与场次仍可查看。</span><Button variant="outline" size="sm" :disabled="sectionLoading.products" @click="loadSection('products')">重试商品读取</Button></AlertDescription></Alert>
    <a-modal v-model:visible="modalOpen" :key="modalVersion" title="报名秒杀场次" :ok-loading="submitting" :closable="!submitting" :mask-closable="!submitting" :esc-to-close="!submitting" :on-before-cancel="() => !submitting" :on-before-ok="() => { void submit(); return false; }"><div class="enroll-form"><div class="field"><Label for="flash-product">报名商品 <span>*</span></Label><Select :model-value="form.productId || undefined" :disabled="submitting" @update:model-value="selectProduct"><SelectTrigger id="flash-product" class="full"><SelectValue placeholder="请选择在售商品" /></SelectTrigger><SelectContent><SelectItem v-for="product in products" :key="String(product.id)" :value="String(product.id)">{{ product.title }}（U {{ formatAmount(product.price) }} / 库存 {{ product.stock }}）</SelectItem><p v-if="!products.length" class="select-empty">暂无可报名商品</p></SelectContent></Select><Button v-if="productLoadedCount < productTotal" type="button" variant="outline" :disabled="loadingMoreProducts || submitting" @click="loadMoreProducts">{{ loadingMoreProducts ? '正在读取…' : '加载更多商品' }}（已读取 {{ productLoadedCount }} / {{ productTotal }}，可报名 {{ products.length }}）</Button></div><div class="field"><Label for="flash-price">秒杀价（USDT）</Label><AmountInput id="flash-price" v-model="form.flashPrice" :disabled="submitting" :min="0.01" :precision="2" placeholder="选填" /><p v-if="selectedProduct" class="helper">商品原价 U {{ formatAmount(selectedProduct.price) }}</p></div><div class="field"><Label for="flash-stock">秒杀库存</Label><AmountInput id="flash-stock" v-model="form.flashStock" :disabled="submitting" :min="1" :max="selectedProduct?.stock" :precision="0" placeholder="选填" /></div></div></a-modal>
  </div>
</template>

<style scoped>
.flash-page { display:grid; gap:24px; }.page-head,.error-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.page-head h1 { font-size:28px; font-weight:650; margin:8px 0; }.page-head p { color:var(--yb-muted); font-size:13px; margin:0; }.session-grid,.loading-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }.session-card { position:relative; background:var(--yb-primary-soft); border:1px solid var(--yb-hairline); padding:28px; border-radius:12px; overflow:hidden; }.session-icon { position:absolute; right:25px; top:25px; width:38px; height:38px; color:var(--yb-primary); opacity:.3; }.session-card h2 { font-size:24px; margin:36px 0 24px; font-weight:600; }.session-times { display:grid; gap:16px; }.session-times small { display:block; color:var(--yb-muted); font-size:12px; }.session-times time { display:block; font-size:14px; margin-top:5px; }.session-card p { color:var(--yb-muted); font-size:12px; margin:24px 0; }.session-card>button { width:100%; }.enrollment-list { display:grid; gap:18px; }.enrollment-card { display:grid; grid-template-columns:minmax(0,1fr) minmax(180px,.8fr) auto; align-items:center; gap:24px; padding:25px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:12px; }.product-cell { display:flex; align-items:center; gap:16px; min-width:0; }.product-cell img { width:72px; height:72px; object-fit:cover; border-radius:6px; }.product-cell>div { min-width:0; }.product-cell h2 { font-size:16px; font-weight:600; margin:0; overflow-wrap:anywhere; }.product-cell p { margin:8px 0; font-size:12px; color:var(--yb-primary); }.product-cell small { font-size:12px; color:var(--yb-muted); }.enrollment-card dl { margin:0; display:grid; gap:8px; }.enrollment-card dl>div { display:flex; gap:20px; justify-content:space-between; }.enrollment-card dt { color:var(--yb-muted); font-size:12px; }.enrollment-card dd { font-size:13px; margin:0; font-family:var(--yb-font-mono); }.cancel-enrollment { color:var(--yb-danger); }.enroll-form { display:grid; gap:24px; }.field { display:grid; gap:10px; }.field label>span { color:var(--yb-danger); }.full { width:100%; }.helper,.select-empty { font-size:12px; color:var(--yb-muted); margin:0; }.select-empty { padding:16px; }.session-skeleton { height:300px; }@media(max-width:1150px) { .enrollment-card { grid-template-columns:1fr auto; }.product-cell { grid-column:1/-1; } }@media(max-width:700px) { .session-grid,.loading-grid { grid-template-columns:1fr; }.page-head { flex-wrap:wrap; } }
</style>
