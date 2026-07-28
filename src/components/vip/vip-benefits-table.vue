<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  audience: Api.Vip.Audience;
  currentLevel: Api.User.VipLevel;
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
  threshold: number;
  meta: (typeof enums.VIP_META)[Api.User.VipLevel];
  values: { key: string; label: string; unit: string; value: string }[];
}

const rows = computed<RowItem[]>(() => {
  return LEVELS.map(level => {
    const cfg = props.configs.find(c => c.audience === props.audience && c.level === level);
    return {
      level,
      label: enums.VIP_META[level].label,
      threshold: cfg?.threshold || 0,
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
    <table class="benefits-table">
      <thead>
        <tr>
          <th class="col-level">等级</th>
          <th class="col-threshold">积分阈值</th>
          <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.level" :class="{ current: row.level === currentLevel }">
          <td class="col-level">
            <span class="level-badge" :style="{ color: row.meta.color, background: row.meta.bg }">{{ row.label }}</span>
            <span v-if="row.level === currentLevel" class="you">当前</span>
          </td>
          <td class="col-threshold">{{ row.threshold.toLocaleString() }} 分</td>
          <td v-for="v in row.values" :key="v.key">
            {{ v.value }}<span class="unit">{{ v.value === '—' ? '' : ' ' + v.unit }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  background: #fff;
  border-radius: var(--bw-card-radius);
  overflow: hidden;
  border: 1px solid #f2f3f5;
}
.benefits-table {
  width: 100%;
  border-collapse: collapse;
}
.benefits-table th,
.benefits-table td {
  padding: 14px 16px;
  text-align: center;
  font-size: 13px;
}
.benefits-table th {
  background: #f7f8fa;
  color: #4e5969;
  font-weight: 500;
  font-size: 12px;
}
.benefits-table tbody tr {
  border-top: 1px solid #f2f3f5;
  transition: background 0.15s;
}
.benefits-table tbody tr.current {
  background: linear-gradient(90deg, #f5e8ff 0%, #f3f7ff 100%);
  font-weight: 600;
}
.col-level {
  text-align: left;
  display: flex;
  align-items: center;
  gap: 6px;
}
.level-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.you {
  font-size: 10px;
  color: #722ed1;
  background: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #722ed1;
}
.unit {
  color: #86909c;
  font-weight: 400;
}
</style>
