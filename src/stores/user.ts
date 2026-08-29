import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { type Audience, MOCK_USERS, STORAGE_KEY, authApi } from '@shared';
import * as realAuthApi from '@/service/api/auth';
import { getAccessToken, isAuthenticationFailure } from '@/service/request';
import { useCartStore } from './cart';
import { useWalletStore } from './wallet';

export const useUserStore = defineStore('bw-user', () => {
  const currentUser = ref<Api.User.UserRecord | Api.RealSession.UserRecord | undefined>();
  const currentAudience = ref<Audience>('customer');
  const initialized = ref(false);
  let initPromise: Promise<void> | undefined;
  let identityVersion = 0;

  function loadAudienceFromStorage(): Audience {
    const raw = localStorage.getItem(STORAGE_KEY.currentAudience);
    return raw === 'buyer' ? 'buyer' : 'customer';
  }

  async function init() {
    if (initialized.value) return;
    if (initPromise) return initPromise;
    const startVersion = identityVersion;
    const run = (async () => {
      if (getAccessToken()) {
        try {
          const user = await realAuthApi.fetchCurrentUser();
          if (startVersion !== identityVersion) return;
          currentUser.value = user;
          currentAudience.value = user.isBuyer ? loadAudienceFromStorage() : 'customer';
          initialized.value = true;
          return;
        } catch (error) {
          if (isAuthenticationFailure(error)) realAuthApi.logoutLocal();
          // 临时网络错误时保留 token 且不降级到 Mock；下次路由初始化可直接重试真实会话。
          return;
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY.currentUserId);
      let userId = raw ? Number(raw) : undefined;
      // 迁移：老会话可能存了 MOCK_USERS 池外的旧 id（如 12 周维一——曾被误标为张丽琳）
      // 检测到就复位到默认演示账号 (王小美)，防止「dropdown label 与 header 昵称对不上」的混淆
      if (userId && !MOCK_USERS.some(u => u.userId === userId)) {
        localStorage.setItem(STORAGE_KEY.currentUserId, String(MOCK_USERS[0].userId));
        localStorage.setItem(STORAGE_KEY.currentAudience, 'customer');
        userId = MOCK_USERS[0].userId;
      }
      if (userId) {
        const result = await authApi.switchCurrentUser(userId);
        if (startVersion === identityVersion && result && !('error' in result)) {
          currentUser.value = result;
          currentAudience.value = result.isBuyer ? loadAudienceFromStorage() : 'customer';
        }
      }
      if (startVersion === identityVersion) initialized.value = true;
    })();
    const promise = run.finally(() => {
      if (initPromise === promise) initPromise = undefined;
    });
    initPromise = promise;
    return initPromise;
  }

  async function login(userId: number) {
    const result = await authApi.switchCurrentUser(userId);
    if (!result || 'error' in result) throw new Error((result as { error: string })?.error || '登录失败');
    identityVersion += 1;
    useWalletStore().clear();
    realAuthApi.logoutLocal();
    currentUser.value = result;
    useCartStore().switchOwner(result.id);
    currentAudience.value = 'customer';
    initialized.value = true;
    localStorage.setItem(STORAGE_KEY.currentUserId, String(userId));
    localStorage.setItem(STORAGE_KEY.currentAudience, 'customer');
  }

  async function loginWithPassword(params: Api.RealAuth.LoginParams) {
    const result = await realAuthApi.login(params);
    identityVersion += 1;
    useWalletStore().clear();
    currentUser.value = result.user;
    useCartStore().switchOwner(result.user.id);
    currentAudience.value = result.user.isBuyer ? loadAudienceFromStorage() : 'customer';
    initialized.value = true;
    localStorage.removeItem(STORAGE_KEY.currentUserId);
    localStorage.setItem(STORAGE_KEY.currentAudience, currentAudience.value);
  }

  async function register(params: Api.RealAuth.RegisterParams) {
    return realAuthApi.register(params);
  }

  async function refreshCurrentUser(options: { signal?: AbortSignal } = {}) {
    if (!getAccessToken()) return;
    const version = identityVersion;
    const user = await realAuthApi.fetchCurrentUser(undefined, options);
    if (version === identityVersion) currentUser.value = user;
  }

  function logout() {
    identityVersion += 1;
    initialized.value = true;
    useWalletStore().clear();
    currentUser.value = undefined;
    currentAudience.value = 'customer';
    useCartStore().switchOwner();
    realAuthApi.logoutLocal();
    localStorage.removeItem(STORAGE_KEY.currentUserId);
    localStorage.removeItem(STORAGE_KEY.currentAudience);
  }

  function switchDemoUser(userId: number) {
    identityVersion += 1;
    initialized.value = true;
    useWalletStore().clear();
    localStorage.setItem(STORAGE_KEY.currentUserId, String(userId));
    localStorage.setItem(STORAGE_KEY.currentAudience, 'customer');
    window.location.reload();
  }

  function setAudience(a: Audience) {
    if (a === 'buyer' && !canSwitchToBuyer.value) return false;
    currentAudience.value = a;
    localStorage.setItem(STORAGE_KEY.currentAudience, a);
    return true;
  }

  const isLoggedIn = computed(() => !!currentUser.value);
  const displayName = computed(() => currentUser.value?.nickname || currentUser.value?.email?.split('@')[0] || '');
  const canSwitchToBuyer = computed(() => !!currentUser.value?.isBuyer);
  const isBuyerActive = computed(() => currentAudience.value === 'buyer');
  const demoUserList = computed(() => MOCK_USERS);

  return {
    currentUser,
    currentAudience,
    isLoggedIn,
    displayName,
    canSwitchToBuyer,
    isBuyerActive,
    demoUserList,
    init,
    login,
    loginWithPassword,
    register,
    refreshCurrentUser,
    logout,
    switchDemoUser,
    setAudience
  };
});
