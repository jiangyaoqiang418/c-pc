<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { useUserStore } from '@/stores';
import { prepareRegistration } from '@/service/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordInput from '@/components/common/password-input.vue';
import { Icon } from '@iconify/vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const form = reactive({ email: '', nickname: '', password: '', confirm: '' });
const submitting = ref(false);
let disposed = false;
onBeforeUnmount(() => { disposed = true; });

function goLogin() {
  router.push({ path: '/auth/login', query: typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {} });
}

async function submit() {
  if (submitting.value) return;
  const prepared = prepareRegistration(form);
  if (prepared.error) {
    Message.warning(prepared.error);
    return;
  }
  submitting.value = true;
  try {
    await userStore.register(prepared.params);
    if (disposed) return;
    Message.success('注册成功，请登录');
    goLogin();
  } catch {
    // 请求层已提示失败，离开页面后不触发旧页面导航。
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="register-page">
    <h2 class="title">注册</h2>
    <p class="hint">使用邮箱注册平台账号，注册后返回登录页完成登录。</p>

    <form novalidate @submit.prevent="submit" @keydown.enter="event => { if (event.isComposing || event.keyCode === 229) event.preventDefault(); }">
      <div class="um-field"><Label for="register-email">邮箱</Label><Input id="register-email" v-model="form.email" autocomplete="username" inputmode="email" placeholder="请输入邮箱，如 name@example.com" /></div>
      <div class="um-field"><Label for="register-nickname">昵称</Label><Input id="register-nickname" v-model="form.nickname" autocomplete="nickname" placeholder="请输入昵称" /></div>
      <div class="um-field"><Label for="register-password">密码</Label><PasswordInput id="register-password" v-model="form.password" autocomplete="new-password" placeholder="请输入 6-64 位密码" /></div>
      <div class="um-field"><Label for="register-confirm">确认密码</Label><PasswordInput id="register-confirm" v-model="form.confirm" autocomplete="new-password" placeholder="请再次输入密码" /></div>
      <Button type="submit" size="lg" class="w-full" :disabled="submitting"><Icon v-if="submitting" icon="lucide:loader-circle" class="animate-spin" />{{ submitting ? '正在注册' : '注册' }}</Button>
    </form>

    <div class="bottom">
      已有账号？
      <button type="button" class="auth-link" @click="goLogin">返回登录</button>
    </div>
  </div>
</template>

<style scoped>
.title {
  font-size: 28px;
  font-weight: 600;
  text-align: center;
  margin: 0 0 6px;
}
.hint {
  color: var(--yb-muted);
  font-size: 13px;
  text-align: center;
  margin-bottom: 28px;
}
.bottom {
  margin-top: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--yb-ink-2);
}
.auth-link { border: 0; background: none; color: var(--yb-primary); font: inherit; padding: 0 4px; }
</style>
