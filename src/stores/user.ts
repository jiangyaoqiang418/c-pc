import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { type Audience, MOCK_USERS, STORAGE_KEY, authApi } from '@shared';
import * as realAuthApi from '@/service/api/auth';
import { getAccessToken, setAccessToken, isAuthenticationFailure } from '@/service/request';
import { useCartStore } from './cart';
import { useWalletStore } from './wallet';
import { acceptStoredAccessToken, getAcceptedAccessToken } from '@/service/request/token';

export const useUserStore = defineStore('bw-user', () => {
  const currentUser = ref<Api.RealSession.UserRecord>();
  const demoUser = ref<Api.User.UserRecord>();
  const demoEnabled = import.meta.env.DEV;
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
          demoUser.value = undefined;
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
      const raw = localStorage.getItem(STORAGE_KEY.currentUserId);
      let userId = raw ? Number(raw) : undefined;
      // 迁移：老会话可能存了 MOCK_USERS 池外的旧 id（如 12 周维一——曾被误标为张丽琳）
      // 检测到就复位到默认演示账号 (王小美)，防止「dropdown label 与 header 昵称对不上」的混淆
      if (userId && !MOCK_USERS.some(u => u.userId === userId)) {
        localStorage.setItem(STORAGE_KEY.currentUserId, String(MOCK_USERS[0].userId));
        localStorage.setItem(STORAGE_KEY.currentAudience, 'customer');
        userId = MOCK_USERS[0].userId;
      }
      if (userId && demoEnabled) {
        const result = await authApi.switchCurrentUser(userId);
        if (startVersion === identityVersion && result && !('error' in result)) {
          demoUser.value = result;
          currentAudience.value = 'customer';
        }
      }
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

  async function login(userId: number) {
    if (!demoEnabled) throw new Error('当前环境不提供演示登录');
    if (getAccessToken() || currentUser.value) throw new Error('请先退出真实账号后再体验演示模式，当前登录未改变');
    const operation = ++loginVersion;
    const startVersion = identityVersion;
    const result = await authApi.switchCurrentUser(userId);
    if (operation !== loginVersion || startVersion !== identityVersion) throw new Error('登录请求已失效，请重新登录');
    if (!result || 'error' in result) throw new Error((result as { error: string })?.error || '登录失败');
    identityVersion += 1;
    useWalletStore().clear();
    demoUser.value = result;
    currentUser.value = undefined;
    useCartStore().switchOwner();
    currentAudience.value = 'customer';
    initialized.value = true;
    initializing.value = false;
    initializationError.value = '';
    localStorage.setItem(STORAGE_KEY.currentUserId, String(userId));
    localStorage.setItem(STORAGE_KEY.currentAudience, 'customer');
  }

  async function loginWithPassword(params: Api.RealAuth.LoginParams) {
    const operation = ++loginVersion;
    const startVersion = identityVersion;
    const previousToken = getAccessToken();
    const result = await realAuthApi.login(params);
    if (operation !== loginVersion || startVersion !== identityVersion || getAccessToken() !== previousToken) {
      throw new Error('登录请求已失效，请重新登录');
    }
    setAccessToken(result.token);
    sessionToken = result.token;
    identityVersion += 1;
    sessionVersion.value += 1;
    useWalletStore().clear();
    currentUser.value = result.user;
    demoUser.value = undefined;
    useCartStore().switchOwner(result.user.id);
    currentAudience.value = result.user.isBuyer ? loadAudienceFromStorage() : 'customer';
    initialized.value = true;
    initializing.value = false;
    initializationError.value = '';
    localStorage.removeItem(STORAGE_KEY.currentUserId);
    localStorage.setItem(STORAGE_KEY.currentAudience, currentAudience.value);
    void refreshAccountInfo();
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
    identityVersion += 1;
    refreshVersion += 1;
    initialized.value = true;
    initializing.value = false;
    initializationError.value = '';
    useWalletStore().clear();
    currentUser.value = undefined;
    demoUser.value = undefined;
    currentAudience.value = 'customer';
    useCartStore().switchOwner();
    realAuthApi.logoutLocal();
    sessionToken = '';
    localStorage.removeItem(STORAGE_KEY.currentUserId);
    localStorage.removeItem(STORAGE_KEY.currentAudience);
  }

  function switchDemoUser(userId: number) {
    return login(userId);
  }

  async function syncExternalSession() {
    const nextToken = getAccessToken();
    if (nextToken === sessionToken) return false;
    sessionToken = nextToken;
    loginVersion += 1;
    identityVersion += 1;
    refreshVersion += 1;
    const version = identityVersion;
    initPromise = undefined;
    initialized.value = false;
    initializing.value = false;
    initializationError.value = '';
    currentUser.value = undefined;
    demoUser.value = undefined;
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
  const canSwitchToBuyer = computed(() => !!currentUser.value?.isBuyer);
  const isBuyerActive = computed(() => canSwitchToBuyer.value && currentAudience.value === 'buyer');
  const demoUserList = computed(() => MOCK_USERS);

  return {
    currentUser,
    demoUser,
    demoEnabled,
    initializing,
    sessionVersion,
    initializationError,
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
    syncExternalSession,
    logout,
    switchDemoUser,
    setAudience
  };
});
