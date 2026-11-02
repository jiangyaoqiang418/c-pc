<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { ComboboxAnchor, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport } from 'reka-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchCarriers } from '@/service/api/order';
import { detectCarriers } from '@/service/api/logistics';
import { createLatestRequestGuard } from '@/utils/latest-request';

const props = withDefaults(defineProps<{
  trackingNo: string;
  carrierCode: string;
  carrierName: string;
  contextKey: string;
  disabled?: boolean;
  active?: boolean;
}>(), { disabled: false, active: true });
const emit = defineEmits<{
  'update:trackingNo': [value: string];
  'update:carrierCode': [value: string];
  'update:carrierName': [value: string];
  valid: [value: boolean];
}>();
const carriers = ref<Api.RealOrder.CarrierDTO[]>([]);
const candidates = ref<Api.RealOrder.CarrierDTO[]>([]);
const loading = ref(false);
const error = ref('');
const detecting = ref(false);
const detectionHint = ref('填写运单号后自动识别，也可以手动搜索物流公司。');
const carrierOpen = ref(false);
const catalogGuard = createLatestRequestGuard(() => props.contextKey);
const detectGuard = createLatestRequestGuard(() => `${props.contextKey}:${props.trackingNo.trim()}`);
const selected = computed(() => carriers.value.find(row => row.code === props.carrierCode));
const fieldDisabled = computed(() => props.disabled || !props.active || loading.value || !!error.value);
const valid = computed(() => props.active && !loading.value && !error.value && !detecting.value && !!selected.value
  && props.trackingNo.trim().length >= 6 && (!selected.value.customNameRequired || !!props.carrierName.trim()));
let timer: ReturnType<typeof setTimeout> | undefined;

function cancelDetection() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  detectGuard.invalidate();
  detecting.value = false;
}
function displayCarrier(value: unknown) { return carriers.value.find(row => row.code === value)?.name || ''; }
function chooseCarrier(value: unknown) {
  if (fieldDisabled.value || typeof value !== 'string' || !carriers.value.some(row => row.code === value)) return;
  cancelDetection();
  if (props.carrierCode !== value) emit('update:carrierName', '');
  emit('update:carrierCode', value);
  candidates.value = [];
  carrierOpen.value = false;
  detectionHint.value = '已选择物流公司，请核对后提交。';
}
function scheduleDetection() {
  cancelDetection();
  candidates.value = [];
  const trackingNo = props.trackingNo.trim();
  if (!props.active || props.disabled || loading.value || error.value || trackingNo.length < 6) {
    detectionHint.value = '填写运单号后自动识别，也可以手动搜索物流公司。';
    return;
  }
  detecting.value = true;
  detectionHint.value = '正在识别物流公司…';
  const isCurrent = detectGuard.begin();
  timer = setTimeout(async () => {
    timer = undefined;
    try {
      const result = await detectCarriers(trackingNo, { signal: isCurrent.signal });
      if (!isCurrent() || !props.active || props.disabled) return;
      const codes = new Set(result.map(row => row.code));
      const matches = carriers.value.filter(row => codes.has(row.code));
      if (matches.length === 1) {
        if (props.carrierCode !== matches[0].code) emit('update:carrierName', '');
        emit('update:carrierCode', matches[0].code);
        detectionHint.value = `已识别为${matches[0].name}，仍可手动更换。`;
      } else if (matches.length > 1) {
        emit('update:carrierCode', '');
        emit('update:carrierName', '');
        candidates.value = matches;
        detectionHint.value = '识别到多家物流公司，请确认其中一家，或在下方手动搜索。';
      } else detectionHint.value = '未识别到物流公司，请手动搜索并选择，运单号已保留。';
    } catch {
      if (isCurrent()) detectionHint.value = '暂时无法自动识别，请手动搜索并选择，运单号已保留。';
    } finally { if (isCurrent()) detecting.value = false; }
  }, 400);
}
async function loadCarriers() {
  cancelDetection();
  const isCurrent = catalogGuard.begin();
  loading.value = true;
  error.value = '';
  try {
    const rows = await fetchCarriers({ signal: isCurrent.signal });
    if (!isCurrent() || !props.active) return;
    carriers.value = rows;
    if (!rows.length) error.value = '暂无启用的物流公司，暂不可提交运单。';
  } catch {
    if (isCurrent()) { carriers.value = []; error.value = '物流公司列表加载失败，请重试。'; }
  } finally {
    if (isCurrent()) { loading.value = false; scheduleDetection(); }
  }
}
watch([() => props.active, () => props.contextKey], ([active]) => {
  catalogGuard.invalidate();
  cancelDetection();
  carrierOpen.value = false;
  loading.value = false;
  carriers.value = [];
  candidates.value = [];
  error.value = '';
  if (active) void loadCarriers();
}, { immediate: true });
watch(() => props.trackingNo, () => {
  // 新运单不能沿用旧运单的自动识别结果；识别失败后仍可手选。
  emit('update:carrierCode', '');
  emit('update:carrierName', '');
  scheduleDetection();
});
watch(() => props.disabled, disabled => { if (disabled) { carrierOpen.value = false; cancelDetection(); } });
watch(valid, value => emit('valid', value), { immediate: true });
onBeforeUnmount(() => { catalogGuard.invalidate(); cancelDetection(); emit('valid', false); });
</script>

