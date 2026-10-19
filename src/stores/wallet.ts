import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { enums } from '@shared';
import type { BucketKey } from '@shared/enums/wallet';
import * as realWalletApi from '@/service/api/wallet';
import { useUserStore } from './user';
import { createLatestRequestGuard } from '@/utils/latest-request';

export interface BucketView {
  key: BucketKey;
  label: string;
  color: string;
  hint: string;
  icon: string;
  value?: string;
  ratio?: string | number | null;
}

export const useWalletStore = defineStore('bw-wallet', () => {
  const summary = ref<Partial<Api.User.WalletSummary> | undefined>();
  const buyerWallet = ref<Api.Buyer.Wallet | undefined>();
  const totalAssets = ref<string | undefined>();
  const today = ref<{ depositIn?: string; withdrawOut?: string; internalVolume?: string }>();
  const account = ref<Api.RealWallet.Account | undefined>();
  const loading = ref(false);
  const lastFetchedAt = ref<number>(0);
  const overviews = ref<Partial<Record<Api.RealWallet.Asset, realWalletApi.WalletOverview>>>({});
  const loadingByAsset = ref<Record<Api.RealWallet.Asset, boolean>>({ USDT: false, USDC: false });
  let contextVersion = 0;
  let requestedUserId: Api.RealSession.Id | undefined;
  const requestGuards = { USDT: createLatestRequestGuard(), USDC: createLatestRequestGuard() };
  const inFlight = new Map<Api.RealWallet.Asset, { userId: Api.RealSession.Id; promise: Promise<void> }>();

  function clearLegacy() {
    summary.value = undefined;
    buyerWallet.value = undefined;
    totalAssets.value = undefined;
    today.value = undefined;
    account.value = undefined;
    lastFetchedAt.value = 0;
  }

  function fetchWallet(userId: Api.RealSession.Id, asset: Api.RealWallet.Asset = 'USDT'): Promise<void> {
    if (!userId) return Promise.resolve();
    if (String(requestedUserId) !== String(userId)) {
      clear();
      requestedUserId = userId;
    }
    const pending = inFlight.get(asset);
    if (pending && String(pending.userId) === String(userId)) return pending.promise;
    const isCurrent = requestGuards[asset].begin();
    const context = contextVersion;
    const promise = Promise.resolve().then(async () => {
      try {
        const overview = await realWalletApi.fetchWalletOverview(userId, { asset, signal: isCurrent.signal });
        const userStore = useUserStore();
        if (!isCurrent() || context !== contextVersion || String(userStore.currentUser?.id) !== String(userId)) return;
        overviews.value[asset] = overview;
        // 商城结算、小金库与买手的既有全局余额始终只代表 USDT。
        if (asset === 'USDT') {
          summary.value = overview.summary;
          buyerWallet.value = undefined;
          totalAssets.value = overview.total ?? undefined;
          today.value = { depositIn: overview.today.depositIn ?? undefined, withdrawOut: overview.today.withdrawOut ?? undefined };
          account.value = overview.account;
          lastFetchedAt.value = Date.now();
        }
      } catch (error) {
        const userStore = useUserStore();
        // 仅清理当前账号、当前请求仍有效时的旧快照；被切换/失效的请求不能影响新账号。
        if (isCurrent() && context === contextVersion && String(userStore.currentUser?.id) === String(userId)) {
          delete overviews.value[asset];
          if (asset === 'USDT') clearLegacy();
        }
        throw error;
      } finally {
        if (inFlight.get(asset)?.promise === promise) inFlight.delete(asset);
        if (isCurrent() && context === contextVersion) {
          loadingByAsset.value[asset] = false;
          loading.value = loadingByAsset.value.USDT;
        }
      }
    });
    inFlight.set(asset, { userId, promise });
    loadingByAsset.value[asset] = true;
    if (asset === 'USDT') loading.value = true;
    return promise;
  }

  async function refetch(asset: Api.RealWallet.Asset = 'USDT') {
    const userStore = useUserStore();
    if (!userStore.currentUser) return;
    const userId = userStore.currentUser.id;
    const context = contextVersion;
    const pending = inFlight.get(asset);
    // 操作后的刷新不能复用操作前已在途的快照，也不主动取消其余读取者。
    if (pending && String(pending.userId) === String(userId)) {
      try { await pending.promise; } catch { /* 原读取者仍取得失败，操作后的新读取继续执行。 */ }
      if (context !== contextVersion || String(userStore.currentUser?.id) !== String(userId)) return;
    }
    await fetchWallet(userId, asset);
  }

  function clear() {
    contextVersion += 1;
    requestedUserId = undefined;
    requestGuards.USDT.invalidate();
    requestGuards.USDC.invalidate();
    inFlight.clear();
    overviews.value = {};
    clearLegacy();
    loadingByAsset.value = { USDT: false, USDC: false };
    loading.value = false;
  }

  function getOverview(asset: Api.RealWallet.Asset = 'USDT') {
    return overviews.value[asset];
  }

  const bucketsArray = computed<BucketView[]>(() => {
    if (!account.value) return [];
    const acc = account.value;
    const userStore = useUserStore();
    const list: BucketView[] = [];
    const baseKeys: BucketKey[] = ['available', 'nonWithdrawable', 'lockedFinance', 'frozenOrder', 'frozenRisk'];
    baseKeys.forEach(k => {
      const meta = enums.BUCKET_META[k];
      const bucket = overviews.value.USDT?.distribution.find(item => item.key === k);
      list.push({ key: k, label: bucket?.name || meta.label, color: meta.color, hint: bucket?.description || meta.hint, icon: meta.icon, value: acc[k], ratio: bucket?.ratio });
    });
    if (userStore.currentUser?.isBuyer) {
      const buyerKeys: BucketKey[] = ['depositAvailable', 'depositGuaranteed'];
      buyerKeys.forEach(k => {
        const meta = enums.BUCKET_META[k];
        list.push({
          key: k,
          label: meta.label,
          color: meta.color,
          hint: meta.hint,
          icon: meta.icon,
          value: acc[k],
          ratio: overviews.value.USDT?.distribution.find(item => item.key === k)?.ratio
        });
      });
    }
    return list;
  });

  const compositionReady = computed(() => !!account.value && totalAssets.value !== undefined);
  const partialData = computed(() => !!account.value && (totalAssets.value === undefined
    || today.value?.depositIn === undefined || today.value?.withdrawOut === undefined));
  const bucketsWithPct = computed(() => bucketsArray.value.map(bucket => ({
    ...bucket,
    pct: bucket.ratio == null ? undefined : Number(bucket.ratio) * 100
  })));

  const compositionBreakdown = computed(() => {
    if (!compositionReady.value) return [];
    return bucketsArray.value
      .filter((b): b is BucketView & { value: string } => b.value !== undefined && b.ratio != null && Number(b.ratio) > 0)
      .map(b => {
        return {
          label: b.label,
          color: b.color,
          value: b.value,
          pct: Number(b.ratio)
        };
      });
  });

  return {
    summary,
    buyerWallet,
    totalAssets,
    today,
    account,
    loading,
    lastFetchedAt,
    overviews,
    loadingByAsset,
    getOverview,
    bucketsArray,
    bucketsWithPct,
    compositionReady,
    partialData,
    compositionBreakdown,
    fetchWallet,
    refetch,
    clear
  };
});
