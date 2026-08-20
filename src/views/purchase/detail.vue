<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { enums, formatAmount } from '@shared';
import PushTierBadge from '@/components/purchase/push-tier-badge.vue';
import PurchaseStatusTimeline from '@/components/purchase/purchase-status-timeline.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const id = computed(() => String(route.params.id || ''));
const request = ref<Api.PurchaseRequest.PurchaseRequest>();
const pushLogs = ref<Api.PurchaseRequest.PushLog[]>([]);
const loading = ref(false);
const loadError = ref('');
const claiming = ref(false);
const canceling = ref(false);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const r = await purchaseApi.fetchPurchaseDetail(id.value);
    request.value = r.request;
    pushLogs.value = r.pushLogs;
  } catch {
    request.value = undefined;
    pushLogs.value = [];
    loadError.value = '求购详情加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  await userStore.init();
  await load();
});
watch(() => route.params.id, load);

const statusMeta = computed(() => (request.value ? enums.PURCHASE_STATUS_META[request.value.status] : undefined));
const aftersaleMeta = computed(() => (request.value ? enums.AFTERSALE_TYPE_META[request.value.aftersaleType] : undefined));

const isMyRequest = computed(() => userStore.currentUser?.id !== undefined && request.value?.customerId !== undefined
  && String(userStore.currentUser.id) === String(request.value.customerId));
const canClaim = computed(() => {
  if (!userStore.currentUser || !request.value) return false;
  if (request.value.status !== 'pushing') return false;
  return userStore.isBuyerActive;
});

async function pushNext() {
  if (!request.value) return;
  Message.warning('当前真实接口暂不支持手动推送下一批');
}

async function claim() {
  if (!request.value || !userStore.currentUser || claiming.value) return;
  claiming.value = true;
  try {
    const r = await purchaseApi.claimRequest(request.value.id);
    if (r.ok) {
      Message.success('接单成功');
      await load();
    } else {
      Message.error(r.message || '接单失败');
    }
  } catch {
    // 请求层已展示错误，保留当前求购供用户重试。
  } finally {
    claiming.value = false;
  }
}

function cancel() {
  if (!request.value) return;
  Modal.confirm({
    title: '撤销求购？',
    content: '撤销后不可恢复',
    okButtonProps: { status: 'danger' },
    async onOk() {
      if (canceling.value) return;
      canceling.value = true;
      try {
        const r = await purchaseApi.cancelPurchase(request.value!.id);
        if (r.ok) {
          Message.success('已撤销');
          await load();
        } else {
          Message.error(r.message || '撤销求购失败');
        }
      } catch {
        // 请求层已展示错误，保留当前求购供用户重试。
      } finally {
        canceling.value = false;
      }
    }
  });
}
</script>