<template>
  <div class="logistics-fields">
    <div class="logistics-field"><Label :for="contextKey + '-tracking'">运单号 <span>*</span></Label><Input :id="contextKey + '-tracking'" :model-value="trackingNo" :disabled="disabled || !active" :aria-describedby="contextKey + '-detect-hint'" placeholder="请输入运单号" autocomplete="off" @update:model-value="emit('update:trackingNo', String($event))" /></div>
    <p :id="contextKey + '-detect-hint'" class="carrier-hint" role="status"><Icon v-if="detecting" icon="lucide:loader-circle" width="15" class="animate-spin" aria-hidden="true" />{{ detectionHint }}</p>
    <div v-if="candidates.length" class="carrier-candidates" role="group" aria-label="确认识别到的物流公司"><button v-for="carrier in candidates" :key="carrier.code" class="outline" type="button" :disabled="fieldDisabled" @click="chooseCarrier(carrier.code)">{{ carrier.name }}</button></div>
    <div v-if="error" class="carrier-error" role="alert"><span>{{ error }}</span><button class="text-link" type="button" :disabled="disabled || loading" @click="loadCarriers">重新加载</button></div>
    <div class="logistics-field"><Label :for="contextKey + '-carrier'">物流公司 <span>*</span></Label><p v-if="loading" class="carrier-hint" role="status">正在加载物流公司…</p>
      <ComboboxRoot v-model:open="carrierOpen" :model-value="carrierCode" :disabled="fieldDisabled" open-on-focus open-on-click @update:model-value="chooseCarrier">
        <ComboboxAnchor class="carrier-control"><ComboboxInput :id="contextKey + '-carrier'" class="carrier-input" :display-value="displayCarrier" placeholder="搜索并选择物流公司" autocomplete="off" @focus="($event.target as HTMLInputElement).select()" /><ComboboxTrigger type="button" class="carrier-trigger" aria-label="展开或收起物流公司列表"><Icon icon="lucide:chevron-down" width="18" aria-hidden="true" /></ComboboxTrigger></ComboboxAnchor>
        <ComboboxPortal><ComboboxContent position="popper" align="start" :side-offset="6" :collision-padding="16" class="carrier-menu"><ComboboxViewport class="carrier-viewport"><ComboboxEmpty class="carrier-empty">没有匹配的物流公司，请更换关键词。</ComboboxEmpty><ComboboxItem v-for="carrier in carriers" :key="carrier.code" :value="carrier.code" :text-value="carrier.name + ' ' + carrier.code" class="carrier-option"><span>{{ carrier.name }}</span><span class="carrier-code">{{ carrier.code }}</span><ComboboxItemIndicator><Icon icon="lucide:check" width="16" aria-hidden="true" /></ComboboxItemIndicator></ComboboxItem></ComboboxViewport></ComboboxContent></ComboboxPortal>
      </ComboboxRoot>
    </div>
    <div v-if="selected?.customNameRequired" class="logistics-field"><Label :for="contextKey + '-carrier-name'">承运商名称 <span>*</span></Label><Input :id="contextKey + '-carrier-name'" :model-value="carrierName" :disabled="disabled || !active" placeholder="请输入承运商名称" @update:model-value="emit('update:carrierName', String($event))" /></div>
  </div>
</template>

<style scoped>
.logistics-fields { display:grid; gap:12px; margin-bottom:20px; min-width:0; }
.logistics-field { display:grid; gap:10px; min-width:0; }
.carrier-hint { display:flex; align-items:center; gap:6px; margin:0; color:var(--muted); font-size:12px; line-height:1.7; }
.carrier-candidates,.carrier-error { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.carrier-error { color:var(--red); font-size:13px; }
.carrier-candidates button { min-height:44px; padding:8px 12px; }
.carrier-control { display:flex; align-items:center; min-width:0; border:1px solid var(--line); border-radius:7px; background:var(--paper); }
.carrier-control:focus-within { outline:2px solid var(--green); outline-offset:2px; }
.carrier-input { flex:1; min-width:0; width:100%; height:44px; padding:0 12px; border:0; background:transparent; color:var(--ink); outline:none; font:inherit; }
.carrier-input::placeholder { color:var(--muted); }
.carrier-input:disabled { opacity:.55; }
.carrier-trigger { display:grid; place-items:center; flex:none; width:44px; height:44px; border:0; border-radius:6px; background:transparent; color:var(--muted); cursor:pointer; }
.carrier-trigger:focus-visible { outline:2px solid var(--green); outline-offset:-3px; }
.carrier-trigger[data-state=open] > svg { transform:rotate(180deg); }
.carrier-menu { z-index:1100; width:var(--reka-combobox-trigger-width); max-width:calc(100vw - 32px); overflow:hidden; border:1px solid var(--line); border-radius:7px; background:var(--paper); color:var(--ink); box-shadow:var(--shadow); }
.carrier-viewport { max-height:min(280px,var(--reka-combobox-content-available-height,280px)); overflow-y:auto; overscroll-behavior:contain; padding:4px; }
.carrier-option { display:flex; align-items:center; gap:10px; min-height:44px; padding:10px 12px; border-radius:4px; cursor:pointer; }
.carrier-option[data-highlighted] { background:var(--soft); outline:2px solid var(--green); outline-offset:-2px; }
.carrier-option[data-state=checked] { color:var(--green); }
.carrier-code { margin-left:auto; color:var(--muted); font-size:12px; }
.carrier-empty { padding:16px 12px; color:var(--muted); font-size:13px; }
</style>
