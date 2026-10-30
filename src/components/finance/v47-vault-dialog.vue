<script setup lang="ts">
import BusinessDialog from '@/components/common/business-dialog.vue';
import UmIcon from '@/components/common/um-icon.vue';

const props = defineProps<{ visible: boolean; title: string; description: string; eyebrow?: string; icon?: string; busy?: boolean }>();
const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
function update(value: boolean) { if (!props.busy) emit('update:visible', value); }
</script>

<template>
  <BusinessDialog :visible="visible" :title="title" :width="450" :footer="false" content-class="vault-dialog" :closable="!busy" :mask-closable="!busy" :esc-to-close="!busy" @update:visible="update">
    <span class="vault-confirm-icon"><UmIcon :name="icon || 'shield'" /></span><span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
    <p>{{ description }}</p>
    <slot />
  </BusinessDialog>
</template>
