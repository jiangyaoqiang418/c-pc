<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { buyerApi, formatAmount } from '@shared';
import { avatarUrl } from '@shared/utils/image';
import BuyerKpiCard from '@/components/buyer/buyer-kpi-card.vue';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

use([LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

const router = useRouter();
const userStore = useUserStore();

const profile = ref<Api.Buyer.BuyerProfile>();
const wallet = ref<Api.Buyer.Wallet>();
const pendingOrders = ref<Api.Order.OrderRecord[]>([]);
const claimable = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const loading = ref(false);

const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => (user.value ? avatarUrl(user.value.id) : ''));

async function loadAll() {
  if (!user.value) return;
  loading.value = true;
  try {
    const [summary, ordersRes, claimableRes] = await Promise.all([
      buyerApi.fetchBuyerDepositSummary(user.value.id),
      buyerApi.fetchBuyerOrders(user.value.id, ['PROCURING', 'PROCURED', 'IN_TRANSIT']),
      buyerApi.fetchClaimableRequests(user.value.id)
    ]);
    profile.value = summary.profile;
    wallet.value = summary.wallet;
    pendingOrders.value = ordersRes.records.slice(0, 5);
    claimable.value = claimableRes.records.slice(0, 6);
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

// 30 天 mock 销售 / 收入曲线
const chartOption = computed(() => {
  const days = Array.from({ length: 30 }, (_, i) => `${i + 1}日`);
  const sales = Array.from({ length: 30 }, (_, i) => Math.round(3 + Math.sin(i * 0.32) * 2 + Math.random() * 2 + i * 0.05));
  const revenue = sales.map(v => v * 260 + Math.random() * 200);
  return {
    grid: { top: 20, left: 40, right: 40, bottom: 30 },
    tooltip: { trigger: 'axis', backgroundColor: '#0F111A', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 } },
    legend: { data: ['成交单数', '收入 (U)'], right: 20, top: 0, textStyle: { fontSize: 11, color: '#6B7385' }, icon: 'circle', itemWidth: 8 },
    xAxis: { type: 'category', data: days, axisLine: { lineStyle: { color: '#EDECE6' } }, axisTick: { show: false }, axisLabel: { color: '#A8ADB8', fontSize: 10, interval: 4 } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#EDECE6', type: 'dashed' } }, axisLabel: { color: '#A8ADB8', fontSize: 10 } },
      { type: 'value', axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: '#A8ADB8', fontSize: 10 } }
    ],
    series: [
      {
        name: '成交单数', type: 'line', smooth: true, data: sales, symbol: 'circle', symbolSize: 5,
        lineStyle: { color: '#5B5CE7', width: 2 },
        itemStyle: { color: '#5B5CE7', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(91,92,231,0.24)' }, { offset: 1, color: 'rgba(91,92,231,0)' }] } }
      },
      {
        name: '收入 (U)', type: 'line', smooth: true, yAxisIndex: 1, data: revenue, symbol: 'circle', symbolSize: 5,
        lineStyle: { color: '#B8935A', width: 2 },
        itemStyle: { color: '#B8935A', borderColor: '#fff', borderWidth: 2 }
      }
    ]
  };
});

// 押金 donut
const depositPct = computed(() => {
  if (!wallet.value) return 0;
  const total = Number(wallet.value.depositAvailable) + Number(wallet.value.depositGuaranteed);
  return total > 0 ? (Number(wallet.value.depositGuaranteed) / total) * 100 : 0;
});
const depositTotal = computed(() => {
  if (!wallet.value) return '0.00';
  return formatAmount(Number(wallet.value.depositAvailable) + Number(wallet.value.depositGuaranteed));
});

// KPI sparkline mock
const spark = (base: number, n = 12) => Array.from({ length: n }, (_, i) => Math.max(0, base * (0.7 + Math.sin(i * 0.7 + base) * 0.22 + i * 0.02)));
</script>

<template>
  <div class="dashboard-page shop-container">
    <template v-if="profile && wallet && user">
      <!-- ============ Hero (深色 accent) ============ -->
      <section class="hero" v-motion :initial="{ opacity: 0, y: 20 }" :enter="{ opacity: 1, y: 0, transition: { duration: 500 } }">
        <div class="hero-glow"></div>
        <div class="hero-left">
          <img :src="userAvatar" :alt="user.nickname" class="hero-avatar" />
          <div>
            <div class="welcome-eyebrow">买手工作台 · BUYER STUDIO</div>
            <div class="welcome-row">
              <h1 class="welcome-name">{{ user.nickname }}</h1>
              <VipBadge :level="user.vipLevel" size="lg" />
            </div>
            <div class="welcome-sub">
              <Icon icon="lucide:check-circle" width="12" />
              累计完成 <span class="yb-mono strong">{{ profile.stats.orderCompleted }}</span> 笔订单
            </div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="stat">
            <div class="stat-label">月销</div>
            <div class="stat-val"><span class="num yb-mono">{{ profile.stats.orderTotal }}</span><span class="unit">单</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">好评率</div>
            <div class="stat-val"><span class="num yb-mono">{{ Number(profile.stats.goodReviewRate).toFixed(1) }}</span><span class="unit">%</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">客诉率</div>
            <div class="stat-val"><span class="num yb-mono">{{ Number(profile.stats.complaintRate).toFixed(1) }}</span><span class="unit">%</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">发货时长</div>
            <div class="stat-val"><span class="num yb-mono">{{ profile.stats.avgShipHours }}</span><span class="unit">h</span></div>
          </div>
        </div>
      </section>

      <!-- ============ KPI grid ============ -->
      <section class="kpi-grid">
        <BuyerKpiCard
          v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500, delay: 0 } }"
          label="待发货" :value="pendingOrders.filter(o => o.status === 'PROCURED').length" unit="单"
          icon="lucide:package" color="#B8935A" :delta="8.4" :sparkline="spark(4)"
        />
        <BuyerKpiCard
          v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500, delay: 80 } }"
          label="采购中" :value="pendingOrders.filter(o => o.status === 'PROCURING').length" unit="单"
          icon="lucide:shopping-cart" color="#5B5CE7" :delta="12.6" :sparkline="spark(6)"
        />
        <BuyerKpiCard
          v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500, delay: 160 } }"
          label="运输中" :value="pendingOrders.filter(o => o.status === 'IN_TRANSIT').length" unit="单"
          icon="lucide:truck" color="#7C5CFC" :delta="-2.1" :sparkline="spark(5)"
        />
        <BuyerKpiCard
          v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500, delay: 240 } }"
          label="好评率" :value="profile.stats.goodReviewRate" unit="%"
          icon="lucide:star" color="#00A88A" :delta="3.4" :sparkline="spark(95)"
        />
        <BuyerKpiCard
          v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500, delay: 320 } }"
          label="平均发货" :value="profile.stats.avgShipHours" unit="h"
          icon="lucide:clock" color="#E74C3C" :delta="-8.2" :sparkline="spark(24)"
        />
      </section>

      <!-- ============ 主图表 ============ -->
      <section class="chart-card" v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500 } }">
        <div class="chart-head">
          <div>
            <div class="chart-eyebrow">30 DAY OVERVIEW</div>
            <h2 class="chart-title">销售 &amp; 收入趋势</h2>
          </div>
          <div class="chart-legend">
            <span class="legend-dot" style="background:#5B5CE7"></span> 成交单数
            <span class="legend-dot" style="background:#B8935A; margin-left:16px"></span> 收入 (U)
          </div>
        </div>
        <VChart :option="chartOption" autoresize class="chart" />
      </section>

      <!-- ============ 双栏：订单 + 求购 ============ -->
      <section class="split-grid">
        <div class="split-card">
          <div class="split-head">
            <div class="split-title-group">
              <div class="sec-tag primary"><Icon icon="lucide:layers" width="12" /> ORDERS</div>
              <h3 class="split-title">进行中订单</h3>
            </div>
            <button class="text-link" @click="router.push('/buyer/orders')">查看全部 <Icon icon="lucide:arrow-right" width="13" /></button>
          </div>
          <template v-if="pendingOrders.length">
            <BuyerOrderCard v-for="o in pendingOrders" :key="o.id" :order="o" />
          </template>
          <EmptyState v-else icon="lucide:inbox" title="暂无进行中订单" description="去求购大厅接单赚取收益" />
        </div>

        <div class="split-card">
          <div class="split-head">
            <div class="split-title-group">
              <div class="sec-tag gold"><Icon icon="lucide:sparkles" width="12" /> CLAIMABLE</div>
              <h3 class="split-title">可接求购 <span class="count yb-mono">{{ claimable.length }}</span></h3>
            </div>
            <button class="text-link" @click="router.push('/buyer/claimable')">前往大厅 <Icon icon="lucide:arrow-right" width="13" /></button>
          </div>
          <template v-if="claimable.length">
            <PurchaseRequestCard v-for="r in claimable" :key="r.id" :request="r" mode="hall" :can-claim="false" />
          </template>
          <EmptyState v-else icon="lucide:sparkles" title="暂无可接求购" description="新求购按 VIP 阶梯推送" />
        </div>
      </section>

      <!-- ============ 押金 donut ============ -->
      <section class="deposit-card" v-motion :initial="{ opacity: 0, y: 20 }" :visible-once="{ opacity: 1, y: 0, transition: { duration: 500 } }">
        <div class="deposit-head">
          <div>
            <div class="sec-tag gold"><Icon icon="lucide:coins" width="12" /> DEPOSIT</div>
            <h3 class="split-title">押金概况</h3>
          </div>
          <button class="text-link" @click="router.push('/buyer/deposit')">押金管理 <Icon icon="lucide:arrow-right" width="13" /></button>
        </div>
        <div class="deposit-body">
          <div class="donut-wrap">
            <div class="donut" :style="{ '--pct': depositPct + '%' }">
              <div class="donut-inner">
                <div class="donut-label">总押金</div>
                <div class="donut-value"><span class="unit">U</span><span class="num yb-mono">{{ depositTotal }}</span></div>
              </div>
            </div>
          </div>
          <div class="deposit-detail">
            <div class="dd-row">
              <div class="dd-key"><span class="dd-dot avail"></span> 可用押金</div>
              <div class="dd-val yb-mono">U {{ formatAmount(wallet.depositAvailable) }}</div>
            </div>
            <div class="dd-row">
              <div class="dd-key"><span class="dd-dot lock"></span> 已担保</div>
              <div class="dd-val yb-mono">U {{ formatAmount(wallet.depositGuaranteed) }}</div>
            </div>
            <div class="dd-row">
              <div class="dd-key">担保占比</div>
              <div class="dd-val yb-mono">{{ depositPct.toFixed(1) }}%</div>
            </div>
            <div class="deposit-actions">
              <button class="btn primary sm" @click="router.push('/buyer/deposit')">
                <Icon icon="lucide:arrow-down-to-line" width="14" /> 充值
              </button>
              <button class="btn ghost sm" @click="router.push('/buyer/deposit')">
                <Icon icon="lucide:arrow-up-from-line" width="14" /> 转出
              </button>
              <button class="btn ghost sm" @click="router.push('/wallet')">
                <Icon icon="lucide:list" width="14" /> 流水
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <EmptyState v-else-if="!loading" icon="lucide:alert-triangle" title="买手资料加载失败" />
  </div>