<template>
  <div class="purchase-detail-page shop-container">
    <a-spin :loading="loading">
      <template v-if="request">
        <a-breadcrumb class="bread">
          <a-breadcrumb-item @click="router.push('/purchase/hall')">求购大厅</a-breadcrumb-item>
          <a-breadcrumb-item>{{ request.code }}</a-breadcrumb-item>
        </a-breadcrumb>

        <a-card class="hero-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
          <div class="hero-row">
            <div class="hero-left">
              <div class="hero-meta">
                <span class="code">{{ request.code }}</span>
                <a-tag v-if="statusMeta" :color="statusMeta.color" size="large">{{ statusMeta.label }}</a-tag>
                <PushTierBadge v-if="request.status === 'pushing' && request.currentPushLevel" :level="request.currentPushLevel" />
              </div>
              <div class="hero-title">{{ request.productTitle }}</div>
              <div class="hero-cat">📂 {{ request.categoryPath }}</div>
            </div>
            <div class="hero-right">
              <div class="budget-block">
                <div class="lbl">预算</div>
                <div class="budget">U {{ formatAmount(request.budgetAmount) }}</div>
              </div>
              <a-space direction="vertical">
                <a-button v-if="canClaim" type="primary" size="large" :loading="claiming" @click="claim">我接此单</a-button>
                <a-button
                  v-if="isMyRequest && ['pending_audit', 'pushing'].includes(request.status)"
                  status="danger"
                  :loading="canceling"
                  @click="cancel"
                >
                  撤销求购
                </a-button>
              </a-space>
            </div>
          </div>
        </a-card>

        <div class="layout-2col">
          <a-card class="info-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
            <div class="section-title">求购信息</div>
            <a-descriptions :column="2" :data="[
              { label: '期望发货', value: request.expectedDays + ' 天内' },
              { label: '接单截止', value: request.claimExpiresAt ? new Date(request.claimExpiresAt).toLocaleString() : '—' },
              { label: '海外过关', value: request.overseasCustoms ? '是' : '否' },
              { label: '售后类型', value: aftersaleMeta?.label || '—' },
              { label: '创建时间', value: new Date(request.createdAt).toLocaleString() }
            ]" />

            <a-divider />

            <div class="section-title">商品描述</div>
            <p class="desc">{{ request.productDescription || '—' }}</p>

            <div class="section-title">求购说明</div>
            <p class="desc">"{{ request.appeal }}"</p>

            <div v-if="request.evidenceUrls?.length" class="evi">
              <img v-for="(u, index) in request.evidenceUrls" :key="u" :src="u" :alt="`求购凭证 ${index + 1}`" />
            </div>
          </a-card>

          <a-card class="status-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
            <div class="section-title">求购进度</div>
            <PurchaseStatusTimeline :request="request" />

            <a-divider />

            <template v-if="request.status === 'pushing'">
              <div class="section-title">推送轨迹</div>
              <div class="push-info">
                <div class="push-row">
                  <span class="lbl">当前批次</span>
                  <PushTierBadge v-if="request.currentPushLevel" :level="request.currentPushLevel" />
                </div>
                <div class="push-row">
                  <span class="lbl">已推送买手</span>
                  <span class="val">{{ request.pushedToBuyerIds?.length || 0 }} 位</span>
                </div>
                <div v-if="request.nextPushAt" class="push-row">
                  <span class="lbl">下一批推送</span>
                  <span class="val">{{ new Date(request.nextPushAt).toLocaleString() }}</span>
                </div>
              </div>
              <a-button v-if="isMyRequest" class="push-btn" @click="pushNext">手动推送下一批 ›</a-button>
            </template>

            <template v-if="request.status === 'claimed'">
              <div class="section-title">接单信息</div>
              <p class="claimed-info">
                ✓ 已被买手 <strong>{{ request.claimedByName }}</strong> 接单
                <span v-if="request.relatedOrderCode" class="order-link">· 订单 {{ request.relatedOrderCode }}</span>
              </p>
            </template>

            <div v-if="pushLogs.length" class="push-logs">
              <div class="section-title">推送日志</div>
              <a-timeline>
                <a-timeline-item v-for="log in pushLogs" :key="log.id">
                  <PushTierBadge :level="log.pushLevel" />
                  <span class="log-text">推送至 {{ log.buyerIds.length }} 位买手</span>
                  <div class="log-time">{{ new Date(log.pushedAt).toLocaleString() }} · {{ log.actor }}</div>
                </a-timeline-item>
              </a-timeline>
            </div>
          </a-card>
        </div>
      </template>

      <EmptyState
        v-else-if="!loading"
        :title="loadError || '求购不存在'"
        :description="loadError ? '不会展示不完整的求购数据。' : undefined"
        :action-text="loadError ? '重新加载' : '返回大厅'"
        @action="loadError ? load() : router.push('/purchase/hall')"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.purchase-detail-page {
  padding-top: 16px;
}
.bread {
  margin-bottom: 12px;
}
.hero-card {
  background: linear-gradient(135deg, #fff 0%, #fff7e6 100%);
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
}
.code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: #86909c;
}
.hero-title {
  font-size: 22px;
  font-weight: 700;
  color: #1d2129;
  margin-bottom: 4px;
}
.hero-cat {
  font-size: 12px;
  color: #4e5969;
}
.hero-right {
  display: flex;
  align-items: center;
  gap: 24px;
}
.budget-block {
  text-align: right;
}
.budget-block .lbl {
  font-size: 11px;
  color: #86909c;
}
.budget {
  font-size: 32px;
  font-weight: 700;
  color: #f53f3f;
  font-family: ui-monospace, monospace;
}
.layout-2col {
  display: grid;
  grid-template-columns: 6fr 6fr;
  gap: 16px;
}
.info-card,
.status-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin: 16px 0 12px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.section-title:first-child {
  margin-top: 0;
}
.desc {
  color: #4e5969;
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 8px;
  white-space: pre-wrap;
}
.evi {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.evi img {
  width: 96px;
  height: 96px;
  border-radius: 4px;
  object-fit: cover;
}
.push-info {
  background: #f7faff;
  padding: 12px 16px;
  border-radius: 4px;
}
.push-row {
  display: flex;
  justify-content: space-between;
  margin: 4px 0;
  font-size: 13px;
}
.push-row .lbl {
  color: #86909c;
}
.push-btn {
  margin-top: 12px;
  width: 100%;
}
.claimed-info {
  color: #00b42a;
  font-size: 14px;
}
.order-link {
  color: #86909c;
  font-family: ui-monospace, monospace;
  margin-left: 4px;
}
.push-logs {
  margin-top: 16px;
}
.log-text {
  font-size: 12px;
  color: #4e5969;
  margin-left: 8px;
}
.log-time {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
}
</style>
