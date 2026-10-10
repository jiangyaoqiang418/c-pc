<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Message } from '@/lib/feedback';
import { fetchCountries, fetchRegionChildren, prepareAddress } from '@/service/api/address';

interface Props { modelValue?: Partial<Api.RealAddress.AddressRecord>; submitting?: boolean }
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'submit', form: Api.RealAddress.AddressSaveParams): void }>();
const fieldId = useId();
const countrySearch = ref('');
const countries = ref<Api.RealAddress.CountryVO[]>([]);
const provinces = ref<Api.RealAddress.RegionVO[]>([]);
const cities = ref<Api.RealAddress.RegionVO[]>([]);
const districts = ref<Api.RealAddress.RegionVO[]>([]);
const loading = ref(false);
const loadError = ref('');
let loadVersion = 0;
const form = reactive<Api.RealAddress.AddressSaveParams>({ receiverName: '', receiverPhone: '', countryCode: '', provinceCode: '', cityCode: '', districtCode: '', province: '', city: '', district: '', detailAddress: '', defaultFlag: false });
const filteredCountries = computed(() => {
  const keyword = countrySearch.value.trim().toLocaleLowerCase();
  return keyword ? countries.value.filter(item => [item.name, item.enName, item.code].some(value => value?.toLocaleLowerCase().includes(keyword))) : countries.value;
});
const country = computed(() => countries.value.find(item => item.code === form.countryCode));
const hasRegion = computed(() => country.value?.hasRegion === true);
const selectedProvince = computed(() => provinces.value.find(item => item.code === form.provinceCode));
const selectedCity = computed(() => cities.value.find(item => item.code === form.cityCode));
const needCity = computed(() => hasRegion.value && selectedProvince.value?.leaf === false);
const needDistrict = computed(() => needCity.value && selectedCity.value?.leaf === false);
const legacyAddress = computed(() => !!props.modelValue?.id && hasRegion.value && !!props.modelValue?.province && !props.modelValue?.provinceCode);

