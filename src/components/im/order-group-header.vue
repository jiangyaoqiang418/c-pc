<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { formatAmount } from '@shared';

interface Props {
  group: Api.Im.OrderGroup;
}
const props = defineProps<Props>();

const router = useRouter();

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: '群初始化中', color: 'gray' },
  ACTIVE: { label: '活跃', color: 'green' },
  IN_DISPUTE: { label: '争议中', color: 'red' },
  COOLING: { label: '冷静期', color: 'orange' },
  ARCHIVING: { label: '归档中', color: 'gray' },
  ARCHIVED: { label: '已归档', color: 'gray' },
  DISSOLVED: { label: '已解散', color: 'gray' }
};
const meta = computed(() => STATUS_META[props.group.orderGroupStatus] || { label: '—', color: 'gray' });

const participantAvatars = computed(() => {
  return props.group.participants.map((p, i) => {
    const letterByRole: Record<string, string> = {
      customer: '顾',
      shopper: '买',
      supervisor: '督',
      agent: '客',
      ai_bot: 'AI'
    };
    const colorByRole: Record<string, string> = {
      customer: '#165dff',
      shopper: '#ff7d00',
      supervisor: '#722ed1',
      agent: '#00b42a',
      ai_bot: '#86909c'
    };
    return {
      key: `${p.userId}-${i}`,
      letter: letterByRole[p.role] || '?',
      color: colorByRole[p.role] || '#86909c',
      role: p.role
    };
  });
});

function goOrder() {
  // orderId 字段是订单 code（"ORD-2026-XXXXX"），需要从 ORDERS 池找到 id
  // 简化：直接用 code 跳，订单列表页能识别
  router.push({ name: 'order-list' });
}
</script>

<template>
  <div class="group-header">
    <div class="header-left">
      <div class="title-row">
        <a-tag :color="meta.color">{{ meta.label }}</a-tag>
        <span class="order-code">{{ group.orderId }}</span>
        <span v-if="group.fromPresaleId" class="presale-flag">🔗 从售前并入</span>
      </div>
      <div class="product-title">{{ group.productTitle }}</div>
      <div class="amount-row">
        <span class="lbl">订单金额</span>
        <span class="amount">U {{ formatAmount(group.orderAmount) }}</span>
        <span class="dot">·</span>
        <span class="lbl">买手 {{ group.shopperName }}</span>
      </div>
    </div>
    <div class="header-right">
      <div class="avatars">
        <div
          v-for="a in participantAvatars"
          :key="a.key"
          class="avatar"
          :style="{ background: a.color }"
          :title="a.role"
        >
          {{ a.letter }}
        </div>
      </div>
      <a-button size="small" type="outline" @click="goOrder">查看订单 ›</a-button>
    </div>
  </div>
</template>

<style scoped>
.group-header {
  background: #fff;
  padding: 16px 20px;
  border-bottom: 1px solid #f2f3f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.order-code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.presale-flag {
  font-size: 11px;
  color: #722ed1;
}
.product-title {
  font-size: 14px;
  color: #1d2129;
  margin-bottom: 4px;
}
.amount-row {
  font-size: 12px;
  color: #4e5969;
  display: flex;
  align-items: center;
  gap: 8px;
}
.lbl {
  color: #86909c;
}
.amount {
  color: #f53f3f;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  font-size: 14px;
}
.dot {
  opacity: 0.4;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatars {
  display: flex;
  gap: -4px;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 12px;
  border: 2px solid #fff;
  margin-left: -6px;
  box-shadow: 0 0 0 1px #f2f3f5;
}
.avatar:first-child {
  margin-left: 0;
}
</style>
