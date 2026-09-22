<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { fetchCountries, fetchRegionChildren, prepareAddress } from '@/service/api/address';

interface Props { modelValue?: Partial<Api.RealAddress.AddressRecord>; submitting?: boolean }
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'submit', form: Api.RealAddress.AddressSaveParams): void }>();
const countries = ref<Api.RealAddress.CountryVO[]>([]);
const provinces = ref<Api.RealAddress.RegionVO[]>([]);
const cities = ref<Api.RealAddress.RegionVO[]>([]);
const districts = ref<Api.RealAddress.RegionVO[]>([]);
const loading = ref(false);
const loadError = ref('');
let loadVersion = 0;
const form = reactive<Api.RealAddress.AddressSaveParams>({ receiverName: '', receiverPhone: '', countryCode: '', provinceCode: '', cityCode: '', districtCode: '', province: '', city: '', district: '', detailAddress: '', defaultFlag: false });
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
  <a-spin :loading="loading" style="width:100%">
    <a-alert v-if="loadError" type="error">{{ loadError }} <a-link @click="sync">重新加载</a-link></a-alert>
    <a-alert v-if="legacyAddress" type="warning" class="notice">历史地址缺少区划编码，请重新选择省市区后保存。</a-alert>
    <a-form :model="form" layout="vertical">
      <a-row :gutter="12"><a-col :span="12"><a-form-item label="收货人" required><a-input v-model="form.receiverName" placeholder="请输入收货人姓名" /></a-form-item></a-col><a-col :span="12"><a-form-item label="联系电话" required><a-input v-model="form.receiverPhone" :max-length="32" placeholder="请输入联系电话" /></a-form-item></a-col></a-row>
      <a-form-item label="国家/地区" required><a-select :model-value="form.countryCode" allow-search placeholder="请选择国家/地区" @change="value => onCountryChange(String(value))"><a-option v-for="item in countries" :key="item.code" :value="item.code">{{ item.name }}{{ item.enName ? ` / ${item.enName}` : '' }}</a-option></a-select></a-form-item>
      <a-row v-if="hasRegion" :gutter="12"><a-col :span="8"><a-form-item label="省/州" required><a-select :model-value="form.provinceCode" placeholder="请选择省/州" @change="value => onProvinceChange(String(value))"><a-option v-for="item in provinces" :key="item.code" :value="item.code">{{ item.name }}</a-option></a-select></a-form-item></a-col><a-col v-if="needCity" :span="8"><a-form-item label="城市" required><a-select :model-value="form.cityCode" placeholder="请选择城市" @change="value => onCityChange(String(value))"><a-option v-for="item in cities" :key="item.code" :value="item.code">{{ item.name }}</a-option></a-select></a-form-item></a-col><a-col v-if="needDistrict" :span="8"><a-form-item label="区/县" required><a-select v-model="form.districtCode" placeholder="请选择区/县"><a-option v-for="item in districts" :key="item.code" :value="item.code">{{ item.name }}</a-option></a-select></a-form-item></a-col></a-row>
      <a-row v-else :gutter="12"><a-col :span="12"><a-form-item label="省/州" required><a-input v-model="form.province" placeholder="请输入省/州" /></a-form-item></a-col><a-col :span="12"><a-form-item label="城市" required><a-input v-model="form.city" placeholder="请输入城市" /></a-form-item></a-col></a-row>
      <a-form-item label="详细地址" required><a-textarea v-model="form.detailAddress" :rows="2" placeholder="街道、门牌号、楼栋等" /></a-form-item>
      <a-row :gutter="12"><a-col :span="12"><a-form-item label="邮编"><a-input v-model="form.postalCode" placeholder="选填，请输入邮编" /></a-form-item></a-col><a-col :span="12"><a-form-item label="清关证件号"><a-input v-model="form.idCardNo" placeholder="选填，请输入清关证件号" /></a-form-item></a-col></a-row>
      <a-form-item><a-checkbox v-model="form.defaultFlag">设为默认地址</a-checkbox></a-form-item>
      <div class="actions"><a-button type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">保存</a-button></div>
    </a-form>
  </a-spin>
</template>

<style scoped>.actions{display:flex;justify-content:flex-end}.notice{margin:12px 0}</style>
