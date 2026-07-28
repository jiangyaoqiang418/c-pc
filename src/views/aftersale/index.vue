<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { aftersaleApi, enums, formatAmount } from '@shared';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.Order.AftersaleStatus[];
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待响应', statuses: ['pending', 'shopper_agreed', 'shopper_rejected'] },
  { key: 'arbitrating', label: '仲裁中', statuses: ['arbitrating'] },
  { key: 'executing', label: '执行中', statuses: ['executing'] },
  { key: 'completed', label: '已完成', statuses: ['completed'] },
  { key: 'cancelled', label: '已撤销', statuses: ['cancelled'] }
];

const activeKey = ref('all');
const cases = ref<Api.Order.AftersaleCase[]>([]);
const loading = ref(false);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await aftersaleApi.fetchMyAftersales({
      customerId: userStore.currentUser.id,
      statuses: tab?.statuses,
      size: 30
    });
    cases.value = r.records;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(activeKey, load);

function detail(c: Api.Order.AftersaleCase) {
  router.push({ name: 'aftersale-detail', params: { id: String(c.id) } });
}

function openIm(c: Api.Order.AftersaleCase) {
  router.push({ name: 'im-order-group', params: { orderCode: c.orderCode } });
}

function cancel(c: Api.Order.AftersaleCase) {
  Modal.confirm({
    title: '撤销售后申请？',
    content: '撤销后该工单将不可恢复，如需重新申请请重新提交',
    okText: '确认撤销',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const r = await aftersaleApi.cancelAftersaleMock(c.id);
      if (r.ok) {
        Message.success('已撤销');
        load();
      }
    }
  });
}

const caseTypeMeta = (t: Api.Order.AftersaleCaseType) => enums.AFTERSALE_CASE_TYPE_META[t];
const statusMeta = (s: Api.Order.AftersaleStatus) => enums.AFTERSALE_STATUS_META[s];
</script>

<template>
  <div class="aftersale-list-page shop-container">
    <h1 class="page-title">我的售后</h1>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
        <a-tab-pane v-for="t in TABS" :key="t.key" :title="t.label" />
      </a-tabs>
    </a-card>

    <div class="list-wrap">
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="cases.length">
          <a-card
            v-for="c in cases"
            :key="c.id"
            class="case-card"
            :body-style="{ padding: '16px 20px' }"
            :bordered="false"
            hoverable
            @click="detail(c)"
          >
            <div class="head">
              <div class="head-left">
                <span class="code">{{ c.code }}</span>
                <a-tag :color="caseTypeMeta(c.caseType).color" size="small">{{ caseTypeMeta(c.caseType).label }}</a-tag>
                <a-tag :color="statusMeta(c.status).color" size="small">{{ statusMeta(c.status).label }}</a-tag>
              </div>
              <span class="time">{{ new Date(c.createdAt).toLocaleString() }}</span>
            </div>

            <div class="body">
              <div class="order-link">关联订单：<strong>{{ c.orderCode }}</strong></div>
              <p class="appeal">{{ c.appeal }}</p>
              <div v-if="c.evidenceUrls?.length" class="evi-preview">
                <img v-for="u in c.evidenceUrls.slice(0, 4)" :key="u" :src="u" />
                <span v-if="c.evidenceUrls.length > 4" class="more">+{{ c.evidenceUrls.length - 4 }}</span>
              </div>
            </div>

            <div v-if="c.refundAmount" class="amount-row">
              <span class="lbl">退款金额</span>
              <span class="amount">U {{ formatAmount(c.refundAmount) }}</span>
            </div>

            <div class="actions" @click.stop>
              <a-button size="small" type="outline" @click="detail(c)">详情</a-button>
              <a-button size="small" type="outline" @click="openIm(c)">打开三方群</a-button>
              <a-button v-if="c.status === 'pending'" size="small" status="danger" type="outline" @click="cancel(c)">
                撤销
              </a-button>
            </div>
          </a-card>
        </template>
        <EmptyState
          v-else
          title="该状态下没有售后工单"
          description="您的订单都很顺利！如果遇到问题，可在订单详情页申请售后"
        />
      </a-spin>
    </div>
  </div>
</template>

<style scoped>
.aftersale-list-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.list-wrap {
  margin-top: 16px;
}
.case-card {
  margin-bottom: 12px;
  cursor: pointer;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.time {
  font-size: 11px;
  color: #86909c;
}
.body {
  margin-bottom: 8px;
}
.order-link {
  font-size: 12px;
  color: #4e5969;
  margin-bottom: 6px;
}
.appeal {
  color: #1d2129;
  font-size: 13px;
  margin: 4px 0 8px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.evi-preview {
  display: flex;
  gap: 6px;
  align-items: center;
}
.evi-preview img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}
.evi-preview .more {
  background: #f7f8fa;
  color: #86909c;
  padding: 0 8px;
  border-radius: 4px;
  height: 60px;
  display: flex;
  align-items: center;
  font-size: 12px;
}
.amount-row {
  margin-bottom: 8px;
  font-size: 13px;
}
.amount-row .lbl {
  color: #86909c;
}
.amount {
  color: #f53f3f;
  font-weight: 600;
  margin-left: 8px;
  font-family: ui-monospace, monospace;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
