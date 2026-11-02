<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import { Message, Modal } from '@/lib/feedback';
import { missingProductSkuCombinations, productSkuEditorGroups, type ProductSkuEditorState } from '@/utils/product-sku';

const props = defineProps<{ modelValue: ProductSkuEditorState; disabled?: boolean; contextKey: string }>();
const emit = defineEmits<{
  (event: 'update:modelValue', state: ProductSkuEditorState): void;
  (event: 'uploading', value: boolean): void;
  (event: 'uploaded', files: Api.RealProduct.FileUploadResult[]): void;
}>();
const selection = ref(new Map<string, string>());
const skuImages = new Map<string, { url: string; values: string[] }>();
let nextSkuKey = 0;
const uploadingRows = reactive(new Set<number>());
const busy = computed(() => props.disabled || uploadingRows.size > 0);
let active = true;
let confirmation: ReturnType<typeof Modal.confirm> | undefined;
onBeforeUnmount(() => { active = false; confirmation?.close(); emit('uploading', false); });
const groups = computed(() => productSkuEditorGroups(props.modelValue));
function change(edit: (next: ProductSkuEditorState) => void) {
  if (props.disabled || !active) return;
  const next = JSON.parse(JSON.stringify(props.modelValue)) as ProductSkuEditorState;
  edit(next);
  emit('update:modelValue', next);
}
function groupReferenced(index: number) { return props.modelValue.skus.some(sku => sku.specs.some(spec => spec.name === props.modelValue.groups[index]?.name)); }
function rowKey(sku: ProductSkuEditorState['skus'][number], index: number) { return sku.id == null ? sku.key || 'new:' + index : 'saved:' + String(sku.id); }
function imageValues(sku: ProductSkuEditorState['skus'][number], index: number) {
  const key = rowKey(sku, index);
  const cached = skuImages.get(key);
  if (cached?.url === sku.image) return cached.values;
  const values = sku.image ? [sku.image] : [];
  skuImages.set(key, { url:sku.image, values });
  return values;
}
function addGroup() { if (!busy.value && props.modelValue.groups.length < 3) change(next => next.groups.push({ name: '', options: [''] })); }
function removeGroup(index: number) {
  if (busy.value) return;
  if (groupReferenced(index)) return Message.warning('该规格组已有组合，请先明确移除相应 SKU');
  change(next => { next.groups.splice(index, 1); });
}
function removeOption(groupIndex: number, optionIndex: number) {
  const group = props.modelValue.groups[groupIndex];
  if (busy.value) return;
  if (props.modelValue.skus.some(sku => sku.specs.some(spec => spec.name === group.name && spec.value === group.options[optionIndex]))) return Message.warning('该选项已有组合，请先明确移除相应 SKU');
  change(next => { next.groups[groupIndex].options.splice(optionIndex, 1); });
}
function optionReferenced(groupIndex: number, optionIndex: number) {
  const group = props.modelValue.groups[groupIndex];
  return props.modelValue.skus.some(sku => sku.specs.some(spec => spec.name === group.name && spec.value === group.options[optionIndex]));
}
function selectedSpecs() {
  if (!groups.value.length || groups.value.some(group => !group.name || !group.options.length || group.options.some(option => !option))) throw new Error('请先填写完整的规格组与选项');
  if (new Set(groups.value.map(group => group.name)).size !== groups.value.length || groups.value.some(group => new Set(group.options).size !== group.options.length)) throw new Error('规格组及组内选项不能重复');
  return groups.value.map(group => ({ name: group.name, value: selection.value.get(group.name) || group.options[0] }));
}
function addSku() {
  if (busy.value) return;
  try {
    const specs = selectedSpecs();
    if (props.modelValue.skus.length >= 200) throw new Error('最多保留 200 个 SKU');
    if (specs.some(spec => !groups.value.find(group => group.name === spec.name)?.options.includes(spec.value))) throw new Error('请重新选择规格选项');
    if (props.modelValue.skus.some(sku => specs.every(spec => sku.specs.some(item => item.name === spec.name && item.value === spec.value)))) throw new Error('该规格组合已存在');
    change(next => next.skus.push({ key:'new:' + Date.now() + ':' + ++nextSkuKey, specs, price: '', stock: '0', enabled: true, image: '' }));
  } catch (error) { Message.warning((error as Error).message); }
}
function generateSkus() {
  if (busy.value) return;
  try {
    const missing = missingProductSkuCombinations(props.modelValue);
    if (!missing.length) return Message.info('所有规格组合均已添加，原有价格、库存和图片保持保留');
    change(next => {
      next.skus.push(...missing.map(specs => ({ key:'new:' + Date.now() + ':' + ++nextSkuKey, specs, price:'', stock:'0', enabled:true, image:'' })));
    });
    Message.success(`已新增 ${missing.length} 个组合，请填写价格、库存和图片`);
  } catch (error) { Message.warning((error as Error).message); }
}
function removeSku(index: number) {
  if (busy.value) return;
  const sku = props.modelValue.skus[index];
  const remove = () => change(next => { next.skus.splice(index, 1); });
  if (sku.id === undefined || sku.id === null) { remove(); return; }
  confirmation = Modal.confirm({ title: '移除已有 SKU？', content: '提交商品后将移除此规格，历史订单快照保留。如只需暂停售卖，可改为停用。', onOk: remove });
}
function setUploading(index: number, value: boolean) {
  if (value) uploadingRows.add(index); else uploadingRows.delete(index);
  emit('uploading', uploadingRows.size > 0);
}
function updateImage(index: number, images: string[]) { change(next => { next.skus[index].image = images[0] || ''; }); }
</script>

