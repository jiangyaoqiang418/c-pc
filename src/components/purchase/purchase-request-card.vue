<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { enums, formatAmount } from '@shared';
import PushTierBadge from './push-tier-badge.vue';

interface Props {
  request: Api.RealPurchase.DisplayRecord;
  mode?: 'hall' | 'mine';
  canClaim?: boolean;
  claiming?: boolean;
  canceling?: boolean;
}
const props = withDefaults(defineProps<Props>(), { mode: 'hall', canClaim: false, claiming: false, canceling: false });
defineEmits<{
  (e: 'claim', req: Api.RealPurchase.DisplayRecord): void;
  (e: 'cancel', req: Api.RealPurchase.DisplayRecord): void;
}>();

const router = useRouter();
const statusMeta = computed(() => enums.PURCHASE_STATUS_META[props.request.status]);
const aftersaleMeta = computed(() => enums.AFTERSALE_TYPE_META[props.request.aftersaleType]);

function goDetail() {
  router.push({ name: 'purchase-detail', params: { id: String(props.request.id) } });
}
</script>

<template>
  <div
    class="pr-card"
    role="button"
    tabindex="0"
    :aria-label="`打开求购 ${request.code}`"
    @click="goDetail"
    @keydown.enter.self="goDetail"
    @keydown.space.prevent.self="goDetail"
  >
    <div class="head">
      <div class="head-left">
        <span class="status-pill" :data-status="request.status">
          <Icon icon="lucide:radio" width="10" />
          {{ statusMeta.label }}
        </span>
        <PushTierBadge v-if="request.status === 'pushing' && request.currentPushLevel" :level="request.currentPushLevel" />
      </div>
      <span class="code">#{{ request.code }}</span>
    </div>

    <div class="body">
      <div class="left">
        <div class="cat-chip">
          <Icon icon="lucide:folder" width="11" />
          {{ request.categoryPath }}
        </div>
        <h3 class="title">{{ request.productTitle }}</h3>
        <div v-if="request.appeal" class="appeal">"{{ request.appeal }}"</div>
        <div class="meta-tags">
          <span class="chip">
            <Icon icon="lucide:calendar-days" width="11" />
            期望 {{ request.expectedDays }} 天
          </span>
          <span v-if="request.status === 'pushing' && request.claimExpiresAt" class="chip">
            <Icon icon="lucide:clock-3" width="11" />
            截止 {{ new Date(request.claimExpiresAt).toLocaleString() }}
          </span>
          <span class="chip">
            <Icon icon="lucide:shield-check" width="11" />
            {{ aftersaleMeta.label }}
          </span>
          <span v-if="request.overseasCustoms" class="chip gold">
            <Icon icon="lucide:globe" width="11" />
            海外过关
          </span>
        </div>
      </div>
      <div class="reward">
        <div class="reward-label">悬赏</div>
        <div class="reward-amount">
          <span class="unit">U</span>
          <span class="num">{{ formatAmount(request.budgetAmount) }}</span>
        </div>
        <div class="reward-glow"></div>
      </div>
    </div>

    <div v-if="mode === 'mine' && request.claimedByName" class="claimed">
      <Icon icon="lucide:check-circle-2" width="13" />
      已被买手 <strong>{{ request.claimedByName }}</strong> 接单
      <span v-if="request.relatedOrderCode" class="order-link">· {{ request.relatedOrderCode }}</span>
    </div>

    <div class="actions" @click.stop>
      <button class="btn ghost" @click="goDetail">
        <Icon icon="lucide:arrow-right" width="13" /> 详情
      </button>
      <button
        v-if="mode === 'hall' && canClaim && request.status === 'pushing'"
        class="btn primary"
        :disabled="claiming"
        @click="$emit('claim', request)"
      >
        <Icon icon="lucide:hand-metal" width="13" /> {{ claiming ? '接单中…' : '我接此单' }}
      </button>
      <button
        v-if="mode === 'mine' && ['pending_audit', 'pushing'].includes(request.status)"
        class="btn danger"
        :disabled="canceling"
        @click="$emit('cancel', request)"
      >
        <Icon icon="lucide:x" width="13" /> {{ canceling ? '撤销中…' : '撤销' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pr-card {
  position: relative;
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 20px 22px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s, border-color 0.24s;
  overflow: hidden;
}
.pr-card:focus-visible {
  outline: 2px solid var(--yb-brand-pink);
  outline-offset: 2px;
}
.pr-card:hover {
  transform: translateY(-3px);
  border-color: transparent;
  box-shadow: var(--yb-shadow-glow);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  font-weight: 600;
  background: var(--yb-primary-soft);
  color: var(--yb-primary);
  font-family: var(--yb-font-mono);
}
.status-pill[data-status='pushing'] {
  background: rgba(0, 168, 138, 0.1);
  color: var(--yb-success);
}
.status-pill[data-status='claimed'] {
  background: var(--yb-champagne);
  color: var(--yb-gold);
}
.status-pill[data-status='cancelled'] {
  background: var(--yb-hairline);
  color: var(--yb-muted);
}
.code {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-faint);
  letter-spacing: 0.02em;
}
.body {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: flex-start;
}
.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: var(--yb-bg);
  border-radius: var(--yb-radius-pill);
  font-size: 10px;
  color: var(--yb-muted);
  margin-bottom: 8px;
}
.title {
  font-size: 17px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.015em;
  margin: 0 0 8px;
  line-height: 1.35;
}
.appeal {
  font-size: 13px;
  color: var(--yb-muted);
  font-style: italic;
  margin: 8px 0 12px;
  padding-left: 12px;
  border-left: 2px solid var(--yb-hairline);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.meta-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--yb-bg);
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  color: var(--yb-ink-2);
  font-weight: 500;
}
.chip.gold {
  background: var(--yb-champagne);
  color: var(--yb-gold);
}
.reward {
  position: relative;
  padding: 16px 24px;
  background: linear-gradient(135deg, var(--yb-primary-soft) 0%, transparent 100%);
  border: 1px solid rgba(91, 92, 231, 0.12);
  border-radius: var(--yb-radius-md);
  text-align: right;
  min-width: 140px;
}
.reward-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--yb-primary);
  font-weight: 600;
  margin-bottom: 4px;
}
.reward-amount {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  color: var(--yb-primary);
}
.reward-amount .unit {
  font-family: var(--yb-font-mono);
  font-size: 13px;
  font-weight: 600;
}
.reward-amount .num {
  font-family: var(--yb-font-mono);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.reward-glow {
  position: absolute;
  top: 50%;
  right: -20px;
  transform: translateY(-50%);
  width: 60px;
  height: 60px;
  background: radial-gradient(circle, rgba(91, 92, 231, 0.15) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}
.claimed {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--yb-success-soft);
  color: var(--yb-success);
  border-radius: var(--yb-radius-md);
  font-size: 12px;
  margin-top: 14px;
}
.claimed strong {
  color: var(--yb-ink);
}
.order-link {
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--yb-hairline);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border-radius: var(--yb-radius-md);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s;
  border: 1px solid transparent;
}
.btn.ghost {
  background: var(--yb-bg);
  color: var(--yb-ink-2);
  border-color: var(--yb-hairline);
}
.btn.ghost:hover {
  background: var(--yb-surface);
  border-color: var(--yb-ink);
}
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(91, 92, 231, 0.24);
}
.btn.danger {
  background: transparent;
  color: var(--yb-danger);
  border-color: rgba(231, 76, 60, 0.24);
}
.btn.danger:hover {
  background: var(--yb-danger-soft);
}
</style>
