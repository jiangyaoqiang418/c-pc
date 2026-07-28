<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
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
        content: '此账号非买手身份，请切换到买手账号（张丽琳/杨建军）体验',
        duration: 4000
      });
      return;
    }
    Message.warning('您的 KYC 状态需为「已通过」才能切换为买手');
    router.push('/kyc');
    return;
  }
  const ok = userStore.setAudience(v);
  if (ok !== false) {
    Message.success(v === 'buyer' ? '已切换为买手视角' : '已切换为顾客视角');
  }
}
</script>

<template>
  <div class="audience-segment">
    <div
      class="seg"
      :class="{ active: value === 'customer' }"
      @click="onChange('customer')"
    >
      <Icon icon="lucide:user" width="13" />
      <span>顾客</span>
    </div>
    <div
      class="seg"
      :class="{ active: value === 'buyer' }"
      @click="onChange('buyer')"
    >
      <Icon icon="lucide:store" width="13" />
      <span>买手</span>
    </div>
  </div>
</template>

<style scoped>
.audience-segment {
  display: inline-flex;
  background: var(--yb-bg);
  border: 1px solid var(--yb-hairline);
  border-radius: 999px;
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
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--yb-muted);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  letter-spacing: 0.02em;
}
.seg:hover {
  color: var(--yb-ink);
}
.seg.active {
  background: var(--yb-brand-pink);
  color: #fff;
  box-shadow: 0 2px 8px rgba(250, 36, 60, 0.20);
}
.seg.active:hover {
  color: #fff;
}
</style>
