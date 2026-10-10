<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { Icon } from '@iconify/vue';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

const value = computed(() => (userStore.isBuyerActive ? 'buyer' : 'customer'));

function onChange(v: 'customer' | 'buyer') {
  if (v === value.value) return;
  if (v === 'buyer' && !userStore.canSwitchToBuyer) {
    const u = userStore.currentUser;
    if (!u?.isBuyer) {
      Message.info({
        content: '当前账号不是买手，暂时无法切换为买手视角',
        duration: 4000
      });
      return;
    }
    Message.warning('您的 KYC 状态需为「已通过」才能切换为买手');
    router.push('/kyc');
    return;
  }
  if (router.currentRoute.value.name === 'order-list') {
    void router.push({ query: { ...router.currentRoute.value.query, view: v === 'buyer' ? 'sell' : 'buy', page: undefined } });
    return;
  }
  const ok = userStore.setAudience(v);
  if (ok !== false) {
    Message.success(v === 'buyer' ? '已切换为买手视角' : '已切换为顾客视角');
  }
}
</script>

<template>
  <div class="audience-segment" role="group" aria-label="当前视角">
    <button
      type="button"
      class="seg"
      :class="{ active: value === 'customer' }"
      :aria-pressed="value === 'customer'"
      @click="onChange('customer')"
    >
      <Icon icon="lucide:user" width="13" />
      <span>顾客</span>
    </button>
    <button
      type="button"
      class="seg"
      :class="{ active: value === 'buyer' }"
      :aria-pressed="value === 'buyer'"
      @click="onChange('buyer')"
    >
      <Icon icon="lucide:store" width="13" />
      <span>买手</span>
    </button>
  </div>
</template>

<style scoped>
.audience-segment {
  display: inline-flex;
  background: var(--yb-bg);
  border: 1px solid var(--yb-hairline);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
  width: 100%;
}
.seg {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--yb-muted);
  cursor: pointer;
  transition: background 150ms, color 150ms, box-shadow 150ms;
  user-select: none;
  letter-spacing: 0.02em;
}
.seg:hover {
  color: var(--yb-ink);
}
.seg.active {
  background: var(--yb-brand-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--yb-primary-rgb), 0.20);
}
.seg.active:hover {
  color: #fff;
}
.seg:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) { .seg { transition: none; } }
</style>
