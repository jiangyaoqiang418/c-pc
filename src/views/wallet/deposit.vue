<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { isDefinitiveRejection } from '@/service/request/type';

const userStore = useUserStore();
const walletStore = useWalletStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref<'create' | 'address'>('create');
const amount = ref(100);
const chain = ref<string>();
const submitting = ref(false);
const submissionUnknown = ref(false);
const loadingRecords = ref(false);
const currentRecharge = ref<Api.RealWallet.RechargeVO>();
const pendingRechargeReadId = ref<string | number>();
const recentDeposits = ref<Api.RealWallet.RechargeVO[]>([]);
const recordCurrent = ref(1);
const recordSize = ref(10);
const recordTotal = ref(0);
const recordStatus = ref<Api.RealWallet.RechargeStatus>();

function readRecordsQuery() {
  const page = Number(route.query.page);
  recordCurrent.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const status = typeof route.query.status === 'string' && ['PENDING', 'CONFIRMED', 'CANCELED'].includes(route.query.status)
    ? route.query.status as Api.RealWallet.RechargeStatus : undefined;
  recordStatus.value = status;
  return route.query.status !== undefined && !status;
}

async function syncRecordsQuery(replace = false) {
  const before = route.fullPath;
  await (replace ? router.replace : router.push)({ query: { ...route.query,
    page: recordCurrent.value > 1 ? String(recordCurrent.value) : undefined, status: recordStatus.value } });
  if (route.fullPath === before) await loadRecords();
}
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.RealWallet.RechargeVO>();
const detailTargetId = ref<string | number>();
const cancelingRechargeId = ref<string | number>();
const loadingChains = ref(false);
const loadingAddress = ref(false);
const loadError = ref('');
const addressError = ref('');
const recordError = ref('');
const detailError = ref('');
const requestGuard = createLatestRequestGuard();
const recordsGuard = createLatestRequestGuard();
const chainsGuard = createLatestRequestGuard();
const addressGuard = createLatestRequestGuard();
const detailGuard = createLatestRequestGuard();
let createWriteVersion = 0;
let cancelWriteVersion = 0;

const chainOptions = ref<Api.RealWallet.RechargeChainVO[]>([]);
const selectedChain = computed(() => chainOptions.value.find(item => item.chain === chain.value));
const rechargeAddress = ref<Api.RealWallet.RechargeAddressVO>();

const statusColor = computed(() => (status?: string) => {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'CANCELED') return 'red';
  return 'orange';
});

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function getId(result: Api.RealWallet.RechargeVO | string | number) {
  return typeof result === 'object' ? result.id : result;
}

async function loadRecords() {
  const isCurrent = recordsGuard.begin();
  loadingRecords.value = true;
  recordError.value = '';
  try {
    const result = await realWalletApi.fetchRechargePage({
      pageNo: recordCurrent.value,
      pageSize: recordSize.value,
      status: recordStatus.value
    }, { signal: isCurrent.signal, showError: false });
    if (!isCurrent()) return;
    recordSize.value = resolvePageSize(result, recordSize.value);
    const maxPage = Math.max(1, Math.ceil(result.total / recordSize.value));
    if (recordCurrent.value > maxPage) {
      recordCurrent.value = maxPage;
      await syncRecordsQuery(true);
      return;
    }
    recentDeposits.value = result.records;
    recordTotal.value = result.total;
  } catch {
    if (!isCurrent()) return;
    recentDeposits.value = [];
    recordTotal.value = 0;
    recordError.value = '充值记录加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loadingRecords.value = false;
  }
}

async function loadChains() {
  const isCurrent = chainsGuard.begin();
  loadingChains.value = true;
  loadError.value = '';
  try {
    const chains = await realWalletApi.fetchRechargeChains({ signal: isCurrent.signal, showError: false });
    if (!isCurrent()) return;
    chainOptions.value = chains.filter(item => item.enabled);
    if (!chainOptions.value.some(item => item.chain === chain.value)) {
      chain.value = chainOptions.value[0]?.chain;
    }
  } catch {
    if (!isCurrent()) return;
    chainOptions.value = [];
    chain.value = '';
    loadError.value = '充值链加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loadingChains.value = false;
  }
}

