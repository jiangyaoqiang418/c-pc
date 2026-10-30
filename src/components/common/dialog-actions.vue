<script setup lang="ts">
import { inject } from 'vue';
import { dialogFooterKey } from './dialog-footer';

const target = inject(dialogFooterKey, null);
</script>

<template>
  <Teleport v-if="target" :to="target"><div class="um-dialog-action-group"><slot /></div></Teleport>
  <div v-else class="um-dialog-action-group"><slot /></div>
</template>
