<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { formatAmount, formatRate } from '@shared';

interface Props {
  order: Api.RealFinance.FinanceOrderVO;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'unlock', order: Api.RealFinance.FinanceOrderVO): void }>();

const router = useRouter();

const meta = computed(() => ({
  HOLDING: { label: '计息中', color: 'purple' },
  SETTLED: { label: '已结算', color: 'green' },
  REDEEMED: { label: '已赎回', color: 'orange' },
  CANCELED: { label: '已取消', color: 'red' }
}[props.order.status] || { label: props.order.statusText || props.order.status, color: 'gray' }));

const startMs = computed(() => Number(props.order.startAt || 0));
const maturityMs = computed(() => Number(props.order.maturityAt || 0));
const daysPassed = computed(() => {
  const now = Math.min(Date.now(), maturityMs.value);
  return Math.max(0, Math.floor((now - startMs.value) / 86400_000));
});
const progressPct = computed(() => {
  if (props.order.status === 'HOLDING') {
    return Math.min(100, Math.round((daysPassed.value / props.order.lockDays) * 100));
  }
  if (props.order.status === 'SETTLED') return 100;
  return 0;
});

const remainingDays = computed(() => Math.max(0, props.order.lockDays - daysPassed.value));

function goDetail() {
  router.push({ name: 'finance-lockup-detail', params: { id: String(props.order.id) } });
}
</script>

<template>
  <a-card class="lockup-card" :body-style="{ padding: '14px 18px' }" :bordered="false" hoverable @click="goDetail">
    <div class="head">
      <div class="name-block">
        <span class="name">{{ order.productName }}</span>
        <span class="code">#{{ order.productCode || order.id }}</span>
      </div>
      <a-tag :color="meta.color">{{ meta.label }}</a-tag>
    </div>

    <div class="meta-row">
      <div class="cell">
        <div class="lbl">本金</div>
        <div class="val">U {{ formatAmount(order.principal) }}</div>
      </div>
      <div class="cell">
        <div class="lbl">年化利率</div>
        <div class="val rate">{{ formatRate(Number(order.annualRate)) }}</div>
      </div>
      <div class="cell">
        <div class="lbl">已累积利息</div>
        <div class="val interest">+ U {{ formatAmount(order.accruedInterest) }}</div>
      </div>
      <div class="cell">
        <div class="lbl">{{ order.status === 'HOLDING' ? '剩余天数' : '锁定天数' }}</div>
        <div class="val">{{ order.status === 'HOLDING' ? (order.remainingDays ?? remainingDays) : order.lockDays }} 天</div>
      </div>
    </div>

    <div v-if="order.status === 'HOLDING' || order.status === 'SETTLED'" class="progress">
      <a-progress
        :percent="progressPct"
        :show-text="false"
        size="small"
        :color="order.status === 'SETTLED' ? '#00b42a' : '#722ed1'"
      />
      <div class="progress-text">
        已过 {{ daysPassed }} / {{ order.lockDays }} 天
        <span class="muted">· 到期 {{ order.maturityAt ? new Date(Number(order.maturityAt)).toLocaleDateString() : '—' }}</span>
      </div>
    </div>

    <div class="actions" @click.stop>
      <a-button size="small" type="outline" @click="goDetail">详情</a-button>
      <a-button
        v-if="order.canRedeem"
        size="small"
        status="danger"
        type="outline"
        @click="$emit('unlock', order)"
      >
        提前赎回
      </a-button>
    </div>
  </a-card>
</template>

<style scoped>
.lockup-card {
  margin-bottom: 12px;
  cursor: pointer;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #f2f3f5;
}
.name-block {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.name {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}
.code {
  font-size: 11px;
  color: #86909c;
  font-family: ui-monospace, monospace;
}
.meta-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 12px;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lbl {
  font-size: 11px;
  color: #86909c;
}
.val {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
  font-family: ui-monospace, monospace;
}
.val.rate {
  color: #722ed1;
}
.val.interest {
  color: #00b42a;
}
.progress {
  margin: 10px 0;
}
.progress-text {
  font-size: 11px;
  color: #4e5969;
  margin-top: 4px;
}
.muted {
  color: #86909c;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
