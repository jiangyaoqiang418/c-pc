<script setup lang="ts">
import { computed } from 'vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserStore } from '@/stores';
import { getOrderCapabilities } from '@/utils/order';

interface Props {
  order: Api.RealOrder.DisplayRecord;
  variant?: 'card' | 'detail';
  reviewable?: boolean;
  busy?: boolean;
}
const props = withDefaults(defineProps<Props>(), { variant: 'card', reviewable: false, busy: false });
const userStore = useUserStore();

const emit = defineEmits<{
  (e: 'pay'): void;
  (e: 'cancel'): void;
  (e: 'confirm'): void;
  (e: 'extend-receipt'): void;
  (e: 'review'): void;
  (e: 'aftersale'): void;
  (e: 'detail'): void;
  (e: 'logistics'): void;
  (e: 'cs'): void;
}>();

const actions = computed(() => {
  const a: { type: string; label: string; primary?: boolean; emit: () => void; disabled?: boolean; tip?: string }[] =
    [];
  const s = props.order.status;
  const permissions = getOrderCapabilities(props.order, userStore.currentUser?.id);
  if (permissions.pay) {
    a.push({ type: 'pay', label: '立即付款', primary: true, emit: () => emit('pay') });
    a.push({ type: 'cancel', label: '取消订单', emit: () => emit('cancel') });
  }
  if (permissions.isCustomer && (s === 'PROCURING' || s === 'PROCURED')) {
    a.push({ type: 'cs', label: '联系买手', emit: () => emit('cs') });
    a.push({ type: 'aftersale', label: '申请仅退款', emit: () => emit('aftersale') });
  }
  if (permissions.logistics) {
    a.push({ type: 'logistics', label: '查看物流', emit: () => emit('logistics') });
  }
  if (permissions.confirm && s === 'IN_TRANSIT') {
    a.push({ type: 'confirm', label: '确认收货', primary: true, emit: () => emit('confirm') });
    if (permissions.extendReceipt) a.push({ type: 'extend-receipt', label: '延长收货', emit: () => emit('extend-receipt') });
    a.push({ type: 'aftersale', label: '申请仅退款', emit: () => emit('aftersale') });
  }
  if (permissions.confirm && s === 'AFTERSALE_CONFIRM') {
    a.push({ type: 'confirm', label: '签字确认', primary: true, emit: () => emit('confirm') });
    a.push({ type: 'aftersale', label: '申请仅退款', emit: () => emit('aftersale') });
  }
  if (permissions.review && props.reviewable) {
    a.push({ type: 'review', label: '写评价', emit: () => emit('review') });
  }
  if (permissions.viewAftersale) {
    a.push({ type: 'aftersale', label: '查看售后', emit: () => emit('aftersale') });
  }
  if (props.variant === 'card') {
    a.push({ type: 'detail', label: '订单详情', emit: () => emit('detail') });
  }
  return a;
});
const orderedActions = computed(() => {
  const order = props.variant === 'card'
    ? ['detail', 'pay', 'logistics', 'confirm', 'review', 'cancel', 'extend-receipt', 'aftersale', 'cs']
    : ['cancel', 'pay', 'aftersale', 'confirm', 'review', 'extend-receipt', 'logistics', 'cs'];
  return [...actions.value].sort((left, right) => order.indexOf(left.type) - order.indexOf(right.type));
});
</script>

<template>
  <div class="actions button-row" :class="variant">
    <template v-for="a in orderedActions" :key="a.type">
      <TooltipProvider v-if="a.tip || busy"><Tooltip><TooltipTrigger as-child><span :tabindex="a.disabled || busy ? 0 : undefined"><button type="button" :class="a.type === 'pay' ? 'gold' : a.primary ? 'primary' : 'outline'" :disabled="a.disabled || busy" @click.stop="a.emit">{{ a.type === 'pay' ? '继续支付' : a.type === 'review' ? '评价商品' : a.label }}</button></span></TooltipTrigger><TooltipContent>{{ busy ? '订单操作正在处理，请稍候' : a.tip }}</TooltipContent></Tooltip></TooltipProvider>
      <button type="button" v-else :class="a.type === 'pay' ? 'gold' : a.primary ? 'primary' : 'outline'" :disabled="a.disabled" @click.stop="a.emit">{{ a.type === 'pay' ? '继续支付' : a.type === 'review' ? '评价商品' : a.label }}</button>
    </template>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
.actions.detail {
  gap: 12px;
}
</style>
