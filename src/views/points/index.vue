<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { formatPoints } from '@shared';
import * as pointApi from '@/service/api/point';
import * as vipApi from '@/service/api/vip';
import PointBehaviorTag from '@/components/profile/point-behavior-tag.vue';
import PointLogRow from '@/components/profile/point-log-row.vue';
import EmptyState from '@/components/common/empty-state.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const activeTab = ref<'logs' | 'appeals' | 'rules'>('logs');
const logs = ref<Api.RealPoint.Ledger[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const logLoadError = ref('');
const rules = ref<Api.Point.Rule[]>([]);
const rulesLoadError = ref('');
const vipStatus = ref<Api.RealVip.Status>();
const appeals = ref<Api.RealPoint.PointAppealDTO[]>([]);
const appealTotal = ref(0);
const appealCurrent = ref(1);
const appealSize = ref(20);
const appealLoading = ref(false);
const appealLoadError = ref('');
const appealModalOpen = ref(false);
const appealSubmitting = ref(false);
const appealTarget = ref<Api.RealPoint.Ledger>();
const appealForm = reactive({ reason: '' });
const appealFilter = reactive<{
  keyword?: string;
  status?: Api.RealPoint.PointAppealStatus;
}>({});

const filter = reactive<{
  behaviors: Api.Point.BehaviorCode[];
  dateRange?: string[];
}>({ behaviors: [] });

const ALL_BEHAVIORS: Api.Point.BehaviorCode[] = [
  'CONSUME', 'DEPOSIT_IN', 'RECHARGE', 'WITHDRAW', 'FINANCE_HOLD',
  'ORDER_DONE', 'KYC_PASS', 'REVIEW_GOOD', 'REVIEW_BAD', 'DEPOSIT_PLEDGE', 'BUYER_NO_FULFILL'
];

async function loadLogs() {
  if (!userStore.currentUser) return;
  loading.value = true;
  logLoadError.value = '';
  try {
    const r = await pointApi.fetchMyPointLogs({
      userId: userStore.currentUser.id,
      current: current.value,
      size: size.value,
      behaviors: filter.behaviors.length ? filter.behaviors : undefined,
      fromAt: filter.dateRange?.[0],
      toAt: filter.dateRange?.[1]
    });
    logs.value = r.records;
    total.value = r.total;
  } catch {
    logs.value = [];
    total.value = 0;
    logLoadError.value = '积分流水加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}

async function loadRules() {
  rulesLoadError.value = '';
  try {
    rules.value = await pointApi.fetchPointRules();
  } catch {
    rules.value = [];
    rulesLoadError.value = '积分规则加载失败，请检查网络后重试。';
  }
}

async function loadAppeals() {
  const userId = userStore.currentUser?.id;
  if (!userId) return;
  appealLoading.value = true;
  appealLoadError.value = '';
  try {
    const r = await pointApi.fetchMyPointAppeals({
      pageNo: appealCurrent.value,
      pageSize: appealSize.value,
      keyword: appealFilter.keyword || undefined,
      status: appealFilter.status,
      userId: String(userId)
    });
    appeals.value = r.records;
    appealTotal.value = r.total;
  } catch {
    appeals.value = [];
    appealTotal.value = 0;
    appealLoadError.value = '积分申诉记录加载失败，请检查网络后重试。';
  } finally {
    appealLoading.value = false;
  }
}

async function loadInitial() {
  const uid = userStore.currentUser?.id;
  if (!uid) return;
  try {
    vipStatus.value = await vipApi.fetchMyVipStatus(uid);
  } catch {
    vipStatus.value = undefined;
  }
  await loadLogs();
  await loadRules();
}

onMounted(loadInitial);

watch(() => userStore.currentUser?.id, () => {
  current.value = 1;
  appealCurrent.value = 1;
  loadInitial();
  if (activeTab.value === 'appeals') loadAppeals();
});

watch(activeTab, t => {
  if (t === 'rules' && !rules.value.length) loadRules();
  if (t === 'appeals') loadAppeals();
});

const user = computed(() => userStore.currentUser);
const progressPct = computed(() => {
  if (!user.value || !vipStatus.value?.nextThreshold) return 100;
  return Math.min(100, (user.value.points / vipStatus.value.nextThreshold) * 100);
});

function openAppeal(log: Api.RealPoint.Ledger) {
  appealTarget.value = log;
  appealForm.reason = '';
  appealModalOpen.value = true;
}

async function submitAppeal() {
  if (appealSubmitting.value) return;
  const reason = appealForm.reason.trim();
  if (!appealTarget.value || reason.length < 10) {
    Message.warning('原因至少 10 字');
    return;
  }
  appealSubmitting.value = true;
  try {
    const r = await pointApi.appealPointLog({ logId: appealTarget.value.id, reason });
    if (!r.ok) {
      Message.error(r.message || '提交失败');
      return;
    }
    Message.success('申诉已提交');
    appealModalOpen.value = false;
    await Promise.all([loadLogs(), loadAppeals()]);
  } finally {
    appealSubmitting.value = false;
  }
}

function reset() {
  filter.behaviors = [];
  filter.dateRange = undefined;
  current.value = 1;
  loadLogs();
}

function resetAppeals() {
  appealFilter.keyword = undefined;
  appealFilter.status = undefined;
  appealCurrent.value = 1;
  loadAppeals();
}

function appealStatusText(status: Api.RealPoint.PointAppealStatus) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }[status];
}

function appealStatusColor(status: Api.RealPoint.PointAppealStatus) {
  return { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red' }[status];
}

const filteredRules = computed(() => rules.value.filter(r => r.enabled));
</script>

<template>
  <div class="points-page shop-container">
    <a-card v-if="user && vipStatus" class="hero-card" :body-style="{ padding: '24px 28px' }" :bordered="false">
      <div class="hero-row">
        <div class="hero-left">
          <div class="user-meta">
            <span class="user-name">{{ user.nickname }}</span>
            <VipBadge :level="user.vipLevel" />
          </div>
          <div class="points-block">
            <span class="points">{{ formatPoints(user.points) }}</span>
            <span class="unit">积分</span>
          </div>
          <div v-if="vipStatus.nextThreshold" class="progress-block">
            距 {{ vipStatus.vipLevel === 'VIP0' ? 'VIP1' : 'VIP2' }} 还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 分
            <a-progress :percent="progressPct" :show-text="false" size="small" color="#fff" style="margin-top: 6px" />
          </div>
        </div>
      </div>
    </a-card>

    <a-card :bordered="false" :body-style="{ padding: 0 }" class="tab-card">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="logs" title="积分流水" />
        <a-tab-pane key="appeals" title="申诉记录" />
        <a-tab-pane key="rules" title="积分规则" />
      </a-tabs>
    </a-card>

    <template v-if="activeTab === 'logs'">
      <a-card class="filter-card" :body-style="{ padding: '14px 20px' }" :bordered="false">
        <a-form :model="filter" layout="inline">
          <a-form-item label="行为">
            <a-select
              v-model="filter.behaviors"
              placeholder="全部"
              multiple
              allow-clear
              style="min-width: 280px"
            >
              <a-option v-for="b in ALL_BEHAVIORS" :key="b" :value="b">{{ b }}</a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="日期范围">
            <a-range-picker v-model="filter.dateRange" />
          </a-form-item>
          <a-button type="primary" @click="(() => { current = 1; loadLogs(); })()">查询</a-button>
          <a-button @click="reset">重置</a-button>
        </a-form>
      </a-card>

      <a-card :bordered="false" :body-style="{ padding: 0 }" class="list-card">
        <a-spin :loading="loading" style="width: 100%">
          <template v-if="logs.length">
            <PointLogRow v-for="l in logs" :key="l.id" :log="l" @appeal="openAppeal" />
          </template>
          <EmptyState
            v-else
            :title="logLoadError || '暂无积分流水'"
            :description="logLoadError ? '不会把请求失败误显示为没有积分流水。' : '完成订单 / 评价 / KYC 等可获得积分'"
            :action-text="logLoadError ? '重新加载' : undefined"
            @action="loadLogs"
          />
        </a-spin>
      </a-card>

      <div v-if="total > size" class="pagination-bar">
        <a-pagination
          :total="total"
          :current="current"
          :page-size="size"
          show-total
          @change="(p: number) => { current = p; loadLogs(); }"
        />
      </div>
    </template>

    <template v-else-if="activeTab === 'appeals'">
      <a-card class="filter-card" :body-style="{ padding: '14px 20px' }" :bordered="false">
        <a-form :model="appealFilter" layout="inline">
          <a-form-item label="关键词">
            <a-input v-model="appealFilter.keyword" allow-clear placeholder="行为或申诉原因" style="width: 220px" />
          </a-form-item>
          <a-form-item label="状态">
            <a-select v-model="appealFilter.status" allow-clear placeholder="全部" style="width: 140px">
              <a-option value="PENDING">待审核</a-option>
              <a-option value="APPROVED">已通过</a-option>
              <a-option value="REJECTED">已驳回</a-option>
            </a-select>
          </a-form-item>
          <a-button type="primary" @click="(() => { appealCurrent = 1; loadAppeals(); })()">查询</a-button>
          <a-button @click="resetAppeals">重置</a-button>
        </a-form>
      </a-card>

      <a-card :bordered="false" :body-style="{ padding: 0 }" class="list-card">
        <a-table :data="appeals" :loading="appealLoading" :pagination="false" row-key="id">
          <template #columns>
            <a-table-column title="行为" :width="160">
              <template #cell="{ record }">{{ record.behaviorName || record.behaviorCode || '-' }}</template>
            </a-table-column>
            <a-table-column title="原积分" data-index="originalScore" :width="100" />
            <a-table-column title="申诉原因" data-index="reason" />
            <a-table-column title="状态" :width="100">
              <template #cell="{ record }">
                <a-tag :color="appealStatusColor(record.status)">{{ appealStatusText(record.status) }}</a-tag>
              </template>
            </a-table-column>
            <a-table-column title="审核意见" :width="200">
              <template #cell="{ record }">{{ record.reviewComment || record.decision || '-' }}</template>
            </a-table-column>
            <a-table-column title="提交时间" data-index="createdAt" :width="180" />
          </template>
          <template #empty>
            <EmptyState
              :title="appealLoadError || '暂无申诉记录'"
              :description="appealLoadError ? '不会把请求失败误显示为没有申诉记录。' : undefined"
              :action-text="appealLoadError ? '重新加载' : undefined"
              @action="loadAppeals"
            />
          </template>
        </a-table>
      </a-card>

      <div v-if="appealTotal > appealSize" class="pagination-bar">
        <a-pagination
          :total="appealTotal"
          :current="appealCurrent"
          :page-size="appealSize"
          show-total
          @change="(p: number) => { appealCurrent = p; loadAppeals(); }"
        />
      </div>
    </template>

    <template v-else>
      <EmptyState
        v-if="rulesLoadError"
        :title="rulesLoadError"
        description="不会把请求失败误显示为没有积分规则。"
        action-text="重新加载"
        @action="loadRules"
      />
      <div v-else class="rules-grid">
        <a-card
          v-for="r in filteredRules"
          :key="r.code"
          class="rule-card"
          :body-style="{ padding: '16px 20px' }"
          :bordered="false"
        >
          <div class="rule-head">
            <PointBehaviorTag :behavior="r.code" />
            <a-tag size="small">{{ r.audience === 'all' ? '通用' : r.audience === 'buyer' ? '买手' : '顾客' }}</a-tag>
          </div>
          <div class="rule-name">{{ r.label }}</div>
          <div class="rule-desc">{{ r.description }}</div>
          <div class="rule-reward">
            <span class="reward" :class="{ minus: r.pointsPerUnit < 0 }">
              {{ r.pointsPerUnit > 0 ? '+' : '' }}{{ r.pointsPerUnit }} 分 / {{ r.unitLabel || '次' }}
            </span>
            <span v-if="r.capDaily" class="cap">每日上限 {{ r.capDaily }}</span>
          </div>
        </a-card>
      </div>
    </template>

    <a-modal v-model:visible="appealModalOpen" title="积分申诉" :ok-loading="appealSubmitting" @ok="submitAppeal">
      <a-form :model="appealForm" layout="vertical">
        <a-form-item label="申诉原因" required>
          <a-textarea v-model="appealForm.reason" :max-length="500" :auto-size="{ minRows: 4, maxRows: 8 }" placeholder="请说明申诉原因，至少 10 个字" show-word-limit />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.points-page {
  padding-top: 16px;
}
.hero-card {
  background: linear-gradient(135deg, var(--yb-deep) 0%, var(--yb-deep-2) 60%, var(--yb-primary) 100%);
  color: #fff;
  border-radius: var(--yb-radius-card);
  margin-bottom: 16px;
}
.hero-card :deep(.arco-card-body) {
  color: #fff;
}
.user-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.user-name {
  font-size: 18px;
  font-weight: 700;
}
.points-block {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 10px 0;
}
.points {
  font-size: 40px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.unit {
  font-size: 13px;
  opacity: 0.78;
}
.progress-block {
  font-size: 12px;
  opacity: 0.92;
  width: 320px;
}
.tab-card,
.filter-card,
.list-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 12px;
}
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
.rules-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.rule-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.rule-head {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  align-items: center;
}
.rule-name {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 4px;
}
.rule-desc {
  font-size: 12px;
  color: #86909c;
  line-height: 1.5;
  margin-bottom: 8px;
  min-height: 3em;
}
.rule-reward {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed #f2f3f5;
}
.reward {
  color: #f53f3f;
  font-weight: 600;
  font-size: 13px;
}
.reward.minus {
  color: #4e5969;
}
.cap {
  color: #86909c;
  font-size: 11px;
}
</style>
