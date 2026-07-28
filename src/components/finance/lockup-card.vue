<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { enums, formatAmount, formatRate } from '@shared';

interface Props {
  order: Api.FinanceProduct.LockupOrder;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'unlock', order: Api.FinanceProduct.LockupOrder): void }>();

const router = useRouter();

const meta = computed(() => enums.LOCKUP_ORDER_STATUS_META[props.order.status]);

const startMs = computed(() => new Date(props.order.startAt).getTime());
const maturityMs = computed(() => new Date(props.order.maturityAt).getTime());
const daysPassed = computed(() => {
  const now = Math.min(Date.now(), maturityMs.value);
  return Math.max(0, Math.floor((now - startMs.value) / 86400_000));
});
const progressPct = computed(() => {
  if (props.order.status === 'active') {
    return Math.min(100, Math.round((daysPassed.value / props.order.lockupDays) * 100));
  }
  if (props.order.status === 'matured') return 100;
  return 0;
});

const remainingDays = computed(() => Math.max(0, props.order.lockupDays - daysPassed.value));

function goDetail() {
  router.push({ name: 'finance-lockup-detail', params: { id: String(props.order.id) } });
}
</script>

<template>
  <a-card class="lockup-card" :body-style="{ padding: '14px 18px' }" :bordered="false" hoverable @click="goDetail">
    <div class="head">
      <div class="name-block">
        <span class="name">{{ order.productName }}</span>
        <span class="code">#{{ order.code }}</span>
      </div>
      <a-tag :color="meta.color">{{ meta.label }}</a-tag>
    </div>

    <div class="meta-row">
      <div class="cell">
        <div class="lbl">本金</div>
        <div class="val">U {{ formatAmount(order.principalAmount) }}</div>
      </div>
      <div class="cell">
        <div class="lbl">利率（含 VIP 加成）</div>
        <div class="val rate">{{ formatRate(Number(order.rate.effectiveRate) / 100) }}</div>
      </div>
      <div class="cell">
        <div class="lbl">已累积利息</div>
        <div class="val interest">+ U {{ formatAmount(order.accruedInterest) }}</div>
      </div>
      <div class="cell">
        <div class="lbl">{{ order.status === 'active' ? '剩余天数' : '锁定天数' }}</div>
        <div class="val">{{ order.status === 'active' ? remainingDays : order.lockupDays }} 天</div>
      </div>
    </div>

    <div v-if="order.status === 'active' || order.status === 'matured'" class="progress">
      <a-progress
        :percent="progressPct"
        :show-text="false"
        size="small"
        :color="order.status === 'matured' ? '#00b42a' : '#722ed1'"
      />
      <div class="progress-text">
        已过 {{ daysPassed }} / {{ order.lockupDays }} 天
        <span class="muted">· 到期 {{ new Date(order.maturityAt).toLocaleDateString() }}</span>
      </div>
    </div>

    <div class="actions" @click.stop>
      <a-button size="small" type="outline" @click="goDetail">详情</a-button>
      <a-button
        v-if="order.status === 'active'"
        size="small"
        status="danger"
        type="outline"
        @click="$emit('unlock', order)"
      >
        提前解锁
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