</template>

<style scoped>
.dashboard-page {
  padding-top: 24px;
  padding-bottom: 64px;
}

/* ========== Hero (dark accent) ========== */
.hero {
  position: relative;
  background: linear-gradient(135deg, #0F1B36 0%, #1E1F3A 60%, #5B5CE7 100%);
  color: #fff;
  border-radius: var(--yb-radius-card);
  padding: 36px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 32px;
  overflow: hidden;
  margin-bottom: 20px;
}
.hero-glow {
  position: absolute;
  top: -30%;
  right: -10%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(184, 147, 90, 0.25) 0%, transparent 60%);
  pointer-events: none;
}
.hero-left {
  position: relative;
  display: flex;
  gap: 20px;
  align-items: center;
}
.hero-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 3px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.welcome-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-gold);
  margin-bottom: 6px;
}
.welcome-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.welcome-name {
  font-family: var(--yb-font-display);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}
.welcome-sub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}
.welcome-sub .strong {
  color: #fff;
  font-weight: 700;
  padding: 0 3px;
}

.hero-stats {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 40px;
}
.stat-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
}
.stat-val {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-val .num {
  font-family: var(--yb-font-mono);
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}
.stat-val .unit {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* ========== KPI grid ========== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

/* ========== Chart card ========== */
.chart-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 24px 28px;
  margin-bottom: 20px;
}
.chart-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
}
.chart-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--yb-muted);
  margin-bottom: 6px;
}
.chart-title {
  font-family: var(--yb-font-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--yb-ink);
}
.chart-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--yb-muted);
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.chart {
  width: 100%;
  height: 260px;
}