<template>
  <div class="buyer-sku-editor">
    <label class="buyer-switch" :for="contextKey + '-sku-enabled'"><span><b>多规格商品</b><small>按规格分别设置售价、库存和图片。</small></span><input :id="contextKey + '-sku-enabled'" type="checkbox" role="switch" :checked="modelValue.enabled" :disabled="busy" @change="change(next => { next.enabled = ($event.target as HTMLInputElement).checked; })" /></label>
    <template v-if="modelValue.enabled">
      <p class="helper">最多 3 个规格组、每组 50 个选项、200 个组合。已有组合的名称和选项保留，新增选择可添加到后面。</p>
      <div v-for="(group, groupIndex) in modelValue.groups" :key="groupIndex" class="sku-group">
        <div class="sku-group-heading"><Label :for="contextKey + '-group-' + groupIndex">规格组 {{ groupIndex + 1 }}</Label><button type="button" class="text-button" :disabled="busy || groupReferenced(groupIndex)" @click="removeGroup(groupIndex)">移除规格组</button></div>
        <Input :id="contextKey + '-group-' + groupIndex" :model-value="group.name" maxlength="32" placeholder="如 颜色、容量" :disabled="busy || groupReferenced(groupIndex)" @update:model-value="change(next => { next.groups[groupIndex].name = String($event); })" />
        <div class="sku-options"><div v-for="(option, optionIndex) in group.options" :key="optionIndex" class="sku-option"><Input :aria-label="`规格组 ${groupIndex + 1} 选项 ${optionIndex + 1}`" :model-value="option" maxlength="64" placeholder="填写选项" :disabled="busy || optionReferenced(groupIndex, optionIndex)" @update:model-value="change(next => { next.groups[groupIndex].options[optionIndex] = String($event); })" /><button type="button" class="text-button" :disabled="busy || optionReferenced(groupIndex, optionIndex)" @click="removeOption(groupIndex, optionIndex)" :aria-label="'移除选项 ' + option">移除</button></div></div>
        <button type="button" class="outline" :disabled="busy || group.options.length >= 50" @click="change(next => { next.groups[groupIndex].options.push(''); })">添加选项</button>
      </div>
      <button type="button" class="outline" :disabled="busy || modelValue.groups.length >= 3" @click="addGroup">添加规格组</button>
      <div v-if="groups.length" class="sku-add"><div v-for="(group, index) in groups" :key="index" class="buyer-field"><Label :for="contextKey + '-pick-' + index">{{ group.name || '规格组 ' + (index + 1) }}</Label><Select :model-value="selection.get(group.name) || group.options[0] || undefined" :disabled="busy || !group.name || group.options.some(option => !option)" @update:model-value="selection.set(group.name, String($event))"><SelectTrigger :id="contextKey + '-pick-' + index"><SelectValue placeholder="选择选项" /></SelectTrigger><SelectContent><SelectItem v-for="option in [...new Set(group.options)].filter(Boolean)" :key="option" :value="option">{{ option }}</SelectItem></SelectContent></Select></div><button type="button" class="outline" :disabled="busy || modelValue.skus.length >= 200" @click="addSku">添加此组合</button></div>
      <div class="sku-generate"><button type="button" class="primary" :disabled="busy || !groups.length" @click="generateSkus">一键生成全部规格组合</button><span class="helper">只补充缺失组合，保留已有价格、库存、图片和启停状态。</span></div>
      <div v-if="modelValue.skus.length" class="sku-table-wrap" role="region" aria-label="商品规格组合编辑表，可横向滚动" tabindex="0">
        <table class="sku-table"><caption class="sr-only">逐行填写规格价格、库存和图片</caption><thead><tr><th v-for="group in groups" :key="group.name" scope="col">{{ group.name }}</th><th scope="col">售价（USDT）<span aria-hidden="true"> *</span></th><th scope="col">库存<span aria-hidden="true"> *</span></th><th scope="col">规格图片</th><th scope="col">启用</th><th scope="col">操作</th></tr></thead>
          <tbody><tr v-for="(sku, index) in modelValue.skus" :key="rowKey(sku, index)">
            <td v-for="group in groups" :key="group.name">{{ sku.specs.find(spec => spec.name === group.name)?.value || '待补充' }}</td>
            <td><Input :id="contextKey + '-sku-price-' + index" :aria-label="`第 ${index + 1} 个规格售价（USDT）`" :model-value="sku.price" inputmode="decimal" autocomplete="off" :disabled="busy" placeholder="最多 8 位小数" @update:model-value="change(next => { next.skus[index].price = String($event); })" /></td>
            <td><Input :id="contextKey + '-sku-stock-' + index" :aria-label="`第 ${index + 1} 个规格库存`" placeholder="库存数量" :model-value="sku.stock" inputmode="numeric" autocomplete="off" :disabled="busy" @update:model-value="change(next => { next.skus[index].stock = String($event); })" /></td>
            <td class="sku-image-cell"><AftersaleEvidenceUploader :key="contextKey + ':' + rowKey(sku, index)" :model-value="imageValues(sku, index)" :max="1" scene="PRODUCT" :disabled="disabled || (uploadingRows.size > 0 && !uploadingRows.has(index))" @update:model-value="updateImage(index, $event)" @uploading="setUploading(index, $event)" @uploaded="emit('uploaded', $event)" /><small class="helper">留空使用商品封面</small></td>
            <td><label class="sku-enabled"><input type="checkbox" :aria-label="`启用第 ${index + 1} 个规格`" :checked="sku.enabled" :disabled="busy" @change="change(next => { next.skus[index].enabled = ($event.target as HTMLInputElement).checked; })" /><span>{{ sku.enabled ? '启用' : '停用' }}</span></label></td>
            <td><button type="button" class="text-button sku-remove" :aria-label="`移除第 ${index + 1} 个规格组合`" :disabled="busy" @click="removeSku(index)">移除</button></td>
          </tr></tbody>
        </table>
      </div>
      <p v-if="!modelValue.skus.length" class="helper">选择规格选项并添加组合后，可分别填写价格和库存。</p>
      <p class="helper">已添加 {{ modelValue.skus.length }} / 200 个组合。停用组合会保留，移除组合会在提交后删除。</p>
    </template>
  </div>
