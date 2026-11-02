<script setup lang="ts">
import { computed } from 'vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
const props = defineProps<{ parameters: Api.RealProduct.ProductParameter[] }>();
const highlights = computed(() => props.parameters.filter(row => row.highlighted).slice(0, 6));
const groups = computed(() => {
  const result = new Map<string, Api.RealProduct.ProductParameter[]>();
  for (const row of props.parameters) { const key = row.groupName?.trim() || '基本参数'; result.set(key, [...(result.get(key) || []), row]); }
  return [...result];
});
</script>
<template>
  <TooltipProvider :delay-duration="200"><section v-if="groups.length" class="product-parameters" aria-label="商品参数">
    <dl v-if="highlights.length" class="parameter-highlights" aria-label="重点参数">
      <div v-for="(row, index) in highlights" :key="index"><dt>{{ row.name }}</dt><dd>{{ row.value }}</dd></div>
    </dl>
    <section v-for="[group, rows] in groups" :key="group" class="parameter-group"><h3>{{ group }}</h3><dl class="parameter-grid"><div v-for="(row, index) in rows" :key="index" class="parameter-row"><dt>{{ row.name }} <Tooltip v-if="row.explanation"><TooltipTrigger as-child><button type="button" class="parameter-help" :aria-label="'查看' + row.name + '说明'">?</button></TooltipTrigger><TooltipContent class="whitespace-pre-wrap">{{ row.explanation }}</TooltipContent></Tooltip></dt><dd>{{ row.value }}</dd></div></dl></section>
  </section></TooltipProvider>
</template>
<style scoped>
.product-parameters { margin:0 0 28px; min-width:0; color:var(--ink); }
.parameter-highlights { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px 16px; margin:0 0 24px; padding:24px 20px; border-radius:8px; background:var(--soft); text-align:center; }
.parameter-highlights > div { display:flex; flex-direction:column-reverse; gap:8px; min-width:0; }
dt { color:var(--muted); overflow-wrap:anywhere; }
dd { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.parameter-highlights dt { font-size:12px; }
.parameter-highlights dd { font-size:17px; font-weight:600; line-height:1.5; }
.parameter-group h3 { margin:20px 0 12px; font-size:14px; font-weight:600; }
.parameter-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 24px; margin:0; }
.parameter-row { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,3fr); align-items:baseline; gap:12px; padding:12px 0; border-bottom:1px solid var(--line); font-size:13px; line-height:1.7; }
.parameter-help { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid var(--line); border-radius:50%; width:24px; height:24px; padding:0; background:var(--paper); color:var(--ink); vertical-align:middle; cursor:pointer; }
button:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
@media(max-width:600px) { .parameter-highlights { grid-template-columns:repeat(2,minmax(0,1fr)); padding:20px 12px; }.parameter-grid { grid-template-columns:minmax(0,1fr); } }
</style>