/* ========== Split section ========== */
.split-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.split-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 24px 26px;
}
.split-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
}
.split-title-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sec-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--yb-radius-pill);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  width: fit-content;
}
.sec-tag.primary { background: var(--yb-primary-soft); color: var(--yb-primary); }
.sec-tag.gold { background: var(--yb-champagne); color: var(--yb-gold); }
.split-title {
  font-family: var(--yb-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--yb-ink);
  margin: 0;
}
.count {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 10px;
  background: var(--yb-primary-soft);
  color: var(--yb-primary);
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  font-weight: 700;
}
.text-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--yb-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}
.text-link:hover { color: var(--yb-ink); }

/* ========== Deposit ========== */
.deposit-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 24px 28px;
}
.deposit-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}
.deposit-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 40px;
  align-items: center;
}
.donut-wrap {
  display: flex;
  justify-content: center;
}
.donut {
  --pct: 0%;
  --size: 200px;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: conic-gradient(var(--yb-gold) 0% var(--pct), var(--yb-primary-soft) var(--pct) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 0 0 40px rgba(184, 147, 90, 0.15);
}
.donut::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: var(--yb-surface);
}
.donut-inner {
  position: relative;
  z-index: 2;
  text-align: center;
}
.donut-label {
  font-size: 11px;
  color: var(--yb-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
}
.donut-value {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}
.donut-value .unit {
  font-family: var(--yb-font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--yb-gold);
}
.donut-value .num {
  font-size: 30px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
}

.deposit-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dd-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--yb-hairline);
}
.dd-row:last-of-type { border-bottom: none; }
.dd-key {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--yb-muted);
}
.dd-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dd-dot.avail { background: var(--yb-primary); }
.dd-dot.lock { background: var(--yb-gold); }
.dd-val {
  font-size: 15px;
  font-weight: 700;
  color: var(--yb-ink);
  font-variant-numeric: tabular-nums;
}
.deposit-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 18px;
  border-radius: var(--yb-radius-pill);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.btn.sm { padding: 8px 14px; font-size: 12px; }
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(91, 92, 231, 0.28);
}
.btn.ghost {
  background: var(--yb-bg);
  color: var(--yb-ink);
  border-color: var(--yb-hairline);
}
.btn.ghost:hover {
  border-color: var(--yb-ink);
}

@media (max-width: 1024px) {
  .hero { flex-direction: column; align-items: flex-start; }
  .hero-stats { grid-template-columns: repeat(2, 1fr); gap: 20px; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .split-grid { grid-template-columns: 1fr; }
  .deposit-body { grid-template-columns: 1fr; gap: 24px; }
}
</style>
