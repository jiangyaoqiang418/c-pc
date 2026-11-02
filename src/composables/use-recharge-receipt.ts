import { onScopeDispose, ref, watch } from 'vue';
import * as walletApi from '@/service/api/wallet';
import { resolvePageSize } from '@/service/api/page';
import { createLatestRequestGuard } from '@/utils/latest-request';

export interface RechargeReceiptTarget {
  ownerId: string;
  session: number;
  asset: Api.RealWallet.Asset;
  chain: string;
  txHash: string;
}

/** 只追踪平台确认的本笔充值；不创建申报、不重复发起钱包交易。 */
export function useRechargeReceipt(options: {
  target: () => RechargeReceiptTarget | undefined;
  active: () => boolean;
  onConfirmed?: (receipt: Api.RealWallet.RechargeVO) => void | Promise<unknown>;
  onClose: () => void;
}) {
  const targetKey = () => {
    const target = options.target();
    return target ? JSON.stringify([target.ownerId, target.session, target.asset, target.chain, target.txHash]) : '';
  };
  const guard = createLatestRequestGuard(() => JSON.stringify([targetKey(), options.active()]));
  const receivedRecharge = ref<Api.RealWallet.RechargeVO>();
  const receiptChecking = ref(false);
  const closeCountdown = ref<number>();
  const canceledTransactions = new Set<string>();
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setInterval> | undefined;

  function stopTimers() {
    if (receiptTimer !== undefined) clearTimeout(receiptTimer);
    if (closeTimer !== undefined) clearInterval(closeTimer);
    receiptTimer = undefined;
    closeTimer = undefined;
    closeCountdown.value = undefined;
  }

  function cancelAutoClose() {
    const key = targetKey();
    if (key) canceledTransactions.add(key);
    if (closeTimer !== undefined) clearInterval(closeTimer);
    closeTimer = undefined;
    closeCountdown.value = undefined;
  }

  function restart() {
    guard.invalidate();
    stopTimers();
    receivedRecharge.value = undefined;
    receiptChecking.value = false;
    const target = options.target();
    if (!target?.txHash || !options.active()) return;
    const current = guard.begin();
    const key = targetKey();
    let trackedId: string | number | undefined;
    const matches = (record: Api.RealWallet.RechargeVO) => record.asset === target.asset && record.chain === target.chain
      && (record.txHash === target.txHash || record.reportedTxHash === target.txHash);
    const hidden = () => typeof document !== 'undefined' && document.hidden;

    async function check() {
      if (!current()) return;
      if (hidden()) { receiptTimer = setTimeout(() => void check(), 5000); return; }
      receiptChecking.value = true;
      try {
        let candidate: Api.RealWallet.RechargeVO | undefined;
        if (trackedId !== undefined) candidate = await walletApi.fetchRechargeDetail(trackedId, { asset: target!.asset, signal: current.signal, showError: false });
        else {
          // 不受界面筛选影响；分页定位后固定查询详情，避免目标被新记录挤出首屏。
          let pageNo = 1;
          do {
            const page = await walletApi.fetchRechargePage({ asset: target!.asset, pageNo, pageSize: 30 }, { signal: current.signal, showError: false });
            if (!current()) return;
            candidate = page.records.find(matches);
            if (candidate) { trackedId = candidate.id; break; }
            if (!page.records.length || pageNo * resolvePageSize(page, 30) >= page.total) break;
            pageNo += 1;
          } while (current());
        }
        if (!current()) return;
        if (candidate?.status === 'CONFIRMED') {
          const detail = await walletApi.fetchRechargeDetail(candidate.id, { asset: target!.asset, signal: current.signal, showError: false });
          if (!current()) return;
          if (matches(detail) && String(detail.id) === String(candidate.id) && detail.status === 'CONFIRMED') {
            receivedRecharge.value = detail;
            // 回执已由详情确认；余额加载失败不能把真实到账改成失败。
            try { void Promise.resolve(options.onConfirmed?.(detail)).catch(() => undefined); } catch { /* 保留已确认回执。 */ }
            if (canceledTransactions.has(key)) return;
            closeCountdown.value = 5;
            closeTimer = setInterval(() => {
              if (!current() || canceledTransactions.has(key)) { stopTimers(); return; }
              if (hidden()) return;
              closeCountdown.value = Math.max(0, (closeCountdown.value ?? 5) - 1);
              if (closeCountdown.value === 0) { stopTimers(); options.onClose(); }
            }, 1000);
            return;
          }
        }
      } catch { /* 网络失败或未确认只继续核对，不宣告到账。 */ }
      finally { if (current()) receiptChecking.value = false; }
      if (current()) receiptTimer = setTimeout(() => void check(), 5000);
    }
    void check();
  }

  watch([targetKey, options.active], restart, { immediate: true, flush: 'sync' });
  onScopeDispose(() => { guard.invalidate(); stopTimers(); receiptChecking.value = false; });
  return { receivedRecharge, receiptChecking, closeCountdown, cancelAutoClose };
}
