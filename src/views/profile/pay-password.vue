<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchPayPasswordStatus, resetPayPassword, setPayPassword, updatePayPassword, type PayPasswordStatus } from '@/service/api/pay-password';

const route = useRoute(); const router = useRouter();
const status = ref<PayPasswordStatus>(); const mode = ref<'set' | 'update' | 'reset'>('set'); const loading = ref(false);
const form = reactive({ loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
const valid = computed(() => /^\d{6}$/.test(form.payPassword) && form.payPassword === form.confirmPayPassword
  && (mode.value === 'update' ? /^\d{6}$/.test(form.oldPayPassword) : !!form.loginPassword));
async function load() { status.value = await fetchPayPasswordStatus(); mode.value = status.value.hasSet ? 'update' : 'set'; }
onMounted(() => void load());
async function submit() {
  if (!valid.value || loading.value) return; loading.value = true;
  try {
    if (mode.value === 'set') await setPayPassword({ loginPassword: form.loginPassword, payPassword: form.payPassword, confirmPayPassword: form.confirmPayPassword });
    else if (mode.value === 'reset') await resetPayPassword({ loginPassword: form.loginPassword, payPassword: form.payPassword, confirmPayPassword: form.confirmPayPassword });
    else await updatePayPassword({ oldPayPassword: form.oldPayPassword, payPassword: form.payPassword, confirmPayPassword: form.confirmPayPassword });
    Object.assign(form, { loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
    Message.success(mode.value === 'set' ? '支付密码设置成功' : mode.value === 'reset' ? '支付密码重置成功' : '支付密码修改成功');
    await load();
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '';
    if (redirect) await router.replace(redirect);
  } finally { loading.value = false; }
}
</script>

<template><div class="shop-container security-page"><a-card title="支付密码" class="card">
  <a-alert v-if="status?.locked" type="warning">支付密码已锁定，可使用平台登录密码重置。</a-alert>
  <a-radio-group v-if="status?.hasSet" v-model="mode" type="button" class="modes"><a-radio value="update">修改密码</a-radio><a-radio value="reset">忘记密码</a-radio></a-radio-group>
  <a-form :model="form" layout="vertical">
    <a-form-item v-if="mode !== 'update'" label="平台登录密码" required><a-input-password v-model="form.loginPassword" autocomplete="current-password" /></a-form-item>
    <a-form-item v-else label="原支付密码" required><a-input-password v-model="form.oldPayPassword" :max-length="6" /></a-form-item>
    <a-form-item label="新支付密码" required><a-input-password v-model="form.payPassword" :max-length="6" placeholder="6位数字，支持0开头" /></a-form-item>
    <a-form-item label="确认支付密码" required><a-input-password v-model="form.confirmPayPassword" :max-length="6" /></a-form-item>
    <a-button type="primary" :disabled="!valid" :loading="loading" @click="submit">保存</a-button>
  </a-form>
</a-card></div></template>
<style scoped>.security-page{padding-top:24px}.card{max-width:560px;margin:auto}.modes{margin:16px 0}</style>
