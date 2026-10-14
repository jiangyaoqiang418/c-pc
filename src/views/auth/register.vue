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
import UmIcon from '@/components/common/um-icon.vue';

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
  <section class="auth-form paper register-page" :aria-busy="submitting">
    <h1>注册账户</h1>
    <p>使用邮箱注册，完成后返回登录。</p>
    <form novalidate @submit.prevent="submit" @keydown.enter="event => { if (event.isComposing || event.keyCode === 229) event.preventDefault(); }">
      <div class="field">
        <Label for="register-email">邮箱</Label>
        <Input id="register-email" v-model="form.email" type="email" autocomplete="username" inputmode="email" placeholder="name@example.com" />
      </div>
      <div class="field">
        <Label for="register-nickname">昵称</Label>
        <Input id="register-nickname" v-model="form.nickname" autocomplete="nickname" placeholder="我们该怎么称呼你" />
      </div>
      <div class="field">
        <Label for="register-password">密码</Label>
        <PasswordInput id="register-password" v-model="form.password" :max-length="64" autocomplete="new-password" placeholder="请输入 6–64 位密码" />
      </div>
      <div class="field">
        <Label for="register-confirm">确认密码</Label>
        <PasswordInput id="register-confirm" v-model="form.confirm" :max-length="64" autocomplete="new-password" placeholder="请再次输入密码" />
      </div>
      <Button type="submit" class="primary full auth-submit" :disabled="submitting">
        {{ submitting ? '正在注册' : '注册账户' }}
        <UmIcon :name="submitting ? 'clock' : 'arrow'" :class="{ 'auth-loading': submitting }" />
      </Button>
    </form>
    <p class="center auth-return">已有账号？<button type="button" class="text-link" @click="goLogin">返回登录</button></p>
  </section>
</template>

<style scoped src="./auth-form.css"></style>
