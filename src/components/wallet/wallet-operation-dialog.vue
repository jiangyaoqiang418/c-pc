<script setup lang="ts">
import BusinessDialog from '@/components/common/business-dialog.vue';

const props = defineProps<{ visible: boolean; title: string; description: string; deposit?: boolean; busy?: boolean }>();
const emit = defineEmits<{ dismiss: [] }>();
function update(value: boolean) { if (!value && !props.busy) emit('dismiss'); }
</script>

<template>
  <BusinessDialog :visible="visible" :title="title" :width="490" :footer="false" :content-class="deposit ? 'wallet-operation-dialog deposit-dialog' : 'wallet-operation-dialog'" :closable="!busy" :mask-closable="!busy" :esc-to-close="!busy" @update:visible="update">
    <p class="wallet-operation-description">{{ description }}</p>
    <slot />
  </BusinessDialog>
</template>

<style scoped>
.wallet-operation-description { margin-bottom:16px; }
</style>
