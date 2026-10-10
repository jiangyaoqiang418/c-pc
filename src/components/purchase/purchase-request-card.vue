<script setup lang="ts">
import { Button } from '@/components/ui/button';
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

  <div class="pr-card" role="button" tabindex="0" :aria-label="`打开求购 ${request.code}`" @click="goDetail" @keydown.enter.self="goDetail" @keydown.space.prevent.self="goDetail">
    <div class="head"><span class="status-pill" :data-status="request.status">{{ statusMeta.label }}</span><PushTierBadge v-if="request.status === 'pushing' && request.currentPushLevel" :level="request.currentPushLevel" /></div>
    <small class="category">{{ request.categoryPath || '—' }}</small>
    <h2 class="title" :title="request.productTitle">{{ request.productTitle }}</h2>
    <p class="appeal">{{ request.appeal || request.productDescription || '暂无补充说明' }}</p>
    <div class="money-row"><strong>{{ formatAmount(request.budgetAmount) }} <small>USDT</small></strong><span>{{ request.expectedDays }} 天内发货</span></div>
    <div class="meta-tags"><span><Icon icon="lucide:shield-check" width="14" />{{ aftersaleMeta.label }}</span><span v-if="request.overseasCustoms"><Icon icon="lucide:globe" width="14" />海外过关</span></div>
    <p v-if="request.status === 'pushing' && request.claimExpiresAt" class="deadline">接单截止 {{ formatDateValue(request.claimExpiresAt) }}</p>
    <p class="code">#{{ request.code }}</p>
    <p v-if="mode === 'mine' && request.claimedByName" class="claimed"><Icon icon="lucide:check-circle" width="15" />已被 {{ request.claimedByName }} 接单<span v-if="request.relatedOrderCode">· {{ request.relatedOrderCode }}</span></p>
    <div class="actions" @click.stop>
      <Button type="button" variant="outline" @click="goDetail">查看求购详情<Icon icon="lucide:arrow-right" width="15" /></Button>
      <Button v-if="mode === 'hall' && canClaim && request.status === 'pushing'" type="button" :disabled="claiming" @click="$emit('claim', request)"><Icon v-if="claiming" icon="lucide:loader-circle" class="animate-spin" width="15" />{{ claiming ? '接单中…' : '我接此单' }}</Button>
      <Button v-if="mode === 'mine' && ['pending_audit', 'pushing'].includes(request.status)" type="button" variant="outline" class="danger" :disabled="canceling" @click="$emit('cancel', request)">{{ canceling ? '撤销中…' : '撤销求购' }}</Button>
    </div>
  </div>

</template>

<style scoped>

.pr-card { display:flex; flex-direction:column; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:20px; padding:24px; cursor:pointer; min-width:0; transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease; }.pr-card:hover { transform:translateY(-2px); border-color:var(--yb-brand-primary); box-shadow:var(--yb-shadow-1); }.pr-card:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.head { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:16px; }.status-pill { font-size:12px; font-weight:500; padding:4px 10px; border-radius:999px; color:var(--yb-brand-primary); background:var(--yb-primary-soft); }.status-pill[data-status='claimed'] { background:var(--yb-success-soft); color:var(--yb-success); }.status-pill[data-status='rejected'] { background:var(--yb-danger-soft); color:var(--yb-danger); }.status-pill[data-status='cancelled'] { background:var(--yb-fill); color:var(--yb-muted); }.category { color:var(--yb-muted); font-size:12px; overflow-wrap:anywhere; }.title { font-size:20px; line-height:1.4; font-weight:600; margin:8px 0 12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }.appeal { font-size:14px; color:var(--yb-muted); line-height:1.7; margin:0 0 22px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap; }.money-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:auto; }.money-row strong { font-size:23px; font-family:var(--yb-font-mono); font-weight:600; color:var(--yb-brand-primary); }.money-row strong small { font-size:12px; font-weight:400; }.money-row>span { font-size:12px; color:var(--yb-muted); }.meta-tags { display:flex; gap:14px; flex-wrap:wrap; margin:16px 0 8px; }.meta-tags span { display:inline-flex; align-items:center; gap:5px; color:var(--yb-muted); font-size:12px; }.deadline,.code { font-size:12px; color:var(--yb-muted); margin:3px 0; overflow-wrap:anywhere; }.code { font-family:var(--yb-font-mono); }.claimed { display:flex; align-items:center; gap:6px; flex-wrap:wrap; color:var(--yb-success); font-size:13px; padding:12px 0; margin:0; overflow-wrap:anywhere; }.actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; border-top:1px solid var(--yb-hairline); padding-top:18px; }.actions>button:first-child { flex:1; }.danger { color:var(--yb-danger); }.danger:hover { background:var(--yb-danger-soft); }@media(prefers-reduced-motion:reduce) { .pr-card { transition:none; }.pr-card:hover { transform:none; } }

</style>
