export interface WalletTransferProgress {
  started: boolean;
  txHash?: string;
  fromAddress?: string;
}

function storageKey(userId: string | number, payNo: string) {
  return `cpc:wallet-pay:transfer:${String(userId)}:${payNo}`;
}

/** 请求钱包签名前先落标记；拿到哈希后立刻覆盖，以防刷新时重复转账。 */
export function saveWalletTransferProgress(userId: string | number, payNo: string, progress: WalletTransferProgress) {
  localStorage.setItem(storageKey(userId, payNo), JSON.stringify(progress));
}

/** 损坏记录不当作“未转账”，必须人工核对后才能重试。 */
export function readWalletTransferProgress(userId: string | number, payNo: string): WalletTransferProgress | undefined {
  const raw = localStorage.getItem(storageKey(userId, payNo));
  if (raw === null) return;
  let progress: WalletTransferProgress;
  try { progress = JSON.parse(raw) as WalletTransferProgress; } catch { throw new Error('本机转账记录无法读取，请先核对钱包交易，暂不可再次转账'); }
  if (!progress || progress.started !== true
    || (progress.txHash !== undefined && (typeof progress.txHash !== 'string' || !progress.txHash.trim()))
    || (progress.fromAddress !== undefined && (typeof progress.fromAddress !== 'string' || !progress.fromAddress.trim()))) {
    throw new Error('本机转账记录不完整，请先核对钱包交易，暂不可再次转账');
  }
  return progress;
}

export function clearWalletTransferProgress(userId: string | number, payNo: string) {
  localStorage.removeItem(storageKey(userId, payNo));
}
