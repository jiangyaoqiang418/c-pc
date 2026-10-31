<script setup lang="ts">
const props = defineProps<{ parameters: Api.RealProduct.ProductParameter[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:parameters': [value: Api.RealProduct.ProductParameter[]] }>();
function change(index: number, field: keyof Api.RealProduct.ProductParameter, value: string | boolean) {
  if (props.disabled) return;
  emit('update:parameters', props.parameters.map((row, i) => i === index ? { ...row, [field]: value } : row));
}
function move(index: number, step: number) {
  if (props.disabled || index + step < 0 || index + step >= props.parameters.length) return;
  const rows = [...props.parameters];
  [rows[index], rows[index + step]] = [rows[index + step], rows[index]];
  emit('update:parameters', rows);
}
</script>

<template>
  <section class="paper product-details-editor">
    <h2>商品参数</h2>
    <fieldset :disabled="disabled">
      <legend class="sr-only">商品参数</legend>
      <p class="hint">用于详情展示，不影响 SKU 的价格和库存。最多 200 项，按列表顺序展示。</p>
      <div v-for="(row, index) in parameters" :key="index" class="parameter-row">
        <label>分组<input :value="row.groupName" maxlength="64" placeholder="基本参数" @input="change(index, 'groupName', ($event.target as HTMLInputElement).value)" /></label>
        <label>参数名称<input :value="row.name" maxlength="64" placeholder="如处理器型号" @input="change(index, 'name', ($event.target as HTMLInputElement).value)" /></label>
        <label>参数值<textarea :value="row.value" maxlength="1000" rows="2" placeholder="请输入参数值" @input="change(index, 'value', ($event.target as HTMLTextAreaElement).value)" /></label>
        <label>问号说明<textarea :value="row.explanation" maxlength="500" rows="2" placeholder="选填，解释此参数" @input="change(index, 'explanation', ($event.target as HTMLTextAreaElement).value)" /></label>
        <label class="highlight"><input type="checkbox" :checked="row.highlighted" @change="change(index, 'highlighted', ($event.target as HTMLInputElement).checked)" />在详情摘要展示</label>
        <div class="button-row"><button type="button" class="outline" :disabled="index === 0" @click="move(index, -1)">上移</button><button type="button" class="outline" :disabled="index === parameters.length - 1" @click="move(index, 1)">下移</button><button type="button" class="outline" @click="emit('update:parameters', parameters.filter((_, i) => i !== index))">删除参数</button></div>
      </div>
      <button type="button" class="outline" :disabled="parameters.length >= 200" @click="emit('update:parameters', [...parameters, { groupName: '', name: '', value: '', explanation: '', highlighted: false }])">添加参数</button>
    </fieldset>
  </section>
</template>

<style scoped>
.product-details-editor { margin-bottom:20px; }.product-details-editor h2 { margin-bottom:16px; }fieldset { border:0; padding:0; min-width:0; }legend { margin-bottom:12px; }.hint { color:var(--muted); }.parameter-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:16px 0; padding:16px; border:1px solid var(--line); border-radius:8px; }.parameter-row label { display:grid; gap:6px; min-width:0; }input,textarea { width:100%; border:1px solid var(--line); background:var(--paper); color:var(--ink); padding:10px; border-radius:6px; }.parameter-row .highlight { display:flex; align-items:center; }.highlight input { width:auto; }.button-row { flex-wrap:wrap; }@media(max-width:700px) { .parameter-row { grid-template-columns:1fr; } }
</style>
