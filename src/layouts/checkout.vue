<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import BrandLogo from '@/components/layout/brand-logo.vue';

const route = useRoute();
const currentStep = computed(() => route.name === 'checkout-success' ? 1 : 0);
const steps = [{ title: '收货与支付', description: '确认信息' }, { title: '支付结果', description: '核对订单状态' }];
</script>

<template>
  <div class="layout-checkout">
    <header class="checkout-header">
      <div class="checkout-header-inner">
        <div class="checkout-brand"><BrandLogo /><span>订单结算</span></div>
        <ol class="checkout-steps" aria-label="结算流程">
          <li v-for="(step, index) in steps" :key="step.title" :class="{ active: currentStep === index, complete: currentStep > index }" :aria-current="currentStep === index ? 'step' : undefined">
            <span class="step-number"><Icon v-if="currentStep > index" icon="lucide:check" /><template v-else>{{ index + 1 }}</template></span>
            <span><strong>{{ step.title }}</strong><small>{{ step.description }}</small></span>
          </li>
        </ol>
      </div>
    </header>
    <main class="checkout-main"><RouterView /></main>
  </div>
</template>

<style scoped>
.layout-checkout { min-height: 100vh; background: var(--yb-bg); }
.checkout-header { background: var(--yb-surface); border-bottom: 1px solid var(--yb-hairline); }
.checkout-header-inner { width: calc(100% - 96px); max-width: 1320px; margin: auto; display: flex; justify-content: space-between; align-items: center; gap: 32px; min-height: 100px; }
.checkout-brand { display: flex; gap: 24px; align-items: center; }
.checkout-brand > span { padding-left: 24px; border-left: 1px solid var(--yb-hairline); font-size: 15px; color: var(--yb-muted); }
.checkout-steps { display: flex; gap: 40px; list-style: none; padding: 0; margin: 0; }
.checkout-steps li { display: flex; gap: 10px; align-items: center; color: var(--yb-muted); }
.step-number { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--yb-fill); }
.checkout-steps .active, .checkout-steps .complete { color: var(--yb-primary); }
.active .step-number, .complete .step-number { background: var(--yb-primary); color: white; }
.checkout-steps strong { font-size: 14px; font-weight: 500; display: block; }
.checkout-steps small { font-size: 12px; display: block; }
.checkout-main { max-width: 1320px; width: calc(100% - 96px); margin: auto; padding-block: 32px 64px; }
@media (max-width: 1100px) { .checkout-header-inner, .checkout-main { width: calc(100% - 48px); } }
@media (max-width: 800px) { .checkout-header-inner { flex-wrap: wrap; padding-block: 20px; } }
</style>