async function loadRechargeAddress(chainCode = chain.value) {
  const isCurrent = addressGuard.begin();
  if (!chainCode) {
    rechargeAddress.value = undefined;
    loadingAddress.value = false;
    return;
  }
  loadingAddress.value = true;
  addressError.value = '';
  rechargeAddress.value = undefined;
  try {
    const address = await realWalletApi.fetchRechargeAddress(chainCode, { signal: isCurrent.signal, showError: false });
    if (isCurrent() && chainCode === chain.value) rechargeAddress.value = address;
  } catch {
    if (isCurrent() && chainCode === chain.value) {
      rechargeAddress.value = undefined;
      addressError.value = '专属充值地址加载失败，请稍后重试';
    }
  } finally {
    if (isCurrent() && chainCode === chain.value) loadingAddress.value = false;
  }
}

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    recordsGuard.invalidate();
    chainsGuard.invalidate();
    addressGuard.invalidate();
    detailGuard.invalidate();
    chainOptions.value = [];
    chain.value = undefined;
    rechargeAddress.value = undefined;
    currentRecharge.value = undefined;
    recentDeposits.value = [];
    recordTotal.value = 0;
    detail.value = undefined;
    loadingRecords.value = false;
    loadingChains.value = false;
    loadingAddress.value = false;
    detailLoading.value = false;
    loadError.value = '';
    addressError.value = '';
    recordError.value = '';
    detailError.value = '';
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loadError.value = '';
  const [chains, wallet] = await Promise.allSettled([loadChains(), walletStore.fetchWallet(userId), loadRecords()]);
  if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
  if (chains.status === 'rejected' || wallet.status === 'rejected') loadError.value = '钱包基础信息加载失败，请稍后重试';
}

async function createRecharge() {
  if (submitting.value || submissionUnknown.value) return;
  if (pendingRechargeReadId.value === undefined && (!Number.isFinite(amount.value) || amount.value <= 0)) {
    Message.warning('请输入正确的充值金额');
    return;
  }
  const requestedAmount = amount.value;
  const chainCode = selectedChain.value?.chain;
  if (pendingRechargeReadId.value === undefined && !chainCode) {
    Message.warning('当前没有可用充值链');
    return;
  }
  const minAmount = Number(selectedChain.value?.minAmount || 0);
  if (pendingRechargeReadId.value === undefined && minAmount > 0 && requestedAmount < minAmount) {
    Message.warning(`该链单笔最低充值金额为 ${minAmount} USDT`);
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++createWriteVersion;
  const isCurrentWrite = () => operation === createWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    if (pendingRechargeReadId.value === undefined) {
      try {
        const created = await realWalletApi.createRecharge({ chain: chainCode!, amount: requestedAmount }, { showError: false });
        if (!isCurrentWrite()) return;
        const createdId = getId(created);
        if (!((typeof createdId === 'string' && createdId.trim()) || (typeof createdId === 'number' && Number.isSafeInteger(createdId)))) {
          throw new Error('未取得可核对的申报编号');
        }
        pendingRechargeReadId.value = createdId;
        Message.success('充值申报已创建');
      } catch (error) {
        if (isCurrentWrite()) {
          if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '申报被拒绝，请核对填写内容');
          else {
            submissionUnknown.value = true;
            Message.warning('充值申报结果待核实，请查看申报记录，未确认前请勿再次创建');
          }
        }
        return;
      }
    }
    try {
      const nextRecharge = await realWalletApi.fetchRechargeDetail(pendingRechargeReadId.value!, { showError: false });
      if (!isCurrentWrite()) return;
      currentRecharge.value = nextRecharge;
      pendingRechargeReadId.value = undefined;
      activeTab.value = 'address';
    } catch {
      if (isCurrentWrite()) Message.warning('申报已创建，详情读取失败。请重试读取，不会重复创建申报');
    }
    if (!isCurrentWrite()) return;
    recordCurrent.value = 1;
    await syncRecordsQuery(true);
  } finally {
    if (operation === createWriteVersion) submitting.value = false;
  }
}

async function copy(text?: string) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); Message.success('已复制'); }
  catch { Message.error('复制失败，请手动复制'); }
}

async function showDetail(record: Api.RealWallet.RechargeVO) {
  await openDetail(record.id);
}

