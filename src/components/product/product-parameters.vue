<script setup lang="ts">
import { computed, ref } from 'vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
const props = defineProps<{ parameters: Api.RealProduct.ProductParameter[]; summary?: boolean }>();
const explanation = ref('');
const groups = computed(() => {
  const result = new Map<string, Api.RealProduct.ProductParameter[]>();
  const rows = props.summary ? props.parameters.filter(row => row.highlighted).slice(0, 6) : props.parameters;
  for (const row of rows) { const key = row.groupName?.trim() || '基本参数'; result.set(key, [...(result.get(key) || []), row]); }
  return [...result];
});
</script>
<template>
  <TooltipProvider><section v-if="groups.length" class="product-parameters" :aria-label="summary ? '重点参数' : '商品参数'">
    <div v-for="[group, rows] in groups" :key="group"><h3>{{ summary ? '重点参数' : group }}</h3><dl><template v-for="(row, index) in rows" :key="index"><dt>{{ row.name }} <Tooltip v-if="row.explanation"><TooltipTrigger as-child><button type="button" :aria-label="row.name + '：' + row.explanation" @click="explanation = row.explanation || ''">?</button></TooltipTrigger><TooltipContent>{{ row.explanation }}</TooltipContent></Tooltip></dt><dd>{{ row.value }}</dd></template></dl></div>
    <p v-if="explanation" class="parameter-explanation" role="status">{{ explanation }} <button type="button" aria-label="收起参数说明" @click="explanation = ''">×</button></p>
  </section></TooltipProvider>
</template>
<style scoped>
.product-parameters { margin:20px 0; }.product-parameters h3 { margin:12px 0; }dl { display:grid; grid-template-columns:minmax(90px,1fr) minmax(0,2fr); gap:12px; }dt { color:var(--muted); }dd { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }button { border:1px solid var(--line); border-radius:50%; width:24px; height:24px; }button:focus-visible { outline:2px solid var(--green); }
</style>
