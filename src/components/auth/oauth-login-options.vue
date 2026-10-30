<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import * as authApi from '@/service/api/auth';
import { Button } from '@/components/ui/button';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

type OAuthWindow = Window & {
  google?: { accounts?: { id?: GoogleIdentity } };
  [key: string]: unknown;
};

const props = defineProps<{ disabled?: boolean; busyProvider?: Api.RealAuth.OAuthProvider }>();
const emit = defineEmits<{ login: [params: Api.RealAuth.OAuthLoginParams] }>();

const config = ref<Api.RealAuth.OAuthConfigVO>();
const googleButton = ref<HTMLElement>();
const telegramButton = ref<HTMLElement>();
const googleReady = ref(false);
const telegramReady = ref(false);
const googleError = ref('');
const telegramError = ref('');
let telegramLoadTimeout: ReturnType<typeof setTimeout> | undefined;
let telegramRenderVersion = 0;
const disposed = ref(false);
const telegramCallback = `youbaoTelegramAuth_${Math.random().toString(36).slice(2)}`;
const enabledCount = computed(() => Number(!!config.value?.googleEnabled && !!config.value.googleClientId)
  + Number(!!config.value?.telegramEnabled && !!config.value.telegramBotUsername));

function loadGoogleSdk() {
  const win = window as unknown as OAuthWindow;
  if (win.google?.accounts?.id) return Promise.resolve();
  let existing = document.querySelector<HTMLScriptElement>('script[data-youbao-google-identity]');
  if (existing?.dataset.loadState === 'failed') {
    existing.remove();
    existing = null;
  }
  return new Promise<void>((resolve, reject) => {
    const script = existing || document.createElement('script');
    const finish = (loaded: boolean) => {
      clearTimeout(timeout);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      const ready = loaded && !!win.google?.accounts?.id;
      script.dataset.loadState = ready ? 'loaded' : 'failed';
      if (ready) resolve();
      else reject(new Error('Google 登录组件加载失败'));
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeout = setTimeout(onError, 15000);
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client?hl=zh_CN';
      script.async = true;
      script.defer = true;
      script.dataset.youbaoGoogleIdentity = 'true';
      script.dataset.loadState = 'loading';
      document.head.appendChild(script);
    } else if (script.dataset.loadState === 'loaded') onLoad();
  });
}

async function renderGoogle(clientId: string) {
  googleReady.value = false;
  googleError.value = '';
  try {
    await loadGoogleSdk();
    await nextTick();
    if (disposed.value || !googleButton.value) return;
    const identity = (window as unknown as OAuthWindow).google?.accounts?.id;
    if (!identity) throw new Error('Google 登录组件不可用');
    googleButton.value.replaceChildren();
    identity.initialize({
      client_id: clientId,
      callback: response => {
        if (!disposed.value && !props.disabled && response.credential) {
          emit('login', { provider: 'GOOGLE', credential: response.credential });
        }
      }
    });
    identity.renderButton(googleButton.value, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'zh_CN',
      width: Math.max(168, Math.floor(googleButton.value.clientWidth))
    });
    googleReady.value = googleButton.value.childElementCount > 0;
    if (!googleReady.value) throw new Error('Google 登录组件未显示');
  } catch {
    if (disposed.value) return;
    googleReady.value = false;
    googleError.value = 'Google 登录暂不可用，可重试或使用邮箱登录。';
  }
}

async function renderTelegram(botUsername: string) {
  const operation = ++telegramRenderVersion;
  const isCurrent = () => operation === telegramRenderVersion && !disposed.value;
  clearTimeout(telegramLoadTimeout);
  telegramReady.value = false;
  telegramError.value = '';
  await nextTick();
  if (!isCurrent() || !telegramButton.value) return;
  const win = window as unknown as OAuthWindow;
  win[telegramCallback] = (payload: Record<string, unknown>) => {
    if (!isCurrent() || props.disabled) return;
    const telegramPayload = Object.fromEntries(
      Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])
    );
    emit('login', { provider: 'TELEGRAM', telegramPayload });
  };
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.async = true;
  script.dataset.telegramLogin = botUsername.replace(/^@/, '');
  script.dataset.size = 'large';
  script.dataset.userpic = 'false';
  script.dataset.radius = '6';
  script.dataset.lang = 'zh';
  script.dataset.onauth = `${telegramCallback}(user)`;
  script.onload = () => {
    if (!isCurrent()) return;
    clearTimeout(telegramLoadTimeout);
    telegramError.value = '';
    telegramReady.value = true;
  };
  const fail = () => {
    if (!isCurrent()) return;
    clearTimeout(telegramLoadTimeout);
    telegramReady.value = false;
    telegramError.value = 'Telegram 登录暂不可用，可重试或使用邮箱登录。';
  };
  script.onerror = fail;
  telegramLoadTimeout = setTimeout(fail, 15000);
  telegramButton.value.replaceChildren(script);
}

