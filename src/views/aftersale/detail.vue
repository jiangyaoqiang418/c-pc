<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { aftersaleApi, enums, formatAmount } from '@shared';
import AftersaleStatusTimeline from '@/components/aftersale/aftersale-status-timeline.vue';
import AftersaleVerdictCard from '@/components/aftersale/aftersale-verdict-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const route = useRoute();
const router = useRouter();

const id = computed(() => Number(route.params.id));
const caseRow = ref<Api.Order.AftersaleCase>();
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    caseRow.value = await aftersaleApi.fetchAftersaleDetail(id.value);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => route.params.id, load);

const caseTypeMeta = computed(() =>
  caseRow.value ? enums.AFTERSALE_CASE_TYPE_META[caseRow.value.caseType] : undefined
);
const statusMeta = computed(() => (caseRow.value ? enums.AFTERSALE_STATUS_META[caseRow.value.status] : undefined));

function cancel() {
  if (!caseRow.value) return;
  Modal.confirm({
    title: '撤销售后申请？',
    content: '撤销后该工单将不可恢复',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const r = await aftersaleApi.cancelAftersaleMock(caseRow.value!.id);
      if (r.ok) {
        Message.success('已撤销');
        load();
      }
    }
  });
}

function openIm() {
  if (!caseRow.value) return;
  router.push({ name: 'im-order-group', params: { orderCode: caseRow.value.orderCode } });
}

function goOrder() {
  if (!caseRow.value) return;
  router.push({ name: 'order-detail', params: { id: String(caseRow.value.orderId) } });
}
</script>

<template>
  <div class="aftersale-detail-page shop-container">
    <a-spin :loading="loading">
      <template v-if="caseRow">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item @click="router.push('/aftersale')">我的售后</a-breadcrumb-item>
          <a-breadcrumb-item>{{ caseRow.code }}</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="hero-card" :body-style="{ padding: '24px 28px' }" :bordered="false">
          <div class="hero-row">
            <div class="hero-left">
              <div class="hero-meta">
                <span class="code">{{ caseRow.code }}</span>
                <a-tag v-if="statusMeta" :color="statusMeta.color" size="large">{{ statusMeta.label }}</a-tag>
                <a-tag v-if="caseTypeMeta" :color="caseTypeMeta.color" size="large">{{ caseTypeMeta.label }}</a-tag>
              </div>
              <div class="hero-sub">关联订单 {{ caseRow.orderCode }} · 创建于 {{ new Date(caseRow.createdAt).toLocaleString() }}</div>
            </div>
            <a-space>
              <a-button @click="goOrder">查看订单</a-button>
              <a-button type="primary" @click="openIm">打开三方群</a-button>
              <a-button v-if="caseRow.status === 'pending'" status="danger" @click="cancel">撤销申请</a-button>
            </a-space>
          </div>
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="section-title">售后进度</div>
          <AftersaleStatusTimeline :case-record="caseRow" />
        </a-card>

        <a-card class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="section-title">顾客诉求</div>
          <div class="appeal-box">{{ caseRow.appeal }}</div>
          <div v-if="caseRow.evidenceUrls?.length" class="evidence">
            <img v-for="u in caseRow.evidenceUrls" :key="u" :src="u" />
          </div>
        </a-card>

        <a-card v-if="caseRow.shopperResponse" class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="section-title">买手响应</div>
          <a-tag :color="caseRow.shopperResponse === 'agreed' ? 'green' : 'red'" size="medium">
            {{ caseRow.shopperResponse === 'agreed' ? '已同意' : '已拒绝' }}
          </a-tag>
          <p v-if="caseRow.shopperResponseNote" class="response-note">"{{ caseRow.shopperResponseNote }}"</p>
        </a-card>

        <a-card v-if="caseRow.verdict" class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <AftersaleVerdictCard :case-record="caseRow" />
        </a-card>

        <a-card v-if="caseRow.history?.length" class="step-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="section-title">事件历史 ({{ caseRow.history.length }})</div>
          <a-timeline>
            <a-timeline-item v-for="ev in caseRow.history" :key="ev.id">
              <div class="event-row">
                <span class="action">{{ ev.action }}</span>
                <span class="actor">{{ ev.actor }}</span>
                <span class="event-time">{{ new Date(ev.time).toLocaleString() }}</span>
              </div>
              <div v-if="ev.note" class="event-note">{{ ev.note }}</div>
            </a-timeline-item>
          </a-timeline>
        </a-card>
      </template>

      <EmptyState v-else-if="!loading" title="售后工单不存在" action-text="返回列表" @action="router.push('/aftersale')" />
    </a-spin>
  </div>
</template>

<style scoped>
.aftersale-detail-page {
  padding-top: 16px;
}
.bread {
  margin-bottom: 12px;
}
.hero-card {
  background: linear-gradient(135deg, #fff 0%, #f7faff 100%);
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.hero-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.code {
  font-family: ui-monospace, monospace;
  font-size: 16px;
  font-weight: 700;
  color: #1d2129;
}
.hero-sub {
  font-size: 12px;
  color: #86909c;
}
.step-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.appeal-box {
  background: #f7f8fa;
  padding: 12px 14px;
  border-radius: 4px;
  font-size: 13px;
  color: #1d2129;
  line-height: 1.6;
  margin-bottom: 12px;
  white-space: pre-wrap;
}
.evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.evidence img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
}
.response-note {
  margin-top: 10px;
  font-size: 13px;
  color: #4e5969;
  font-style: italic;
}
.event-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #1d2129;
}
.action {
  background: #f3f7ff;
  color: var(--bw-brand-primary);
  padding: 1px 8px;
  border-radius: 3px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.actor {
  color: #4e5969;
}
.event-time {
  color: #86909c;
}
.event-note {
  color: #4e5969;
  font-size: 12px;
  margin-top: 4px;
}
</style>
