<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmptyState from '@/components/common/empty-state.vue';
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
const pointRules = ref<Api.RealPoint.Rule[]>([]);
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
  return Math.min(100, (vipStatus.value.points / vipStatus.value.nextThreshold) * 100);
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
    <header class="page-head"><span class="eyebrow">MEMBERSHIP BENEFITS</span><h1>VIP 等级与权益</h1><p>等级、权益和升级条件以平台当前配置为准。</p></header>
    <Alert v-if="vipLoadError" variant="destructive" class="load-alert"><Icon icon="lucide:circle-alert" /><AlertDescription>{{ vipLoadError }}<div class="alert-actions"><Button variant="outline" :disabled="loading" @click="load">重新加载</Button></div></AlertDescription></Alert>
    <div v-if="loading && !configs.length && !pointRules.length" class="loading-grid"><Skeleton class="h-56" /><Skeleton class="h-72" /></div>
    <template v-else-if="configs.length || pointRules.length">
      <section v-if="user && vipStatus" class="hero-card"><div class="hero-main"><div class="hero-meta"><VipBadge :level="user.vipLevel" /><span class="user-name" :title="user.nickname">{{ user.nickname }}</span><span class="user-audience">{{ user.isBuyer ? '买手' : '顾客' }}视角</span></div><div class="hero-points"><strong>{{ user.points === undefined ? '—' : formatPoints(user.points) }}</strong><span>积分</span></div><div v-if="vipStatus.nextThreshold" class="hero-progress">距离下一等级还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 分<Progress :model-value="progressPct" class="vip-progress" /></div><div v-else class="hero-progress"><Icon icon="lucide:crown" width="16" />已是最高等级</div></div><div class="hero-tiers"><div v-for="level in ['VIP0', 'VIP1', 'VIP2']" :key="level" class="tier-mini" :class="{ active: user.vipLevel === level }"><Icon :icon="level === 'VIP2' ? 'lucide:crown' : level === 'VIP1' ? 'lucide:star' : 'lucide:circle-user'" width="20" /><span>{{ level }}</span></div></div></section>
      <section v-else class="hero-card"><div class="hero-main"><h2>{{ user ? '当前等级暂未取得' : '开启您的会员权益' }}</h2><p>{{ user ? '请重新读取账号等级，不会将读取失败显示为 VIP0。' : '登录后可查看当前积分、等级与升级进度。' }}</p></div><Button v-if="user" variant="outline" class="hero-button" :disabled="loading" @click="load">重新读取等级</Button><Button v-else variant="outline" class="hero-button" @click="router.push({ name: 'login' })">登录查看我的等级</Button></section>
      <section class="audience-panel"><span class="audience-label">查看视角</span><Tabs v-model="audience" class="page-tabs"><TabsList><TabsTrigger v-for="t in audienceTabs" :key="t.value" :value="t.value">{{ t.label }}</TabsTrigger></TabsList></Tabs><span v-if="audience === 'buyer' && !user?.isBuyer" class="audience-hint">您当前为顾客身份，仅供查看；如需享受买手特权请先完成 KYC 并申请买手。</span></section>
      <VipBenefitsTable :audience="audience" :current-level="vipStatus?.vipLevel" :configs="configs" />
      <section class="rules-panel"><header><h2>如何升级</h2><Button variant="link" @click="router.push(user ? '/points' : { name: 'login' })">{{ user ? '查看积分明细' : '登录后查看积分明细' }}<Icon icon="lucide:arrow-right" width="15" /></Button></header><div v-if="filteredRules.length" class="rules-grid"><article v-for="r in filteredRules" :key="r.code" class="rule-cell"><h3>{{ r.label }}</h3><strong :class="{ minus: r.pointsPerUnit < 0 }">{{ r.pointsPerUnit > 0 ? '+' : '' }}{{ r.pointsPerUnit }} 分 / {{ r.unitLabel || '次' }}</strong><span v-if="r.capDaily">每日上限 {{ r.capDaily }}</span></article></div><EmptyState v-else title="当前视角暂无可用积分规则" /></section>
    </template>
    <EmptyState v-else title="VIP 配置暂不可用" description="请稍后刷新重试" action-text="重新加载" @action="load" />
  </div>
