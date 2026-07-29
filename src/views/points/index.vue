<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import { formatPoints } from '@shared';
import * as pointApi from '@/service/api/point';
import * as vipApi from '@/service/api/vip';
import PointBehaviorTag from '@/components/profile/point-behavior-tag.vue';
import PointLogRow from '@/components/profile/point-log-row.vue';
import EmptyState from '@/components/common/empty-state.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const activeTab = ref<'logs' | 'rules'>('logs');
const logs = ref<Api.Point.LogEntry[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const rules = ref<Api.Point.Rule[]>([]);
const vipStatus = ref<Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>>();

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
  } finally {
    loading.value = false;
  }
}

async function loadRules() {
  try {
    rules.value = await pointApi.fetchPointRules();
  } catch {
    rules.value = [];
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
  loadInitial();
});

watch(activeTab, t => {
  if (t === 'rules' && !rules.value.length) loadRules();
});

const user = computed(() => userStore.currentUser);
const progressPct = computed(() => {
  if (!user.value || !vipStatus.value?.nextThreshold) return 100;
  return Math.min(100, (user.value.points / vipStatus.value.nextThreshold) * 100);
});

async function appeal(log: Api.Point.LogEntry) {
  // 用 Modal + input 收集 reason（mock，简化用 prompt 替代复杂 Modal）
  // eslint-disable-next-line no-alert
  const reason = window.prompt('申诉原因（≥ 10 字）');
  if (!reason || reason.trim().length < 10) {
    Message.warning('原因至少 10 字');
    return;
  }
  const r = await pointApi.appealPointLog({ logId: log.id, reason: reason.trim() });
  if (r.ok) {
    Message.success('申诉已提交');
    loadLogs();
  } else {
    Message.error(r.message || '提交失败');
  }
}

function reset() {
  filter.behaviors = [];
  filter.dateRange = undefined;
  current.value = 1;
  loadLogs();
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
            <PointLogRow v-for="l in logs" :key="l.id" :log="l" @appeal="appeal" />
          </template>
          <EmptyState v-else title="暂无积分流水" description="完成订单 / 评价 / KYC 等可获得积分" />
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

    <template v-else>
      <div class="rules-grid">
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