function clearBelow(level: 'country' | 'province' | 'city') {
  if (level === 'country') { form.provinceCode = ''; provinces.value = []; form.province = ''; }
  if (level !== 'city') { form.cityCode = ''; cities.value = []; form.city = ''; }
  form.districtCode = ''; districts.value = []; form.district = '';
}
const loadChildren = (parentCode?: string) => fetchRegionChildren(form.countryCode, parentCode);
async function onCountryChange(code: string) {
  const version = ++loadVersion; clearBelow('country'); form.countryCode = code;
  if (!countries.value.find(item => item.code === code)?.hasRegion) return;
  loading.value = true;
  try { const list = await loadChildren(); if (version === loadVersion) provinces.value = list; }
  catch { if (version === loadVersion) loadError.value = '行政区划加载失败，请重试'; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function onProvinceChange(code: string) {
  const version = ++loadVersion; clearBelow('province'); form.provinceCode = code;
  const node = provinces.value.find(item => item.code === code); if (!node || node.leaf) return;
  loading.value = true;
  try { const list = await loadChildren(code); if (version === loadVersion) cities.value = list; }
  catch { if (version === loadVersion) loadError.value = '城市加载失败，请重试'; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function onCityChange(code: string) {
  const version = ++loadVersion; clearBelow('city'); form.cityCode = code;
  const node = cities.value.find(item => item.code === code); if (!node || node.leaf) return;
  loading.value = true;
  try { const list = await loadChildren(code); if (version === loadVersion) districts.value = list; }
  catch { if (version === loadVersion) loadError.value = '区县加载失败，请重试'; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function sync() {
  const version = ++loadVersion; loadError.value = ''; loading.value = true;
  const value = props.modelValue || {};
  Object.assign(form, { id: value.id, receiverName: value.receiverName || '', receiverPhone: value.receiverPhone || '', countryCode: value.countryCode || '', provinceCode: value.provinceCode || '', cityCode: value.cityCode || '', districtCode: value.districtCode || '', province: value.province || '', city: value.city || '', district: value.district || '', detailAddress: value.detail || '', postalCode: value.postalCode || '', idCardNo: value.idCardNo || '', defaultFlag: !!value.isDefault, tag: value.tag || '' });
  try {
    const next = await fetchCountries(); if (version !== loadVersion) return; countries.value = next;
    if (!form.countryCode) form.countryCode = next.find(item => item.code === 'CN')?.code || next[0]?.code || '';
    if (!country.value?.hasRegion) return;
    provinces.value = await loadChildren(); if (version !== loadVersion || !form.provinceCode) return;
    const province = provinces.value.find(item => item.code === form.provinceCode); if (!province || province.leaf) return;
    cities.value = await loadChildren(form.provinceCode); if (version !== loadVersion || !form.cityCode) return;
    const city = cities.value.find(item => item.code === form.cityCode); if (!city || city.leaf) return;
    districts.value = await loadChildren(form.cityCode);
  } catch { if (version === loadVersion) loadError.value = '国家/地区字典加载失败，请重试'; }
  finally { if (version === loadVersion) loading.value = false; }
}
watch(() => props.modelValue, sync, { immediate: true });
onBeforeUnmount(() => { loadVersion += 1; });
const prepared = computed(() => prepareAddress({ ...form }));
const regionComplete = computed(() => !hasRegion.value || (!!form.provinceCode && (!needCity.value || !!form.cityCode) && (!needDistrict.value || !!form.districtCode)));
const overseasComplete = computed(() => hasRegion.value || (!!form.province?.trim() && !!form.city?.trim()));
const canSubmit = computed(() => !loading.value && !loadError.value && !prepared.value.error && regionComplete.value && overseasComplete.value);
function submit() {
  if (props.submitting || !canSubmit.value) { Message.warning(loadError.value || prepared.value.error || '请完整选择地址地区'); return; }
  const params = { ...prepared.value.params };
  if (hasRegion.value) { delete params.province; delete params.city; delete params.district; }
  else { delete params.provinceCode; delete params.cityCode; delete params.districtCode; }
  emit('submit', params);
}
</script>

<template>
  <form class="address-form" novalidate :aria-busy="loading || submitting" @submit.prevent="submit" @keydown.enter="event => event.isComposing && event.preventDefault()">
    <Alert v-if="loadError" variant="destructive" class="notice"><AlertDescription>{{ loadError }}</AlertDescription><Button type="button" variant="outline" size="sm" :disabled="loading || submitting" @click="sync">重新加载</Button></Alert>
    <Alert v-if="legacyAddress" class="notice"><AlertDescription>历史地址缺少区划编码，请重新选择省市区后保存。</AlertDescription></Alert>
    <div v-if="loading" class="loading-note" role="status"><Icon icon="lucide:loader-circle" class="animate-spin" width="16" />正在读取国家与地区信息</div>
    <fieldset :disabled="submitting" class="form-fields">
      <legend class="sr-only">收货地址信息</legend>
      <div class="two-fields">
        <div class="field"><Label :for="`${fieldId}-receiver`">收货人 <span>*</span></Label><Input :id="`${fieldId}-receiver`" v-model="form.receiverName" autocomplete="name" required placeholder="请输入收货人姓名" /></div>
        <div class="field"><Label :for="`${fieldId}-phone`">联系电话 <span>*</span></Label><Input :id="`${fieldId}-phone`" v-model="form.receiverPhone" autocomplete="tel" type="tel" maxlength="32" required placeholder="请输入联系电话" /></div>
      </div>
      <div class="field">
        <Label :for="`${fieldId}-country`">国家/地区 <span>*</span></Label>
        <Input v-model="countrySearch" class="country-search" aria-label="搜索国家或地区" placeholder="输入名称或代码筛选国家/地区" :disabled="loading || submitting" />
        <Select :model-value="form.countryCode" :disabled="loading || submitting" @update:model-value="value => onCountryChange(String(value))">
          <SelectTrigger :id="`${fieldId}-country`"><SelectValue placeholder="请选择国家/地区"><template v-if="country">{{ country.name }}{{ country.enName ? ` / ${country.enName}` : '' }}</template></SelectValue></SelectTrigger>
          <SelectContent><SelectItem v-for="item in filteredCountries" :key="item.code" :value="item.code">{{ item.name }}{{ item.enName ? ` / ${item.enName}` : '' }}</SelectItem><p v-if="!filteredCountries.length" class="empty-options">没有匹配的国家/地区</p></SelectContent>
        </Select>
      </div>
      <div v-if="hasRegion" class="region-fields">
        <div class="field"><Label :for="`${fieldId}-province`">省/州 <span>*</span></Label><Select :model-value="form.provinceCode" :disabled="loading || submitting" @update:model-value="value => onProvinceChange(String(value))"><SelectTrigger :id="`${fieldId}-province`"><SelectValue placeholder="请选择省/州" /></SelectTrigger><SelectContent><SelectItem v-for="item in provinces" :key="item.code" :value="item.code">{{ item.name }}</SelectItem></SelectContent></Select></div>
        <div v-if="needCity" class="field"><Label :for="`${fieldId}-city`">城市 <span>*</span></Label><Select :model-value="form.cityCode" :disabled="loading || submitting" @update:model-value="value => onCityChange(String(value))"><SelectTrigger :id="`${fieldId}-city`"><SelectValue placeholder="请选择城市" /></SelectTrigger><SelectContent><SelectItem v-for="item in cities" :key="item.code" :value="item.code">{{ item.name }}</SelectItem></SelectContent></Select></div>
        <div v-if="needDistrict" class="field"><Label :for="`${fieldId}-district`">区/县 <span>*</span></Label><Select v-model="form.districtCode" :disabled="loading || submitting"><SelectTrigger :id="`${fieldId}-district`"><SelectValue placeholder="请选择区/县" /></SelectTrigger><SelectContent><SelectItem v-for="item in districts" :key="item.code" :value="item.code">{{ item.name }}</SelectItem></SelectContent></Select></div>
      </div>
      <div v-else class="two-fields"><div class="field"><Label :for="`${fieldId}-province-text`">省/州 <span>*</span></Label><Input :id="`${fieldId}-province-text`" v-model="form.province" autocomplete="address-level1" placeholder="请输入省/州" required /></div><div class="field"><Label :for="`${fieldId}-city-text`">城市 <span>*</span></Label><Input :id="`${fieldId}-city-text`" v-model="form.city" autocomplete="address-level2" placeholder="请输入城市" required /></div></div>
      <div class="field"><Label :for="`${fieldId}-detail`">详细地址 <span>*</span></Label><Textarea :id="`${fieldId}-detail`" v-model="form.detailAddress" :rows="3" autocomplete="street-address" required placeholder="街道、门牌号、楼栋等" /></div>
      <div class="two-fields"><div class="field"><Label :for="`${fieldId}-postal`">邮编</Label><Input :id="`${fieldId}-postal`" v-model="form.postalCode" autocomplete="postal-code" placeholder="选填，请输入邮编" /></div><div class="field"><Label :for="`${fieldId}-identity`">清关证件号</Label><Input :id="`${fieldId}-identity`" v-model="form.idCardNo" placeholder="选填，请输入清关证件号" /></div></div>
      <label class="default-field"><Checkbox :model-value="!!form.defaultFlag" aria-label="设为默认地址" :disabled="submitting" @update:model-value="value => form.defaultFlag = value === true" />设为默认地址</label>
    </fieldset>
    <div class="actions"><Button type="submit" :disabled="!canSubmit || submitting"><Icon v-if="submitting" icon="lucide:loader-circle" class="animate-spin" width="16" />{{ submitting ? '正在保存' : '保存地址' }}</Button></div>
  </form>
</template>

<style scoped>
.form-fields { display: grid; gap: 18px; padding: 0; margin: 0; border: 0; }
.two-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.region-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.field { display: grid; align-content: start; gap: 8px; min-width: 0; }
.field label { font-size: 14px; font-weight: 500; }
.field label span { color: var(--yb-danger); }
.country-search { font-size: 13px; }
.default-field { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
.actions { display: flex; justify-content: flex-end; margin-top: 24px; }
.notice { margin-bottom: 16px; }
.notice button { margin-top: 10px; }
.loading-note { display: flex; align-items: center; gap: 8px; color: var(--yb-muted); font-size: 13px; margin-bottom: 16px; }
.empty-options { padding: 12px; margin: 0; color: var(--yb-muted); font-size: 13px; }
@media (max-width: 500px) { .two-fields, .region-fields { grid-template-columns: 1fr; } }
</style>