</template>

<style scoped>
.buyer-sku-editor { display:grid; grid-template-columns:minmax(0,1fr); gap:18px; margin-bottom:20px; }
.sku-group { display:grid; gap:14px; padding:18px; border:1px solid var(--line); border-radius:8px; min-width:0; }
.sku-group-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; overflow-wrap:anywhere; }
.sku-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.sku-option { display:flex; gap:8px; align-items:center; min-width:0; }
.sku-option input { min-width:0; }
.text-button { color:var(--muted); font-size:12px; white-space:nowrap; }
.sku-add { display:flex; align-items:end; gap:12px; flex-wrap:wrap; border-top:1px solid var(--line); padding-top:18px; }
.sku-add .buyer-field { flex:1 1 130px; margin:0; min-width:0; }
.sku-add .buyer-field > label { overflow-wrap:anywhere; }
.sku-enabled { display:flex; align-items:center; gap:8px; }
.sku-generate { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.sku-table-wrap { min-width:0; max-width:100%; overflow-x:auto; border:1px solid var(--line); border-radius:8px; }
.sku-table-wrap:focus-visible { outline:2px solid var(--green); outline-offset:3px; }
.sku-table { width:100%; border-collapse:collapse; font-size:13px; }
.sku-table th,.sku-table td { padding:12px; text-align:left; vertical-align:middle; border-bottom:1px solid var(--line); min-width:85px; overflow-wrap:anywhere; }
.sku-table th { background:var(--soft); color:var(--ink); font-weight:600; white-space:nowrap; }
.sku-table tr:last-child td { border-bottom:0; }
.sku-table td:has(input[inputmode=decimal]) { min-width:170px; }
.sku-table td:has(input[inputmode=numeric]) { min-width:130px; }
.sku-image-cell { min-width:145px !important; }
.sku-enabled,.sku-remove { min-height:44px; }
.sku-remove { padding:8px; }
.helper { color:var(--muted); font-size:12px; line-height:1.7; }
.sku-table :deep(.cell),.sku-table :deep(.add) { width:72px; height:72px; }
@media(max-width:700px) { .sku-options { grid-template-columns:minmax(0,1fr); } .sku-group { padding:14px; } }
@media(max-width:700px) {
  .text-button { position:relative; }
  .text-button::after { content:''; position:absolute; top:50%; left:50%; width:max(100%,44px); height:max(100%,44px); transform:translate(-50%,-50%); }
}
</style>