async function openDetail(id: string | number) {
  detailTargetId.value = id;
  const isCurrent = detailGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  detailError.value = '';
  try {
    const next = await realWalletApi.fetchRechargeDetail(id, { signal: isCurrent.signal, showError: false });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    if (String(next.id) !== String(id)) throw new Error('充值详情对象不一致');
    detail.value = next;
  } catch {
    if (isCurrent()) detailError.value = '充值订单详情加载失败，请稍后重试';
  } finally {
    if (isCurrent()) detailLoading.value = false;
  }
}

watch(detailOpen, visible => {
  if (!visible) {
    detailGuard.invalidate();
    detailLoading.value = false;
    detailTargetId.value = undefined;
  }
});

async function cancelRecharge(record: Api.RealWallet.RechargeVO) {
  if (record.status !== 'PENDING' || cancelingRechargeId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++cancelWriteVersion;
  const isCurrentWrite = () => operation === cancelWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancelingRechargeId.value = record.id;
  try {
    await realWalletApi.cancelRecharge(record.id);
    if (!isCurrentWrite()) return;
    Message.success('充值申报已取消');
    const canceled = (item?: Api.RealWallet.RechargeVO) => item && String(item.id) === String(record.id)
      ? { ...item, status: 'CANCELED', statusText: '已取消' } : item;
    currentRecharge.value = canceled(currentRecharge.value);
    if (detailOpen.value && String(detailTargetId.value) === String(record.id)) {
      // 使取消前发出的详情读取失效，不让旧 PENDING 回包覆盖已确认结果。
      detailGuard.invalidate();
      detailLoading.value = false;
      detail.value = canceled(detail.value || record);
      detailError.value = '';
    }
    await loadRecords();
  } catch {
    // 请求层已展示后端业务提示。
  } finally {
    if (operation === cancelWriteVersion && isCurrentWrite()) cancelingRechargeId.value = undefined;
  }
}

function queryRecords() {
  recordCurrent.value = 1;
  void syncRecordsQuery();
}

onMounted(() => {
  if (readRecordsQuery()) void router.replace({ query: { ...route.query, status: undefined } });
  void loadAll();
});
watch([() => route.query.page, () => route.query.status], () => {
  if (readRecordsQuery()) {
    void router.replace({ query: { ...route.query, status: undefined } });
    return;
  }
  void loadRecords();
});
onBeforeUnmount(() => {
  createWriteVersion += 1;
  cancelWriteVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  chainsGuard.invalidate();
  addressGuard.invalidate();
  detailGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  createWriteVersion += 1;
  cancelWriteVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  chainsGuard.invalidate();
  addressGuard.invalidate();
  detailGuard.invalidate();
  submitting.value = false;
  submissionUnknown.value = false;
  cancelingRechargeId.value = undefined;
  chainOptions.value = [];
  chain.value = undefined;
  rechargeAddress.value = undefined;
  currentRecharge.value = undefined;
  pendingRechargeReadId.value = undefined;
  recentDeposits.value = [];
  recordTotal.value = 0;
  detail.value = undefined;
  detailTargetId.value = undefined;
  detailOpen.value = false;
  void loadAll();
});
watch(chain, () => void loadRechargeAddress());
watch(() => route.query.id, id => {
  if (id) void openDetail(String(id));
}, { immediate: true });
</script>

<template>
  <div class="deposit-page shop-container">
    <h1 class="page-title">钱包链上充值</h1>
    <p class="hint">选择充值链后，可直接使用专属地址完成 USDT 转账；如需留存申报记录，可填写金额后创建充值订单。</p>
    <a-alert v-if="submissionUnknown" type="warning" :closable="false" class="load-alert">
      上次申报结果待核实，本页已暂停重复创建。请查看下方申报记录；仍无法核实时联系平台，刷新页面不代表原申报失败。
      <template #action><a-button :loading="loadingRecords" @click="loadRecords">核对申报记录</a-button></template>
    </a-alert>
    <a-alert v-if="loadError" type="error" class="load-alert" :closable="false">{{ loadError }}<template #action><a-button size="mini" @click="loadAll">重新加载</a-button></template></a-alert>

    <a-card class="tab-card" :body-style="{ padding: '12px 24px 24px' }" :bordered="false">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="create" title="充值地址与申报">
          <a-form :model="{ amount, chain }" layout="vertical" class="recharge-form">
            <a-row :gutter="16">
              <a-col :xs="24" :sm="12">
                <a-form-item label="链选择">
                  <a-select v-model="chain" size="large" :loading="loadingChains" placeholder="请选择充值链">
                  <a-option v-for="option in chainOptions" :key="option.chain" :value="option.chain">
                    {{ option.label }}（{{ option.chain }}）
                  </a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="申报金额 (USDT)">
                  <a-input-number v-model="amount" :min="0.01" :precision="selectedChain?.decimals ?? 2" size="large" />
                </a-form-item>
              </a-col>
            </a-row>
            <div v-if="rechargeAddress?.address" class="direct-address">
              <div class="direct-address-head">
                <div>
                  <div class="address-label">{{ selectedChain?.label || rechargeAddress.chain }}（{{ selectedChain?.chain || rechargeAddress.chain }}）专属充值地址</div>
                  <div class="address-value direct-address-value">{{ rechargeAddress.address }}</div>
                </div>
                <a-button size="small" @click="copy(rechargeAddress.address)">复制地址</a-button>
              </div>
              <div v-if="rechargeAddress.memo" class="minimum-hint">Memo / Tag：{{ rechargeAddress.memo }}</div>
              <div v-if="rechargeAddress.minAmount" class="minimum-hint">建议最低充值金额：{{ rechargeAddress.minAmount }} USDT</div>
              <div v-if="rechargeAddress.minConfirmations" class="minimum-hint">到账确认数：{{ rechargeAddress.minConfirmations }}</div>
            </div>
            <a-alert v-else-if="selectedChain && !loadingAddress" type="warning" class="direct-address" :title="addressError || '当前充值链暂未返回专属地址，请稍后重新加载。'" />
            <a-alert type="warning" class="chain-alert" title="请务必使用所选链转账；到账状态以链上确认和平台审核结果为准。" />
            <div class="optional-order">
              <div>
                <div class="optional-order-title">可选：创建充值申报记录</div>
                <div class="optional-order-hint">直接向上述地址转账即可到账；创建订单仅用于提前留存本次充值金额。</div>
              </div>
              <a-button type="primary" size="large" :loading="submitting" :disabled="submissionUnknown" @click="createRecharge">{{ pendingRechargeReadId !== undefined ? '重试读取已创建申报' : '创建申报订单' }}</a-button>
            </div>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="address" title="申报订单信息">
          <template v-if="currentRecharge">
            <a-descriptions :column="1" bordered :data="[
              { label: '订单编号', value: String(currentRecharge.id) },
              { label: '充值链', value: currentRecharge.chain },
              { label: '充值金额', value: 'U ' + formatAmount(currentRecharge.amount) },
              { label: '订单状态', value: currentRecharge.statusText || currentRecharge.status || 'PENDING' },
              { label: '创建时间', value: formatTime(currentRecharge.createdAt) }
            ]" />
            <div class="address-block">
              <div class="address-label">收款地址</div>
              <div class="address-value">{{ currentRecharge.depositAddress || '后台暂未返回收款地址' }}</div>
              <a-button v-if="currentRecharge.depositAddress" size="small" @click="copy(currentRecharge.depositAddress)">复制地址</a-button>
            </div>
            <div v-if="currentRecharge.memo" class="address-block">
              <div class="address-label">Memo / Tag</div>
              <div class="address-value">{{ currentRecharge.memo }}</div>
              <a-button size="small" @click="copy(currentRecharge.memo)">复制 Memo</a-button>
            </div>
          </template>
          <EmptyState v-else title="暂无充值申报订单" />
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-card class="txn-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <div class="records-head">
        <div class="section-title">充值记录</div>
        <a-select v-model="recordStatus" placeholder="全部状态" allow-clear style="width: 160px" @change="queryRecords">
          <a-option value="PENDING">待确认</a-option>
          <a-option value="CONFIRMED">已确认</a-option>
          <a-option value="CANCELED">已取消</a-option>
        </a-select>
      </div>
      <a-table :data="recentDeposits" :loading="loadingRecords" :pagination="false" row-key="id" :bordered="false">
        <template #columns>
          <a-table-column title="订单编号" data-index="id" :width="220" />
          <a-table-column title="链" data-index="chain" :width="120" />
          <a-table-column title="金额" :width="140">
            <template #cell="{ record }">U {{ formatAmount(record.amount) }}</template>
          </a-table-column>
          <a-table-column title="状态" :width="130">
            <template #cell="{ record }"><a-tag :color="statusColor(record.status)">{{ record.statusText || record.status || 'PENDING' }}</a-tag></template>
          </a-table-column>
          <a-table-column title="创建时间">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="操作" :width="150">
            <template #cell="{ record }"><a-button type="text" @click="showDetail(record)">详情</a-button><a-button v-if="record.status === 'PENDING'" type="text" status="danger" :loading="cancelingRechargeId === record.id" @click="cancelRecharge(record)">取消申报</a-button></template>
          </a-table-column>
        </template>
        <template #empty><EmptyState :title="recordError || '暂无链上充值记录'" :action-text="recordError ? '重新加载' : undefined" @action="recordError && loadRecords()" /></template>
      </a-table>
      <div v-if="recordTotal > recordSize" class="pagination">
        <a-pagination
          :total="recordTotal"
          :current="recordCurrent"
          :page-size="recordSize"
          show-total
          @change="(page: number) => { recordCurrent = page; syncRecordsQuery(); }"
        />
      </div>
    </a-card>

    <a-drawer v-model:visible="detailOpen" title="充值订单详情" width="520" :footer="false">
      <a-spin :loading="detailLoading" style="width: 100%">
        <a-descriptions v-if="detail" :column="1" bordered :data="[
          { label: '订单编号', value: String(detail.id) },
          { label: '链', value: detail.chain },
          { label: '金额', value: 'U ' + formatAmount(detail.amount) },
          { label: '状态', value: detail.statusText || detail.status || 'PENDING' },
          { label: '收款地址', value: detail.depositAddress || '—' },
          { label: 'Memo / Tag', value: detail.memo || '—' },
          { label: '交易哈希', value: detail.txHash || '—' },
          { label: '创建时间', value: formatTime(detail.createdAt) },
          { label: '确认时间', value: formatTime(detail.confirmedAt) }
        ]" />
        <EmptyState v-else-if="detailError" :title="detailError" action-text="重新加载" @action="detailTargetId !== undefined && openDetail(detailTargetId)" />
      </a-spin>
    </a-drawer>
  </div>
