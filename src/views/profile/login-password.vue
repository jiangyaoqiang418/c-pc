<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useRoute, useRouter } from 'vue-router';
import { setLoginPassword } from '@/service/api/auth';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const form = reactive({ email: '', password: '', confirmPassword: '' });
const loading = ref(true);
const submitting = ref(false);
const saved = ref(false);
const loadError = ref('');
const formError = ref('');
const emailError = ref('');
let operationVersion = 0;

const needsEmail = computed(() => userStore.currentUser?.email === null);
const currentEmail = computed(() => userStore.currentUser?.email);
const redirect = computed(() => {
  const target = route.query.redirect;
  return typeof target === 'string' && /^\/(?!\/)/.test(target) && !target.startsWith('/auth/')
    && target !== route.path ? target : '/profile';
});
const canSubmit = computed(() => userStore.currentUser?.loginPasswordSet === false && !saved.value
  && form.password.length >= 6 && form.password.length <= 64
  && form.password === form.confirmPassword
  && (!needsEmail.value || /^[^\s@]+@[^\s@]+$/.test(form.email.trim())));

onMounted(() => void loadState());
onBeforeUnmount(() => { operationVersion += 1; });

async function loadState(afterSave = false) {
  const operation = ++operationVersion;
  loading.value = true;
  loadError.value = '';
  try {
    await userStore.refreshCurrentUser({ deferAccount: true });
    if (operation !== operationVersion) return;
    if (userStore.currentUser?.loginPasswordSet === true) {
      if (afterSave) Message.success('登录密码设置成功');
      else Message.info('当前账号已设置登录密码');
      await router.replace(redirect.value);
    } else if (userStore.currentUser?.loginPasswordSet !== false) {
      loadError.value = '未取得登录密码状态，请重新读取。';
    }
  } catch {
    if (operation === operationVersion) {
      loadError.value = afterSave
        ? '密码已保存，但最新账号状态读取失败，请重新读取。'
        : '账号状态读取失败，请稍后重试。';
    }
  } finally {
    if (operation === operationVersion) loading.value = false;
  }
}

function validate() {
  formError.value = '';
  emailError.value = '';
  if (needsEmail.value && !form.email.trim()) emailError.value = '请输入作为登录账号的邮箱';
  else if (needsEmail.value && !/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) emailError.value = '请输入正确的邮箱地址';
  if (!form.password) formError.value = '请输入登录密码';
  else if (form.password.length < 6 || form.password.length > 64) formError.value = '密码长度应为 6–64 位';
  else if (form.password !== form.confirmPassword) formError.value = '两次输入的密码不一致';
  return !formError.value && !emailError.value;
}

async function submit() {
  if (submitting.value || saved.value || !validate()) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined || userStore.currentUser?.loginPasswordSet !== false) return;
  const operation = ++operationVersion;
  submitting.value = true;
  formError.value = '';
  emailError.value = '';
  try {
    await setLoginPassword({
      password: form.password,
      confirmPassword: form.confirmPassword,
      ...(needsEmail.value ? { email: form.email.trim() } : {})
    });
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    saved.value = true;
    form.password = '';
    form.confirmPassword = '';
    await loadState(true);
  } catch (error) {
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    const message = error instanceof Error ? error.message : '设置失败，请稍后重试';
    if (error instanceof RequestError && message.includes('已设置过登录密码')) {
      saved.value = true;
      Message.warning(message);
      await loadState();
    } else if (message.includes('邮箱')) {
      emailError.value = message;
    } else {
      formError.value = message;
    }
  } finally {
    if (operation === operationVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="shop-container security-page">
    <a-card title="设置登录密码" class="card">
      <a-spin :loading="loading" class="content">
        <a-alert v-if="loadError" :type="saved ? 'warning' : 'error'" :closable="false" class="alert">
          {{ loadError }}
          <template #action><a-button size="mini" @click="loadState(saved)">重新读取</a-button></template>
        </a-alert>
        <template v-if="!loading && !loadError && userStore.needsLoginPassword">
          <p class="description">设置后可使用邮箱和该密码登录，当前第三方登录方式仍可继续使用。</p>
          <a-form :model="form" layout="vertical" @submit-success="submit">
            <a-form-item
              v-if="needsEmail"
              label="登录邮箱"
              required
              :validate-status="emailError ? 'error' : undefined"
              :help="emailError || '该邮箱将作为你的登录账号，本期不校验邮箱验证码。'"
            >
              <a-input v-model="form.email" autocomplete="email" placeholder="请输入邮箱" size="large" />
            </a-form-item>
            <a-form-item v-else label="登录邮箱">
              <a-input :model-value="currentEmail || ''" readonly size="large" />
            </a-form-item>
            <a-form-item label="登录密码" required :validate-status="formError ? 'error' : undefined" :help="formError || '长度 6–64 位，不限字符类型。'">
              <a-input-password v-model="form.password" autocomplete="new-password" placeholder="请输入登录密码" size="large" />
            </a-form-item>
            <a-form-item label="确认登录密码" required>
              <a-input-password v-model="form.confirmPassword" autocomplete="new-password" placeholder="请再次输入" size="large" />
            </a-form-item>
            <div class="actions">
              <a-button @click="router.push('/profile')">取消</a-button>
              <a-button type="primary" html-type="submit" :disabled="!canSubmit" :loading="submitting">保存</a-button>
            </div>
          </a-form>
        </template>
      </a-spin>
    </a-card>
  </div>
</template>

<style scoped>
.security-page { padding-top: 24px; }
.card { max-width: 560px; margin: auto; }
.content { display: block; min-height: 240px; }
.description { margin: 0 0 20px; color: #4e5969; line-height: 1.7; }
.alert { margin-bottom: 16px; }
.actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
