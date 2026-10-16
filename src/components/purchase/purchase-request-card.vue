<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { enums, formatAmount } from '@shared';
import PushTierBadge from './push-tier-badge.vue';
import { formatDateValue } from '@/utils/date-range';
import { getAftersaleMeta } from '@/service/api/product';

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
const aftersaleMeta = computed(() => getAftersaleMeta(props.request.aftersaleType));

function goDetail() {
  router.push({ name: 'purchase-detail', params: { id: String(props.request.id) } });
}


</script>

<template>

  <div class="paper pr-card" role="button" tabindex="0" :aria-label="`打开求购 ${request.code}`" @click="goDetail" @keydown.enter.self="goDetail" @keydown.space.prevent.self="goDetail">
    <div class="head"><span class="pill" :data-status="request.status">{{ statusMeta?.label || '状态待核对' }}</span><PushTierBadge v-if="request.status === 'pushing' && request.currentPushLevel" :level="request.currentPushLevel" /></div>
    <small class="category">{{ request.categoryPath || '—' }}</small>
    <h2 class="title" :title="request.productTitle">{{ request.productTitle }}</h2>
    <p class="appeal">{{ request.appeal || request.productDescription || '暂无补充说明' }}</p>
    <div class="money-row"><strong>{{ formatAmount(request.budgetAmount) }} <small>USDT</small></strong><span>{{ request.expectedDays }} 天内发货</span></div>
    <div class="meta-tags"><span><Icon icon="lucide:shield-check" width="14" />{{ aftersaleMeta.label }}</span><span v-if="request.overseasCustoms"><Icon icon="lucide:globe" width="14" />海外过关</span></div>
    <p v-if="request.status === 'pushing' && request.claimExpiresAt" class="deadline">接单截止 {{ formatDateValue(request.claimExpiresAt) }}</p>
    <p class="code">#{{ request.code }}</p>
    <p v-if="mode === 'mine' && request.claimedByName" class="claimed"><Icon icon="lucide:check-circle" width="15" />已被 {{ request.claimedByName }} 接单<span v-if="request.relatedOrderCode">· {{ request.relatedOrderCode }}</span></p>
    <div class="button-row actions" @click.stop>
      <button class="outline" type="button"  @click="goDetail">查看求购详情<Icon icon="lucide:arrow-right" width="15" /></button>
      <button class="primary" v-if="mode === 'hall' && canClaim && request.status === 'pushing'" type="button" :disabled="claiming" @click="$emit('claim', request)"><Icon v-if="claiming" icon="lucide:loader-circle" class="animate-spin" width="15" />{{ claiming ? '接单中…' : '我接此单' }}</button>
      <button v-if="mode === 'mine' && ['pending_audit', 'pushing'].includes(request.status)" type="button"  class="danger outline" :disabled="canceling" @click="$emit('cancel', request)">{{ canceling ? '撤销中…' : '撤销求购' }}</button>
    </div>
  </div>

</template>

<style scoped>
.pr-card { min-width:0; cursor:pointer; }.head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.category,.code,.deadline { color:var(--muted); overflow-wrap:anywhere; }.title,.appeal { overflow-wrap:anywhere; }.appeal { white-space:pre-wrap; }
.meta-tags { display:flex; flex-wrap:wrap; gap:14px; }.meta-tags span { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--muted); }
.claimed { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }.actions { margin-top:16px; flex-wrap:wrap; }.actions > button:first-child { width:100%; }.danger { color:var(--yb-danger); }
@media(max-width:700px) {
  .money-row { flex-wrap:wrap; }
  .money-row > strong { min-width:0; max-width:100%; overflow-wrap:anywhere; }
}
</style>
