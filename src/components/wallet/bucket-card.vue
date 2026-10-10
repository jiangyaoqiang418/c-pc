<script setup lang="ts">

import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { enums, formatAmount } from '@shared';
import type { BucketKey } from '@shared/enums/wallet';

interface Props {
  bucketKey: BucketKey;
  amount?: string;
  variant?: 'card' | 'row';
  pct?: number; // 占比 0-100，仅 row variant 用
}
const props = withDefaults(defineProps<Props>(), { variant: 'card' });

const router = useRouter();
const meta = computed(() => enums.BUCKET_META[props.bucketKey]);
const safePct = computed(() => {
  if (props.pct === undefined || !Number.isFinite(props.pct)) return undefined;
  return Math.max(0, Math.min(100, props.pct));
});

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
  <button v-if="variant === 'row'" type="button" class="bucket-row" @click="go"><span class="row-left"><span class="icon-wrap"><Icon :icon="iconName" width="20" /></span><span class="row-label"><strong>{{ meta.label }}</strong><small>{{ meta.hint }}</small></span></span><span class="row-right"><strong>U {{ formatAmount(amount, { decimals: 2 }) }}</strong><small v-if="safePct != null">{{ safePct.toFixed(1) }}%</small><Icon icon="lucide:chevron-right" width="15" /></span></button>
  <button v-else type="button" class="bucket-card" @click="go"><span class="card-head"><Icon :icon="iconName" width="19" /><span>{{ meta.label }}</span></span><strong class="amount">U {{ formatAmount(amount, { decimals: 2 }) }}</strong><small>{{ meta.hint }}</small></button>
</template>

<style scoped>
.bucket-row { display:flex; justify-content:space-between; align-items:center; gap:18px; width:100%; padding:18px 12px; border:0; border-bottom:1px solid var(--yb-hairline); background:transparent; text-align:left; cursor:pointer; transition:background .15s; }.bucket-row:last-child { border-bottom:0; }.bucket-row:hover { background:var(--yb-primary-soft); }.bucket-row:focus-visible,.bucket-card:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.row-left { display:flex; align-items:center; gap:14px; min-width:0; }.icon-wrap { display:grid; place-items:center; width:36px; height:36px; background:var(--yb-fill); border-radius:6px; color:var(--yb-brand-primary); flex-shrink:0; }.row-label strong { display:block; font-size:14px; font-weight:500; }.row-label small { display:block; margin-top:5px; font-size:12px; color:var(--yb-muted); line-height:1.6; }.row-right { display:flex; align-items:center; gap:14px; text-align:right; flex-shrink:0; }.row-right strong { font-size:18px; font-weight:600; font-variant-numeric:tabular-nums; }.row-right small { color:var(--yb-muted); min-width:40px; font-size:12px; }.row-right svg { color:var(--yb-muted); }.bucket-card { display:block; width:100%; text-align:left; padding:24px; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-paper); cursor:pointer; transition:transform .2s,box-shadow .2s,border-color .2s; }.bucket-card:hover { transform:translateY(-2px); border-color:var(--yb-hairline-2); box-shadow:0 8px 24px rgb(20 40 30 / 5%); }.card-head { display:flex; align-items:center; gap:12px; margin-bottom:18px; font-size:14px; color:var(--yb-muted); }.card-head svg { color:var(--yb-brand-primary); }.amount { display:block; font-size:25px; font-weight:600; }.bucket-card>small { display:block; color:var(--yb-muted); font-size:12px; margin-top:10px; }@media(max-width:700px) { .row-right { gap:8px; }.row-right strong { font-size:16px; }.row-right>small { display:none; } }@media(prefers-reduced-motion:reduce) { .bucket-row,.bucket-card { transition:none; }.bucket-card:hover { transform:none; } }
</style>
