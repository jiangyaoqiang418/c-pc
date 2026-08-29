<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { formatPoints } from '@shared';
import * as pointApi from '@/service/api/point';
import * as vipApi from '@/service/api/vip';
import VipBadge from '@/components/common/vip-badge.vue';
import VipBenefitsTable from '@/components/vip/vip-benefits-table.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const router = useRouter();

const vipStatus = ref<Api.RealVip.Status>();
const configs = ref<Api.Vip.LevelConfig[]>([]);
const pointRules = ref<Api.Point.Rule[]>([]);
const audience = ref<Api.Vip.Audience>('customer');
const loading = ref(false);
const vipLoadError = ref('');
const requestGuard = createLatestRequestGuard();
let disposed = false;

const user = computed(() => userStore.currentUser);

async function load() {
  if (disposed) return;
  const isCurrent = requestGuard.begin();
  const userId = userStore.currentUser?.id;
  loading.value = true;
  vipLoadError.value = '';
  try {
    const [configsResult, rulesResult] = await Promise.allSettled([
      vipApi.fetchVipConfigs({ signal: isCurrent.signal }),
      pointApi.fetchPointRules({ signal: isCurrent.signal })
    ]);
    if (!isCurrent()) return;
    configs.value = configsResult.status === 'fulfilled' ? configsResult.value : [];
    pointRules.value = rulesResult.status === 'fulfilled' ? rulesResult.value : [];
    const failedSections = [
      configsResult.status === 'rejected' ? 'VIP 配置' : '',
      rulesResult.status === 'rejected' ? '积分规则' : ''
    ].filter(Boolean);
    if (failedSections.length) {
      vipLoadError.value = `${failedSections.join('、')}加载失败，请稍后重试。`;
    }
    if (userId !== undefined && String(userStore.currentUser?.id) === String(userId)) {
      try {
        const vip = await vipApi.fetchMyVipStatus(userId, { signal: isCurrent.signal });
        if (!isCurrent()) return;
        vipStatus.value = vip;
        audience.value = vip.audience;
      } catch {
        if (!isCurrent()) return;
        vipStatus.value = undefined;
        audience.value = 'customer';
        vipLoadError.value = [vipLoadError.value, '当前等级读取失败，请稍后重试。'].filter(Boolean).join('；');
      }
    } else {
      vipStatus.value = undefined;
      audience.value = 'customer';
    }
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(async () => {
  await userStore.init();
  if (disposed) return;
  await load();
});
onBeforeUnmount(() => {
  disposed = true;
  requestGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  requestGuard.invalidate();
  vipStatus.value = undefined;
  audience.value = 'customer';
  vipLoadError.value = '';
  void load();
});

const progressPct = computed(() => {
  if (!user.value || !vipStatus.value?.nextThreshold) return 100;
  return Math.min(100, (user.value.points / vipStatus.value.nextThreshold) * 100);
});

const filteredRules = computed(() =>
  pointRules.value.filter(r => r.enabled && (r.audience === 'all' || r.audience === audience.value))
);

const audienceTabs: { value: Api.Vip.Audience; label: string }[] = [
  { value: 'customer', label: '顾客特权' },
  { value: 'buyer', label: '买手特权' }
];
</script>

<template>
  <div class="vip-page shop-container">
    <a-alert v-if="vipLoadError" type="error" :closable="false" class="load-alert">
      {{ vipLoadError }}
      <template #action><a-button size="mini" :loading="loading" @click="load">重新加载</a-button></template>
    </a-alert>
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="configs.length || pointRules.length">
        <!-- Hero -->
        <a-card v-if="user && vipStatus" class="hero-card" :body-style="{ padding: '28px 32px' }" :bordered="false">
          <div class="hero-row">
            <div class="hero-left">
              <div class="hero-meta">
                <VipBadge :level="user.vipLevel" />
                <span class="user-name">{{ user.nickname }}</span>
                <span class="user-audience">{{ user.isBuyer ? '买手' : '顾客' }}视角</span>
              </div>
              <div class="hero-points">
                <span class="points">{{ formatPoints(user.points) }}</span>
                <span class="unit">积分</span>
              </div>
              <div class="hero-progress">
                <template v-if="vipStatus.nextThreshold">
                  距离下一等级还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 分
                  <a-progress :percent="progressPct" :show-text="false" size="small" color="#fff" style="margin-top: 6px" />
                </template>
                <template v-else>已是最高等级 🎉</template>
              </div>
            </div>
            <div class="hero-right">
              <div class="hero-tier-cards">
                <div v-for="level in ['VIP0', 'VIP1', 'VIP2']" :key="level" class="tier-mini" :class="{ active: user.vipLevel === level }">
                  {{ level }}
                </div>
              </div>
            </div>
          </div>
        </a-card>
        <a-card v-else class="hero-card" :body-style="{ padding: '28px 32px' }" :bordered="false">
          <div class="hero-row">
            <div class="hero-left">
              <div class="hero-meta"><span class="user-name">VIP 等级与权益</span></div>
              <div class="hero-progress">登录后可查看当前积分、等级与升级进度。</div>
            </div>
            <a-button type="outline" @click="router.push({ name: 'login' })">登录查看我的等级</a-button>
          </div>
        </a-card>

        <!-- Audience Switch -->
        <a-card class="switch-card" :body-style="{ padding: '14px 24px' }" :bordered="false">
          <div class="switch-row">
            <span class="lbl">查看视角</span>
            <a-radio-group v-model="audience" type="button" size="medium">
              <a-radio v-for="t in audienceTabs" :key="t.value" :value="t.value">{{ t.label }}</a-radio>
            </a-radio-group>
            <span v-if="audience === 'buyer' && !user?.isBuyer" class="hint">
              （您当前为顾客身份，仅供查看；如需享受买手特权请先完成 KYC 并申请买手）
            </span>
          </div>
        </a-card>

        <!-- Benefits Table -->
        <div class="table-block">
          <VipBenefitsTable :audience="audience" :current-level="vipStatus?.vipLevel" :configs="configs" />
        </div>

        <!-- How to upgrade -->
        <a-card class="rules-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
          <div class="section-title">如何升级</div>
          <div class="rules-grid">
            <div v-for="r in filteredRules" :key="r.code" class="rule-cell">
              <div class="rule-name">{{ r.label }}</div>
              <div class="rule-meta">
                <span class="reward" :class="{ minus: r.pointsPerUnit < 0 }">
                  {{ r.pointsPerUnit > 0 ? '+' : '' }}{{ r.pointsPerUnit }} 分 / {{ r.unitLabel || '次' }}
                </span>
                <span v-if="r.capDaily" class="cap">每日上限 {{ r.capDaily }}</span>
              </div>
            </div>
          </div>
          <div class="rules-foot">
            <a-link @click="router.push(user ? '/points' : { name: 'login' })">{{ user ? '查看积分明细' : '登录后查看积分明细' }}</a-link>
          </div>
        </a-card>
      </template>
      <a-result v-else-if="!loading" status="warning" title="VIP 配置暂不可用" subtitle="请稍后刷新重试" />
    </a-spin>
  </div>
</template>

<style scoped>
.vip-page {
  padding-top: 16px;
}
.hero-card {
  background: linear-gradient(135deg, #722ed1 0%, #165dff 100%);
  color: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.hero-card :deep(.arco-card-body) {
  color: #fff;
}
.hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hero-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-name {
  font-size: 18px;
  font-weight: 700;
}
.user-audience {
  font-size: 12px;
  opacity: 0.78;
  background: rgba(255, 255, 255, 0.16);
  padding: 2px 8px;
  border-radius: 3px;
}
.hero-points {
  margin: 12px 0 8px;
  display: flex;
  align-items: baseline;
  gap: 6px;
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
.hero-progress {
  font-size: 13px;
  width: 320px;
}
.hero-tier-cards {
  display: flex;
  gap: 8px;
}
.tier-mini {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  border: 2px solid transparent;
}
.tier-mini.active {
  background: #fff;
  color: #722ed1;
  border-color: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  transform: scale(1.06);
}
.switch-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.switch-row {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.switch-row .lbl {
  color: #86909c;
  font-size: 13px;
}
.switch-row .hint {
  color: #86909c;
  font-size: 12px;
}
.table-block {
  margin-bottom: 16px;
}
.rules-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.rules-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.rule-cell {
  padding: 14px 16px;
  background: #f7faff;
  border-radius: 6px;
  border-left: 3px solid var(--bw-brand-primary);
}
.rule-name {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.rule-meta {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
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
.rules-foot {
  margin-top: 12px;
  text-align: right;
}
</style>