</template>

<style scoped>
.deposit-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.hint { color: #86909c; font-size: 13px; margin: 0 0 16px; }
.tab-card, .txn-card { background: #fff; border-radius: var(--bw-card-radius); margin-bottom: 16px; }
.recharge-form { max-width: 720px; padding-top: 12px; }
.chain-alert { margin-bottom: 16px; }
.direct-address { margin-bottom: 16px; padding: 16px; background: #f7f8fa; border: 1px solid #e5e6eb; border-radius: 6px; }
.direct-address-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.direct-address-head > div { min-width: 0; }
.direct-address-value { margin-bottom: 0; }
.minimum-hint { color: #86909c; font-size: 12px; margin-top: 12px; }
.optional-order { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-top: 2px; }
.optional-order-title { color: #1d2129; font-size: 14px; font-weight: 600; }
.optional-order-hint { color: #86909c; font-size: 12px; margin-top: 4px; }
.address-block { margin-top: 16px; padding: 16px; background: #f7f8fa; border-radius: 6px; }
.address-label { color: #86909c; font-size: 12px; margin-bottom: 8px; }
.address-value { color: #1d2129; font-family: var(--yb-font-mono); overflow-wrap: anywhere; margin-bottom: 12px; }
.section-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 14px; padding-left: 8px; border-left: 3px solid var(--bw-brand-primary); }
.records-head { display: flex; justify-content: space-between; align-items: flex-start; }
.pagination { display: flex; justify-content: center; margin-top: 16px; }
.load-alert { margin-bottom: 16px; }
@media (max-width: 640px) {
  .deposit-page { padding-top: 10px; }
  .tab-card :deep(.arco-card-body), .txn-card :deep(.arco-card-body) { padding-left: 16px !important; padding-right: 16px !important; }
  .direct-address-head, .optional-order { align-items: stretch; flex-direction: column; }
  .direct-address-head .arco-btn, .optional-order .arco-btn { width: 100%; }
  .records-head { align-items: stretch; flex-direction: column; gap: 10px; }
  .records-head :deep(.arco-select) { width: 100% !important; }
}
</style>
