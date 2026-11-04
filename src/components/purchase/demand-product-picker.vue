<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue';
import { useUserStore } from '@/stores';
import { fetchMyProducts, fetchSellerProductDetail } from '@/service/api/product';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { setImageFallback } from '@/utils/image-placeholder';

type Selection = { productId?: string; skuId?: string };
const user = useUserStore();
const open = ref(false);
const link = ref(false);
const keyword = ref('');
const page = ref(1);
const total = ref(0);
const rows = ref<Api.RealProduct.Record[]>([]);
const selected = ref<Api.RealProduct.Record>();
const skuId = ref('');
const skuOptions = computed(() => (selected.value?.skus || []).filter(s => s.enabled).map(s => ({ id:String(s.id), label:s.specs.map(v => `${v.name}：${v.value}`).join(' / ') })));
const loading = ref(false);
const error = ref('');
let resolve: ((value: Selection | undefined) => void) | undefined;
let version = 0;
let abort: AbortController | undefined;
function choose(): Promise<Selection | undefined> {
  resolve?.(undefined); link.value = false; selected.value = undefined; skuId.value = ''; error.value = ''; keyword.value = ''; page.value = 1; open.value = true;
  return new Promise(done => { resolve = done; });
}
function finish(value?: Selection) { const done = resolve; resolve = undefined; open.value = false; done?.(value); }
async function load() {
  abort?.abort(); abort = new AbortController(); const current = ++version;
  loading.value = true; error.value = ''; rows.value = [];
  try { const result = await fetchMyProducts({ current:page.value, size:10, keyword:keyword.value, shelf:'on-shelf', signal:abort.signal }); if (current === version) { rows.value = result.records; total.value = result.total; } }
  catch { if (current === version) error.value = '商品读取失败，请重试'; }
  finally { if (current === version) loading.value = false; }
}
async function select(product: Api.RealProduct.Record) {
  abort?.abort(); abort = new AbortController(); const current = ++version;
  loading.value = true; error.value = ''; selected.value = undefined; skuId.value = '';
  try { const detail = await fetchSellerProductDetail(product.id, { signal:abort.signal }); if (current === version) selected.value = detail; }
  catch { if (current === version) error.value = '商品规格读取失败，请重试'; }
  finally { if (current === version) loading.value = false; }
}
function confirm() {
  if (!link.value) { finish({}); return; }
  if (!selected.value || loading.value || (selected.value.hasSku && !skuId.value)) return;
  finish({ productId:String(selected.value.id), skuId:skuId.value || undefined });
}
watch(link, () => { if (link.value) void load(); else { version++; abort?.abort(); loading.value = false; } });
watch(open, value => { if (!value) { version++; abort?.abort(); resolve?.(undefined); resolve = undefined; } });
watch(() => user.sessionVersion, () => finish());
onBeforeUnmount(() => { version++; abort?.abort(); resolve?.(undefined); });
defineExpose({ choose });
</script>

<template>
  <Dialog v-model:open="open">
<DialogContent class="max-w-xl">
<DialogHeader>
<DialogTitle>确认求购接单</DialogTitle>
<DialogDescription>按求购预算成交。可关联您在售的商品和规格，方便顾客查看商品和发表评价。</DialogDescription>
</DialogHeader>
<label class="link-option">
<input v-model="link" type="checkbox" />关联我的商城商品（选填）</label>
<div v-if="link" class="picker">
<form @submit.prevent="page = 1; load()">
<input v-model="keyword" placeholder="搜索我的在售商品" maxlength="100" />
<button type="submit" :disabled="loading">搜索</button>
</form>
<p v-if="error" role="alert">{{ error }}</p>
<p v-if="loading" role="status">正在读取商品…</p>
<template v-else>
<p v-if="!rows.length">暂无匹配的在售商品，可取消关联后接单。</p>
<button v-for="product in rows" :key="product.id" type="button" class="product-row" :aria-pressed="String(selected?.id) === String(product.id)" @click="select(product)">
<img v-if="product.images[0]?.url" :src="product.images[0].url" alt="商品图片" @error="setImageFallback" />
<span>{{ product.title }}</span>
<span v-if="String(selected?.id) === String(product.id)">已选择</span>
</button>
</template>
<div class="pages">
<button type="button" :disabled="loading || page === 1" @click="page--; load()">上一页</button>
<span>{{ page }}</span>
<button type="button" :disabled="loading || page * 10 >= total" @click="page++; load()">下一页</button>
</div>
<label v-if="selected?.hasSku">商品规格<select v-model="skuId">
<option value="" disabled>请选择规格</option>
<option v-for="option in skuOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
</select>
</label>
<p v-if="selected">已选：{{ selected.title }}</p>
</div>
<p class="muted">关联用于成交资料和评价归属，仍由您按求购约定采购交付，不占用商城库存。</p>
<div class="pages">
<button type="button" @click="finish()">取消</button>
<button type="button" class="primary" :disabled="link && (loading || !selected || (selected.hasSku && !skuId))" @click="confirm">确认接单</button>
</div>
</DialogContent>
</Dialog>
</template>

<style scoped>
.picker{max-height:50vh;overflow:auto;display:grid;gap:12px}.picker form,.pages{display:flex;gap:12px;align-items:center;justify-content:space-between}.picker input,.picker select{padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--text);min-width:0}.picker form input{flex:1}.picker select{display:block;width:100%;margin-top:8px}.product-row{display:flex;align-items:center;gap:12px;padding:10px;text-align:left;border:1px solid var(--line);border-radius:8px}.product-row[aria-pressed=true]{border-color:var(--green)}.product-row img{width:48px;height:48px;object-fit:contain}.product-row span:first-of-type{flex:1}.muted{font-size:12px;color:var(--muted)}.link-option{display:flex;gap:8px;align-items:center}
</style>
