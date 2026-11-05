import { onBeforeUnmount, onDeactivated, watch } from 'vue';
import { Modal } from '@/lib/feedback';
import { useUserStore } from '@/stores';
import { fetchCurrentWalletPay, type WalletPayOrder } from '@/service/api/wallet-pay';
import { fetchOrderGroupPayResult } from '@/service/api/order';

interface BalanceConsent { group: string; payNo?: string }

export function balancePaymentBlockedReason(pay?: WalletPayOrder) {
  if (pay?.status === 'SUBMITTED') return '链上交易正在确认，请查看原支付进度，暂不可再次付款';
  if (pay?.status === 'SUCCESS') return '原钱包付款已完成，请刷新订单结果，勿重复付款';
  return '';
}

/** 所有余额入口共用只读核对与显式切换确认，实际扣款仍由原付款锁和密码流程执行。 */
export function useWalletBalancePayment() {
  const user = useUserStore();
  let modal: ReturnType<typeof Modal.confirm> | undefined;
  let finish: ((accepted: boolean) => void) | undefined;
  function close() { finish?.(false); finish = undefined; modal?.close(); modal = undefined; }
  watch(() => user.sessionVersion, close, { flush: 'sync' });
  onBeforeUnmount(close);
  onDeactivated(close);

  async function confirmBalanceSwitch(group: string | undefined, amount: string, isCurrent: () => boolean): Promise<BalanceConsent | undefined> {
    if (!group) return { group: '' };
    const pay = await fetchCurrentWalletPay(group);
    if (!isCurrent()) return;
    const blocked = balancePaymentBlockedReason(pay);
    if (blocked) throw new Error(blocked);
    if (pay) {
      const accepted = await new Promise<boolean>(resolve => {
        let settled = false;
        const settle = (value: boolean) => { if (!settled) { settled = true; finish = undefined; resolve(value); } };
        finish = settle;
        modal = Modal.confirm({
          title: '确认改用余额支付',
          content: `本次确认支付 ${amount} USDT。原直付单 ${pay.payNo}：${pay.statusText || pay.status}。请先核对钱包活动及原交易；已广播时应先上报原交易哈希。若仍选择余额，实际付款时将终止整个订单组待转账的直付单，旧转账迟到账只进入本人余额。已付款订单不会再次付款。`,
          okText: '确认使用余额', cancelText: '返回核对',
          onOk: () => settle(isCurrent()), onCancel: () => settle(false), onClose: () => settle(false)
        });
      });
      modal = undefined;
      if (!accepted || !isCurrent()) return;
    }
    return { group, payNo: pay?.payNo };
  }

  async function assertBalanceSwitch(consent: BalanceConsent) {
    if (!consent.group) return;
    const pay = await fetchCurrentWalletPay(consent.group);
    const blocked = balancePaymentBlockedReason(pay);
    if (blocked) throw new Error(blocked);
    if (pay?.payNo !== consent.payNo) throw new Error('钱包支付单已变化，请重新选择余额并确认');
  }

  async function recoverBalancePayment(group: string | undefined) {
    if (!group) return;
    // 单笔失败可能回滚切换，组付款失败可能已关闭原单；两者均回读，绝不自动重付。
    return Promise.allSettled([fetchCurrentWalletPay(group), fetchOrderGroupPayResult(group)]);
  }
  return { confirmBalanceSwitch, assertBalanceSwitch, recoverBalancePayment };
}
