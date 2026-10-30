import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { type Audience, STORAGE_KEY } from '@shared';
import * as realAuthApi from '@/service/api/auth';
import { getAccessToken, setAccessToken, isAuthenticationFailure } from '@/service/request';
import { useCartStore } from './cart';
import { useWalletStore } from './wallet';
import { clearPrerequisiteDrafts } from '@/utils/prerequisite-navigation';
import { acceptStoredAccessToken, getAcceptedAccessToken } from '@/service/request/token';

export const useUserStore = defineStore('bw-user', () => {
  const currentUser = ref<Api.RealSession.UserRecord>();
  const currentAudience = ref<Audience>('customer');
  const initialized = ref(false);
  const initializing = ref(false);
  const sessionVersion = ref(0);
  const initializationError = ref('');
  let initPromise: Promise<void> | undefined;
  let identityVersion = 0;
  let refreshVersion = 0;
  let loginVersion = 0;
  let sessionToken = getAcceptedAccessToken();

  async function refreshAccountInfo() {
    const user = currentUser.value;
    if (!user) return;
    const version = identityVersion;
    const profileVersion = refreshVersion;
    const token = getAccessToken();
    try {
      const info = await realAuthApi.fetchUserAccountInfo(user);
      if (version !== identityVersion || profileVersion !== refreshVersion || token !== getAccessToken()
        || String(currentUser.value?.id) !== String(user.id)) return;
      Object.assign(currentUser.value!, info);
    } catch {
      // 主身份已经确认；附属读取失败保留“积分/等级未更新”，由资料页提供重试。
    }
  }

  function loadAudienceFromStorage(): Audience {
    const raw = localStorage.getItem(STORAGE_KEY.currentAudience);
    return raw === 'buyer' ? 'buyer' : 'customer';
  }

  async function init() {
    if (initialized.value) return;
    if (initPromise) return initPromise;
    const startVersion = identityVersion;
    initializing.value = true;
    const run = (async () => {
      const requestedToken = getAccessToken();
      sessionToken = requestedToken;
      if (requestedToken) {
        try {
          const user = await realAuthApi.fetchCurrentUser(undefined, { skipAuthRedirect: true, showError: false, deferAccount: true });
          if (startVersion !== identityVersion || getAccessToken() !== requestedToken) return;
          currentUser.value = user;
          useCartStore().switchOwner(user.id);
          initializationError.value = '';
          currentAudience.value = user.isBuyer ? loadAudienceFromStorage() : 'customer';
          initialized.value = true;
          void refreshAccountInfo();
          return;
        } catch (error) {
          if (startVersion !== identityVersion || getAccessToken() !== requestedToken) return;
          if (isAuthenticationFailure(error)) {
            realAuthApi.logoutLocal();
            initializationError.value = '';
            initialized.value = true;
          } else {
            initializationError.value = '会话读取失败，登录凭证已保留，请检查网络后重试。';
          }
          return;
        }
      }
      localStorage.removeItem(STORAGE_KEY.currentUserId);
      if (startVersion === identityVersion) {
        initializationError.value = '';
        initialized.value = true;
      }
    })();
    const promise = run.finally(() => {
      if (initPromise === promise) initPromise = undefined;
      if (startVersion === identityVersion) initializing.value = false;
    });
    initPromise = promise;
    return initPromise;
  }

  async function commitRealLogin(request: () => ReturnType<typeof realAuthApi.login>) {
    const operation = ++loginVersion;
    const startVersion = identityVersion;
    const previousToken = getAccessToken();
    const result = await request();
    if (operation !== loginVersion || startVersion !== identityVersion || getAccessToken() !== previousToken) {
      throw new Error('登录请求已失效，请重新登录');
    }
    setAccessToken(result.token);
    sessionToken = result.token;
    clearPrerequisiteDrafts();
    identityVersion += 1;
    sessionVersion.value += 1;
    useWalletStore().clear();
    currentUser.value = result.user;
    useCartStore().switchOwner(result.user.id);
    currentAudience.value = result.user.isBuyer ? loadAudienceFromStorage() : 'customer';
    initialized.value = true;
    initializing.value = false;
    initializationError.value = '';
    localStorage.removeItem(STORAGE_KEY.currentUserId);
    localStorage.setItem(STORAGE_KEY.currentAudience, currentAudience.value);
    void refreshAccountInfo();
    return {
      newUser: result.newUser,
      loginPasswordSet: result.loginPasswordSet,
      payPasswordSet: result.payPasswordSet
    };
  }

  async function loginWithPassword(params: Api.RealAuth.LoginParams) {
    return commitRealLogin(() => realAuthApi.login(params));
  }

  async function loginWithOAuth(params: Api.RealAuth.OAuthLoginParams) {
    return commitRealLogin(() => realAuthApi.oauthLogin(params));
  }

  async function register(params: Api.RealAuth.RegisterParams) {
    return realAuthApi.register(params);
  }

  async function refreshCurrentUser(options: { signal?: AbortSignal; deferAccount?: boolean } = {}) {
    const requestedToken = getAccessToken();
    if (!requestedToken) return;
    const version = identityVersion;
    const requestVersion = ++refreshVersion;
    const user = await realAuthApi.fetchCurrentUser(undefined, options);
    if (version === identityVersion && requestVersion === refreshVersion && getAccessToken() === requestedToken) {
      // 同账号刷新失败可保留已确认值，但必须继续标记未更新；不能跨身份沿用。
      const previous = currentUser.value;
      if (user.accountInfoUnavailable && previous && String(previous.id) === String(user.id)) {
        user.points ??= previous.points;
        if (user.isBuyer === previous.isBuyer) user.vipLevel ??= previous.vipLevel;
      }
      currentUser.value = user;
      if (!user.isBuyer && currentAudience.value === 'buyer') setAudience('customer');
      if (options.deferAccount) void refreshAccountInfo();
    }
  }

  function logout() {
    loginVersion += 1;
    clearPrerequisiteDrafts();
    identityVersion += 1;
    refreshVersion += 1;
    initialized.value = true;
    initializing.value = false;
    initializationError.value = '';
    useWalletStore().clear();
    currentUser.value = undefined;
    currentAudience.value = 'customer';
    useCartStore().switchOwner();
    realAuthApi.logoutLocal();
    sessionToken = '';
    localStorage.removeItem(STORAGE_KEY.currentUserId);
    localStorage.removeItem(STORAGE_KEY.currentAudience);
  }

  async function syncExternalSession() {
    const nextToken = getAccessToken();
    if (nextToken === sessionToken) return false;
    sessionToken = nextToken;
    loginVersion += 1;
    clearPrerequisiteDrafts();
    identityVersion += 1;
    refreshVersion += 1;
    const version = identityVersion;
    initPromise = undefined;
    initialized.value = false;
    initializing.value = false;
    initializationError.value = '';
    currentUser.value = undefined;
    currentAudience.value = 'customer';
    useWalletStore().clear();
    useCartStore().switchOwner();
    // 不调用 logout：它会删除另一标签页刚建立的有效会话。
    acceptStoredAccessToken();
    await init();
    return version === identityVersion;
  }

  function setAudience(a: Audience) {
    if (a === 'buyer' && !canSwitchToBuyer.value) return false;
    currentAudience.value = a;
    localStorage.setItem(STORAGE_KEY.currentAudience, a);
    return true;
  }

  const isLoggedIn = computed(() => !!currentUser.value);
  const displayName = computed(() => currentUser.value?.nickname || currentUser.value?.email?.split('@')[0] || '');
  const needsLoginPassword = computed(() => currentUser.value?.loginPasswordSet === false);
  const canSwitchToBuyer = computed(() => !!currentUser.value?.isBuyer);
  const isBuyerActive = computed(() => canSwitchToBuyer.value && currentAudience.value === 'buyer');

  return {
    currentUser,
    initializing,
    sessionVersion,
    initializationError,
    currentAudience,
    isLoggedIn,
    displayName,
    needsLoginPassword,
    canSwitchToBuyer,
    isBuyerActive,
    init,
    loginWithPassword,
    loginWithOAuth,
    register,
    refreshCurrentUser,
    syncExternalSession,
    logout,
    setAudience
  };
});
