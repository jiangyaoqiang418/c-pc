<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import UmIcon from '@/components/common/um-icon.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { formatPoints } from '@shared';
import * as pointApi from '@/service/api/point';
import * as vipApi from '@/service/api/vip';
import VipBenefitsTable from '@/components/vip/vip-benefits-table.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const router = useRouter();

const vipStatus = ref<Api.RealVip.Status>();
const configs = ref<Api.RealVip.LevelConfig[]>([]);
const pointRules = ref<Api.RealPoint.Rule[]>([]);
const audience = ref<Api.Vip.Audience>('customer');
const loading = ref(true);
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
        const vip = await vipApi.fetchMyVipStatus(userId, { signal: isCurrent.signal, audience: userStore.currentAudience });
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
watch([() => userStore.currentUser?.id, () => userStore.currentAudience], (next, previous) => {
  if (disposed) return;
  if (String(next[0]) === String(previous[0]) && next[1] === previous[1]) return;
  requestGuard.invalidate();
  vipStatus.value = undefined;
  audience.value = 'customer';
  vipLoadError.value = '';
  void load();
});

const progressPct = computed(() => {
  if (!vipStatus.value?.nextThreshold) return undefined;
  const percentage = vipStatus.value.points / vipStatus.value.nextThreshold * 100;
  return Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : undefined;
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
  <div class="v47-membership vip-page">
    <div class="page-heading compact"><h1>VIP 特权</h1><span class="heading-meta">{{ vipStatus?.vipLevel || '等级待确认' }}</span></div>
    <section class="paper membership-overview"><h2>会员等级与权益</h2><div class="status-banner"><UmIcon name="shield" /><span>权益以平台配置为准<small>不预设折扣、收益或积分阈值。正式等级与升级规则由现有接口返回。</small></span></div><button class="outline" @click="router.push(user ? '/points' : { name: 'login' })">查看积分明细 →</button></section>
    <div v-if="vipLoadError" class="status-banner membership-notice" role="alert"><UmIcon name="return" /><span>{{ vipLoadError }}</span><button class="outline" :disabled="loading" @click="load">重新读取</button></div>
    <div v-if="loading && !configs.length && !pointRules.length" class="membership-skeletons" aria-busy="true"><span class="sr-only" role="status">正在读取会员配置与积分规则</span><Skeleton class="h-56" /><Skeleton class="h-72" /></div>
    <template v-else-if="configs.length || pointRules.length">
      <section v-if="user && loading && !vipStatus" class="paper membership-current" aria-busy="true"><div class="membership-current-head"><div><span class="eyebrow">YOUR MEMBERSHIP</span><h2 role="status">正在读取等级状态…</h2><Skeleton class="mt-2 h-5 w-24" /></div><Skeleton class="h-9 w-28" /></div><Skeleton class="mt-5 h-5 w-full" /></section>
      <section v-else-if="user && vipStatus" class="paper membership-current"><div class="membership-current-head"><div><span class="eyebrow">YOUR MEMBERSHIP</span><h2>{{ vipStatus.vipLevel }} · {{ user.nickname }}</h2><p>{{ vipStatus.audience === 'buyer' ? '买手' : '顾客' }}权益</p></div><strong class="membership-points">{{ formatPoints(vipStatus.points) }} <small>积分</small></strong></div><div v-if="vipStatus.nextThreshold !== undefined" class="membership-progress"><p>距离下一等级还差 {{ formatPoints(vipStatus.pointsToNext, '—') }} 积分</p><div v-if="progressPct !== undefined" class="membership-progress-track" role="progressbar" aria-label="VIP 升级进度" :aria-valuenow="Math.round(progressPct)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: progressPct + '%' }" /></div></div><p v-else class="membership-max-level">{{ vipStatus.vipLevel === 'VIP2' ? '已是最高等级' : '下一等级规则尚未提供' }}</p></section>
      <section v-else class="paper membership-current"><h2>{{ user ? '当前等级暂未取得' : '开启您的会员权益' }}</h2><p>{{ user ? '请重新读取账号等级，不会将读取失败显示为 VIP0。' : '登录后可查看当前积分、等级与升级进度。' }}</p><button class="outline" :disabled="loading" @click="user ? load() : router.push({ name: 'login' })">{{ user ? '重新读取等级' : '登录查看我的等级' }}</button></section>
      <nav class="tabs membership-audience" aria-label="查看权益视角"><button v-for="t in audienceTabs" :key="t.value" :class="{ active: audience === t.value }" :aria-pressed="audience === t.value" @click="audience = t.value">{{ t.label }}</button></nav><p v-if="audience === 'buyer' && !user?.isBuyer" class="membership-audience-hint">当前买手权益仅供查看；实际资格以实名认证及买手审核结果为准。</p>
      <VipBenefitsTable :audience="audience" :current-level="vipStatus?.audience === audience ? vipStatus.vipLevel : undefined" :configs="configs" />
      <section class="paper membership-rules"><div class="section-heading"><h2>如何升级</h2><button class="text-link" @click="router.push(user ? '/points' : { name: 'login' })">{{ user ? '查看积分明细' : '登录后查看积分明细' }}<UmIcon name="arrow" /></button></div><div v-if="filteredRules.length" class="membership-rule-grid"><article v-for="r in filteredRules" :key="r.code" class="membership-rule-cell"><h3>{{ r.label }}</h3><strong :class="{ minus: r.pointsPerUnit < 0 }">{{ r.pointsPerUnit > 0 ? '+' : '' }}{{ r.pointsPerUnit }} 分 / {{ r.unitLabel || '次' }}</strong><small v-if="r.capDaily">每日上限 {{ r.capDaily }}</small></article></div><EmptyState v-else title="当前视角暂无可用积分规则" /></section>
    </template>
    <EmptyState v-else title="VIP 配置暂不可用" description="请稍后刷新重试" action-text="重新读取" @action="load" />
  </div>
</template>

<style scoped src="../../components/profile/v47-membership.css"></style>