</template>

<style scoped>
.hero-main:has(h2) { display:block; }
.vip-page { padding-top:32px; padding-bottom:48px; }.page-head { margin-bottom:28px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { font-size:28px; font-weight:650; margin:5px 0 10px; }.page-head p { margin:0; font-size:14px; color:var(--yb-muted); }.load-alert { margin-bottom:24px; }.alert-actions { margin-top:14px; }.loading-grid { display:grid; gap:24px; }.hero-card { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:24px; background:var(--yb-paper); color:var(--yb-ink); border:1px solid var(--yb-hairline); border-radius:8px; margin-bottom:26px; }.hero-main { min-width:0; flex:1; display:grid; grid-template-columns:auto minmax(200px,1fr); column-gap:32px; align-items:center; }.hero-meta,.hero-points { grid-column:1; }.hero-progress { grid-column:2; grid-row:1 / span 2; width:100%; }.hero-meta { display:flex; flex-wrap:wrap; align-items:center; gap:14px; }.user-name { max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:18px; font-weight:600; }.user-audience { font-size:12px; padding:4px 9px; border-radius:4px; background:var(--yb-fill); color:var(--yb-muted); }.hero-points { display:flex; align-items:baseline; gap:12px; margin:8px 0 0; }.hero-points strong { font-size:32px; font-weight:600; font-variant-numeric:tabular-nums; }.hero-points>span { color:var(--yb-muted); font-size:14px; }.hero-progress { font-size:13px; max-width:400px; }.hero-progress>svg { display:inline; margin-right:8px; }.vip-progress { height:4px; margin-top:12px; background:var(--yb-fill); }.vip-progress :deep(div) { background:var(--yb-primary); }.hero-tiers { display:flex; gap:16px; flex-shrink:0; }.tier-mini { display:grid; place-items:center; gap:10px; width:72px; height:72px; border-radius:8px; background:var(--yb-fill); color:var(--yb-muted); border:1px solid var(--yb-hairline); font-size:14px; padding:12px; }.tier-mini.active { color:var(--yb-primary); border-color:var(--yb-primary); background:var(--yb-primary-soft); }.hero-card h2 { font-size:23px; font-weight:600; margin:0 0 12px; }.hero-card p { color:var(--yb-muted); font-size:14px; margin:0; }.hero-button { color:var(--yb-primary); }.hero-button:hover { background:var(--yb-fill); }.audience-panel { display:flex; align-items:center; gap:20px; margin-bottom:24px; }.audience-label { color:var(--yb-muted); font-size:14px; }.audience-hint { font-size:13px; line-height:1.7; color:var(--yb-muted); }.rules-panel { padding:28px; margin-top:28px; border:1px solid var(--yb-hairline); background:var(--yb-paper); border-radius:10px; }.rules-panel header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; }.rules-panel h2 { margin:0; font-size:22px; font-weight:600; }.rules-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }.rule-cell { padding:24px; background:var(--yb-fill); border-radius:6px; }.rule-cell h3 { margin:0 0 16px; font-size:16px; font-weight:600; }.rule-cell strong { display:block; color:var(--yb-success); font-size:16px; font-weight:600; }.rule-cell strong.minus { color:var(--yb-danger); }.rule-cell>span { display:block; margin-top:10px; color:var(--yb-muted); font-size:12px; }@media(max-width:1100px) { .hero-main { column-gap:20px; }.hero-tiers { gap:10px; }.tier-mini { width:72px; }.audience-panel { flex-wrap:wrap; }.rules-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }@media(max-width:700px) { .hero-card { padding:24px; flex-direction:column; align-items:start; }.hero-main { display:block; width:100%; }.hero-progress { margin-top:16px; }.rules-grid { grid-template-columns:1fr; } }
</style>
