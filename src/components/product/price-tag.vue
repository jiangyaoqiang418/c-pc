<script setup lang="ts">
import { computed } from 'vue';
import { priceSet, formatUsdt, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import InfoTooltip from '@/components/common/info-tooltip.vue';

interface Props {
  price: string | number;
  shippingFee?: string | number;
  tax?: string | number;
  stock?: number;
  size?: 'sm' | 'md' | 'lg';
  showFee?: boolean;
  showRate?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showFee: false,
  showRate: true
});

const set = computed(() => priceSet(props.price));
</script>

<template>
  <div class="price-tag" :class="size">
    <!-- 主：USDT 大字（结算货币） -->
    <div class="main-line">
      <span class="usdt-value">{{ set.usdt }}</span>
    </div>
    <!-- 副 1：CNY 折算 -->
    <div class="sub-line">
      <span class="approx">≈</span>
      <span class="cny-value">{{ set.cny }}</span>
    </div>
    <!-- 副 2：实时汇率 -->
    <div v-if="showRate" class="rate-line">
      {{ set.rateLabel }}
    </div>
    <!-- fees strip: U 单币 -->
    <div v-if="showFee" class="fees-strip">
      <span v-if="shippingFee != null" class="fee-item">
        <span class="fee-label">运费</span>
        <span class="fee-num">{{ formatUsdt(shippingFee) }}</span>
      </span>
      <span v-if="shippingFee != null && tax != null" class="fee-sep">|</span>
      <span v-if="tax != null" class="fee-item">
        <span class="fee-label">税费</span>
        <span class="fee-num">{{ formatUsdt(tax) }}</span>
        <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="12" />
      </span>
      <span v-if="stock != null" class="fee-sep">|</span>
      <span v-if="stock != null" class="fee-item">
        <span class="fee-label">库存</span>
        <span class="fee-num">{{ stock }} 件</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.price-tag {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.15;
  font-family: var(--yb-font-mono);
  font-variant-numeric: tabular-nums;
}

.main-line {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.usdt-value {
  color: var(--yb-ink);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sub-line {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: var(--yb-muted);
  font-weight: 500;
  margin-top: 2px;
}
.approx {
  color: var(--yb-faint);
  font-family: var(--yb-font-body);
}
.cny-value {
  color: var(--yb-muted);
  font-weight: 600;
}
.rate-line {
  color: var(--yb-faint);
  font-family: var(--yb-font-mono);
  font-weight: 500;
}

/* Sizes */
.price-tag.sm .usdt-value { font-size: 15px; }
.price-tag.sm .sub-line { font-size: 10px; }
.price-tag.sm .rate-line { font-size: 9px; }

.price-tag.md .usdt-value { font-size: 22px; }
.price-tag.md .sub-line { font-size: 11px; }
.price-tag.md .rate-line { font-size: 10px; }

.price-tag.lg .usdt-value { font-size: 40px; }
.price-tag.lg .sub-line { font-size: 14px; }
.price-tag.lg .rate-line { font-size: 12px; }

/* Fees strip */
.fees-strip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--yb-hairline);
  font-family: var(--yb-font-body);
  font-size: 12px;
  color: var(--yb-ink-2);
}
.fee-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.fee-label {
  color: var(--yb-muted);
}
.fee-num {
  color: var(--yb-ink);
  font-family: var(--yb-font-mono);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fee-sep {
  color: var(--yb-hairline-2);
  font-family: var(--yb-font-body);
}
</style>
