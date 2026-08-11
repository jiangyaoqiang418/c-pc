<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as refundApi from '@/service/api/refund';

const router = useRouter();
const activeKey = ref('all');
const activeStatus = computed(() => activeKey.value === 'all' ? undefined : activeKey.value);
const refunds = ref<Api.RealRefund.RefundDTO[]>([]);
const loading = ref(false);
const statusDefs = [
  { key: 'all', label: '全部' }, { key: 'APPLYING', label: '待平台审核' },
  { key: 'AGREED', label: '已同意' }, { key: 'REJECTED', label: '已驳回' }, { key: 'CANCELED', label: '已撤销' }
];
const statusColor: Record<string, string> = { APPLYING: 'orange', AGREED: 'green', REJECTED: 'red', CANCELED: 'gray' };
const statusLabel = (row: Api.RealRefund.RefundDTO) => row.statusText || ({ APPLYING: '待平台审核', AGREED: '已同意退款', REJECTED: '已驳回', CANCELED: '已撤销' }[String(row.status)] || row.status || '—');
const canCancel = (row: Api.RealRefund.RefundDTO) => String(row.status) === 'APPLYING';

async function load() {
  loading.value = true;
  try { refunds.value = (await refundApi.fetchMyRefunds({ pageNo: 1, pageSize: 30, status: activeStatus.value })).records || []; }
  finally { loading.value = false; }
}
onMounted(load); watch(activeKey, load);

function cancel(row: Api.RealRefund.RefundDTO) {
  Modal.confirm({ title: '撤销仅退款申请？', content: '撤销后订单会恢复到申请前状态。', okButtonProps: { status: 'danger' }, async onOk() {
    await refundApi.cancelRefund(row.refundId); Message.success('已撤销退款申请'); await load();
  }});
}
</script>

<template>
  <div class="aftersale-list-page shop-container">
    <h1 class="page-title">我的仅退款</h1>
    <a-tabs v-model:active-key="activeKey"><a-tab-pane v-for="item in statusDefs" :key="item.key" :title="item.label" /></a-tabs>
    <a-spin :loading="loading" style="width:100%"><template v-if="refunds.length"><a-card v-for="row in refunds" :key="row.refundId" class="case-card" :bordered="false" @click="router.push({name:'aftersale-detail',params:{id:String(row.refundId)}})">
      <div class="head"><strong>{{ row.productTitle || '仅退款申请' }}</strong><a-tag :color="statusColor[String(row.status)]">{{ statusLabel(row) }}</a-tag></div>
      <div class="meta">订单号：{{ row.orderNo || '—' }} · 退款金额：U {{ row.amount ?? '—' }}</div><p>{{ row.reason }}</p>
      <div class="actions" @click.stop><a-button size="small" @click="router.push({name:'aftersale-detail',params:{id:String(row.refundId)}})">详情</a-button><a-button v-if="canCancel(row)" size="small" status="danger" @click="cancel(row)">撤销</a-button></div>
    </a-card></template><EmptyState v-else title="暂无仅退款申请" description="可在待发货或待收货订单中申请仅退款" /></a-spin>
  </div>
</template>

<style scoped>
.aftersale-list-page { padding-top:16px; }.page-title { font-size:20px; margin:0 0 16px; }.case-card { margin-top:12px; cursor:pointer; }.head,.actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }.meta { font-size:12px; color:#86909c; margin-top:8px; }.case-card p { font-size:13px; margin:10px 0; color:#4e5969; }.actions { justify-content:flex-end; }
</style>
