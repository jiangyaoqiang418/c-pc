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
  value: string;
}

export const useWalletStore = defineStore('bw-wallet', () => {
  const summary = ref<Api.User.WalletSummary | undefined>();
  const buyerWallet = ref<Api.Buyer.Wallet | undefined>();
  const totalAssets = ref<string>('0');
  const today = ref<{ depositIn: string; withdrawOut: string; internalVolume: string }>();
  const account = ref<Api.RealWallet.Account | undefined>();
  const loading = ref(false);
  const lastFetchedAt = ref<number>(0);
  let requestVersion = 0;
  const requestGuard = createLatestRequestGuard();

  async function fetchWallet(userId: Api.RealSession.Id) {
    if (!userId) return;
    const isCurrent = requestGuard.begin();
    const version = ++requestVersion;
    loading.value = true;
    try {
      const overview = await realWalletApi.fetchWalletOverview(userId, { signal: isCurrent.signal });
      const userStore = useUserStore();
      if (!isCurrent() || version !== requestVersion || String(userStore.currentUser?.id) !== String(userId)) return;
      summary.value = overview.summary;
      buyerWallet.value = undefined;
      totalAssets.value = overview.total;
      today.value = overview.today;
      account.value = overview.account;
      lastFetchedAt.value = Date.now();
    } finally {
      if (isCurrent() && version === requestVersion) loading.value = false;
    }
  }

  async function refetch() {
    const userStore = useUserStore();
    if (userStore.currentUser) await fetchWallet(userStore.currentUser.id);
  }

  function clear() {
    requestVersion += 1;
    requestGuard.invalidate();
    summary.value = undefined;
    buyerWallet.value = undefined;
    totalAssets.value = '0';
    today.value = undefined;
    account.value = undefined;
    lastFetchedAt.value = 0;
    loading.value = false;
  }

  const bucketsArray = computed<BucketView[]>(() => {
    if (!account.value) return [];
    const acc = account.value;
    const userStore = useUserStore();
    const list: BucketView[] = [];
    const baseKeys: BucketKey[] = ['available', 'nonWithdrawable', 'lockedFinance', 'frozenOrder', 'frozenRisk'];
    baseKeys.forEach(k => {
      const meta = enums.BUCKET_META[k];
      list.push({ key: k, label: meta.label, color: meta.color, hint: meta.hint, icon: meta.icon, value: acc[k] || '0' });
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
          value: acc[k] || '0'
        });
      });
    }
    return list;
  });

  const compositionBreakdown = computed(() => {
    const total = Number(totalAssets.value) || 0;
    return bucketsArray.value
      .filter(b => Number(b.value) > 0)
      .map(b => {
        const value = Number(b.value);
        return {
          label: b.label,
          color: b.color,
          value: b.value,
          pct: total > 0 ? value / total : 0
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
    bucketsArray,
    compositionBreakdown,
    fetchWallet,
    refetch,
    clear
  };
});