onMounted(async () => {
  try {
    const result = await authApi.fetchOAuthConfig();
    if (disposed.value) return;
    config.value = result;
    if (result.googleEnabled && result.googleClientId) void renderGoogle(result.googleClientId);
    if (result.telegramEnabled && result.telegramBotUsername) void renderTelegram(result.telegramBotUsername);
  } catch {
    // 配置不可用时保留邮箱密码登录，不展示不可用的第三方入口。
  }
});

onBeforeUnmount(() => {
  disposed.value = true;
  telegramRenderVersion += 1;
  clearTimeout(telegramLoadTimeout);
  delete (window as unknown as OAuthWindow)[telegramCallback];
});
</script>

<template>
  <div v-if="enabledCount" class="oauth-section">
    <div class="oauth-divider"><span>其他登录方式</span></div>
    <div class="oauth-options" :class="{ 'oauth-options--single': enabledCount === 1 }">
      <div v-if="config?.googleEnabled && config.googleClientId" class="oauth-option" :class="{ 'oauth-option--disabled': disabled, 'oauth-option--loading': busyProvider === 'GOOGLE' }">
        <div ref="googleButton" class="oauth-provider"></div>
        <div v-if="googleError" class="oauth-failure" role="alert"><span>{{ googleError }}</span><Button type="button" size="sm" variant="outline" :disabled="disabled" @click="renderGoogle(config.googleClientId)">重试 Google</Button></div>
        <span v-else-if="!googleReady" class="oauth-placeholder">Google 登录加载中</span>
        <span v-if="busyProvider === 'GOOGLE'" class="oauth-busy">正在登录…</span>
      </div>
      <div v-if="config?.telegramEnabled && config.telegramBotUsername" class="oauth-option oauth-option--telegram" :class="{ 'oauth-option--disabled': disabled, 'oauth-option--loading': busyProvider === 'TELEGRAM' }">
        <div ref="telegramButton" class="oauth-provider"></div>
        <div v-if="telegramError" class="oauth-failure" role="alert"><span>{{ telegramError }}</span><Button type="button" size="sm" variant="outline" :disabled="disabled" @click="renderTelegram(config.telegramBotUsername)">重试 Telegram</Button></div>
        <span v-else-if="!telegramReady" class="oauth-placeholder">Telegram 登录加载中</span>
        <span v-if="busyProvider === 'TELEGRAM'" class="oauth-busy">正在登录…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oauth-section { margin-top: 22px; }
.oauth-divider { display: flex; align-items: center; gap: 12px; color: var(--yb-muted); font-size: 12px; margin-bottom: 16px; }
.oauth-divider::before, .oauth-divider::after { content: ''; height: 1px; flex: 1; background: var(--yb-hairline-2); }
.oauth-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.oauth-options--single { grid-template-columns: 1fr; }
.oauth-options--single .oauth-option { justify-self: center; }
.oauth-option { position: relative; min-width: 0; min-height: 40px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 6px; }
.oauth-provider { width: 100%; min-height: 40px; display: flex; align-items: center; justify-content: center; }
.oauth-option--disabled { opacity: .55; pointer-events: none; }
.oauth-option--loading .oauth-provider { visibility: hidden; }
.oauth-placeholder, .oauth-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border: 1px solid var(--yb-control-border, var(--yb-hairline-2)); border-radius: 6px; background: var(--yb-surface); color: var(--yb-ink-2); font-size: 13px; }
.oauth-option--telegram .oauth-placeholder, .oauth-option--telegram .oauth-busy { border-color: #8bcbed; background: #eef8fd; color: #1677a8; }
.oauth-failure { display:grid; gap:8px; padding:10px; width:100%; border:1px solid var(--yb-hairline); border-radius:6px; background:var(--yb-fill); color:var(--yb-muted); font-size:12px; line-height:1.7; }
.oauth-failure button { justify-self:start; }
.oauth-option:has(.oauth-failure) .oauth-provider { display:none; }
@media (max-width: 520px) { .oauth-options { grid-template-columns: 1fr; } }
</style>
