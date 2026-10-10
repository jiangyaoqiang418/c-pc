<script setup lang="ts">

import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  audience: Api.Vip.Audience;
  currentLevel?: Api.User.VipLevel;
  configs: Api.Vip.LevelConfig[];
}
const props = defineProps<Props>();

const LEVELS: Api.User.VipLevel[] = ['VIP0', 'VIP1', 'VIP2'];

const columns = computed(() =>
  props.audience === 'buyer' ? enums.BUYER_BENEFITS_DESC : enums.CUSTOMER_BENEFITS_DESC
);

interface RowItem {
  level: Api.User.VipLevel;
  label: string;
  threshold?: number;
  meta: (typeof enums.VIP_META)[Api.User.VipLevel];
  values: { key: string; label: string; unit: string; value: string }[];
}

const rows = computed<RowItem[]>(() => {
  return LEVELS.map(level => {
    const cfg = props.configs.find(c => c.audience === props.audience && c.level === level);
    return {
      level,
      label: enums.VIP_META[level].label,
      threshold: cfg?.threshold,
      meta: enums.VIP_META[level],
      values: columns.value.map(col => {
        const raw = cfg
          ? props.audience === 'buyer'
            ? ((cfg.buyerBenefits as Record<string, number> | undefined)?.[col.key])
            : ((cfg.customerBenefits as Record<string, number> | undefined)?.[col.key])
          : undefined;
        const value = raw == null ? '—' : String(raw);
        return { key: col.key, label: col.label, unit: col.unit, value };
      })
    };
  });
});


</script>

<template>
  <div class="table-wrap">
    <table class="benefits-table"><caption class="sr-only">{{ audience === 'buyer' ? '买手' : '顾客' }} VIP 等级权益对比</caption><thead><tr><th scope="col">等级</th><th scope="col">积分阈值</th><th v-for="col in columns" :key="col.key" scope="col">{{ col.label }}</th></tr></thead><tbody><tr v-for="row in rows" :key="row.level" :class="{ current: row.level === currentLevel }"><th scope="row"><span class="level-label"><span class="level-badge" :style="{ color: row.meta.color, background: row.meta.bg }">{{ row.label }}</span><span v-if="row.level === currentLevel" class="you">当前</span></span></th><td>{{ row.threshold === undefined ? '—' : row.threshold.toLocaleString() + ' 分' }}</td><td v-for="v in row.values" :key="v.key">{{ v.value }}<span class="unit">{{ v.value === '—' ? '' : ' ' + v.unit }}</span></td></tr></tbody></table>
  </div>
</template>

<style scoped>
.table-wrap { border:1px solid var(--yb-hairline); border-radius:10px; overflow-x:auto; background:var(--yb-paper); }.benefits-table { border-collapse:collapse; min-width:850px; width:100%; }.benefits-table th,.benefits-table td { padding:22px 20px; text-align:center; font-size:14px; }.benefits-table thead th { padding:18px 20px; background:var(--yb-fill); color:var(--yb-muted); font-size:13px; font-weight:500; }.benefits-table tbody th { font-weight:500; }.benefits-table tbody tr { border-top:1px solid var(--yb-hairline); }.benefits-table tbody tr.current { background:var(--yb-primary-soft); font-weight:600; }.level-label { display:flex; align-items:center; justify-content:center; gap:10px; }.level-badge { padding:4px 9px; border-radius:4px; font-weight:600; white-space:nowrap; }.you { padding:3px 8px; font-size:11px; color:var(--yb-brand-primary); background:var(--yb-paper); border:1px solid var(--yb-hairline-2); border-radius:4px; white-space:nowrap; }.unit { color:var(--yb-muted); font-weight:400; }
</style>
