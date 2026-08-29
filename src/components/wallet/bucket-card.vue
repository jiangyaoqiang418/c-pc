<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { enums, formatAmount } from '@shared';
import type { BucketKey } from '@shared/enums/wallet';

interface Props {
  bucketKey: BucketKey;
  amount: string;
  variant?: 'card' | 'row';
  pct?: number; // 占比 0-100，仅 row variant 用
}
const props = withDefaults(defineProps<Props>(), { variant: 'card' });

const router = useRouter();
const meta = computed(() => enums.BUCKET_META[props.bucketKey]);

const iconName = computed(() => {
  const map: Record<BucketKey, string> = {
    available: 'lucide:wallet',
    nonWithdrawable: 'lucide:pause-circle',
    lockedFinance: 'lucide:lock',
    frozenOrder: 'lucide:package-open',
    frozenRisk: 'lucide:shield-alert',
    depositAvailable: 'lucide:coins',
    depositGuaranteed: 'lucide:handshake'
  };
  return map[props.bucketKey] || 'lucide:circle';
});

function go() {
  if (props.bucketKey === 'frozenOrder') router.push('/order');
  else if (props.bucketKey === 'lockedFinance') router.push('/finance/my-lockups');
  else router.push({ name: 'wallet-history', query: { bucket: props.bucketKey } });
}
</script>

<template>
  <!-- Row variant (BiyaPay/ether.fi 极简) -->
  <div
    v-if="variant === 'row'"
    class="bucket-row"
    role="button"
    tabindex="0"
    @click="go"
    @keydown.enter="go"
    @keydown.space.prevent="go"
  >
    <div class="row-left">
      <div class="icon-wrap">
        <Icon :icon="iconName" class="row-icon" />
      </div>
      <div class="row-label">
        <div class="label-main">{{ meta.label }}</div>
        <div class="label-hint">{{ meta.hint }}</div>
      </div>
    </div>
    <div class="row-right">
      <div class="row-amount">
        <span class="unit">U</span>
        <span class="num">{{ formatAmount(amount, { decimals: 2 }) }}</span>
      </div>
      <div v-if="pct != null" class="row-pct">{{ pct.toFixed(1) }}%</div>
    </div>
  </div>

  <!-- Card variant (兼容旧调用；去色统一米白) -->
  <div
    v-else
    class="bucket-card"
    role="button"
    tabindex="0"
    @click="go"
    @keydown.enter="go"
    @keydown.space.prevent="go"
  >
    <div class="card-head">
      <div class="icon-wrap sm">
        <Icon :icon="iconName" class="row-icon" />
      </div>
      <span class="name">{{ meta.label }}</span>
    </div>
    <div class="amount">
      <span class="unit">U</span>
      <span class="num">{{ formatAmount(amount, { decimals: 2 }) }}</span>
    </div>
    <div class="hint">{{ meta.hint }}</div>
  </div>
</template>

<style scoped>
/* ============ Row variant ============ */
.bucket-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--yb-hairline);
  cursor: pointer;
  transition: background 0.15s;
}
.bucket-row:last-child {
  border-bottom: none;
}
.bucket-row:hover {
  background: var(--yb-bg);
}
.bucket-row:focus-visible,
.bucket-card:focus-visible {
  outline: 2px solid var(--yb-brand-primary, #165dff);
  outline-offset: -2px;
}
.row-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--yb-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--yb-muted);
  flex-shrink: 0;
}
.icon-wrap.sm { width: 28px; height: 28px; border-radius: 8px; }
.row-icon { width: 16px; height: 16px; }
.row-label {
  min-width: 0;
}
.label-main {
  font-size: 13px;
  font-weight: 600;
  color: var(--yb-ink);
  letter-spacing: -0.005em;
}
.label-hint {
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 2px;
}
.row-right {
  display: flex;
  align-items: baseline;
  gap: 14px;
  text-align: right;
}
.row-amount {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: var(--yb-ink);
}
.row-amount .unit {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--yb-muted);
}
.row-amount .num {
  font-family: var(--yb-font-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.row-pct {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-faint);
  min-width: 44px;
}

/* ============ Card variant ============ */
.bucket-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 14px;
  padding: 16px 18px;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}
.bucket-card:hover {
  transform: translateY(-2px);
  border-color: var(--yb-ink);
  box-shadow: var(--yb-shadow-1);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.name {
  font-size: 12px;
  font-weight: 600;
  color: var(--yb-muted);
  letter-spacing: 0.02em;
}
.amount {
  display: flex;
  align-items: baseline;
  gap: 3px;
  color: var(--yb-ink);
}
.unit {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--yb-muted);
}
.num {
  font-family: var(--yb-font-mono);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.hint {
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 6px;
}
</style>
