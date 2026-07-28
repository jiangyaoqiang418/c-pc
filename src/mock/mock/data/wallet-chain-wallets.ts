/**
 * 平台链上钱包内存池（R-DATA-16 链上 U 真实余额，与站内 U₊ 严格隔离）。
 *
 * 4 个 seed 钱包：主收款 / 主出金 / 储备 / 测试（停用）。
 * 仅 /wallet/chain/sync 更新 balanceOnChain；不接 Txn 计算链路。
 */

type ChainWallet = Api.Wallet.ChainWallet;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

/**
 * 生成伪 TRC20 平台钱包地址（R-MOCK-8 V2.0）：
 *   T + 33 位 base58 字符（去除 0/O/I/l），尾部留 suffix 便于人眼区分。
 *   通过 mock/api/wallet.ts 的 TRC20_RE 正则校验。
 */
function trc20(suffix: string): string {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const need = 33 - suffix.length;
  const seed = suffix.length * 31 + suffix.charCodeAt(0);
  let body = '';
  for (let i = 0; i < need; i += 1) {
    body += base58[(seed * 11 + i * 17) % base58.length];
  }
  return `T${body}${suffix}`;
}

export const CHAIN_WALLETS: ChainWallet[] = [
  {
    id: nextId(),
    name: '主收款钱包',
    address: trc20('IN01'),
    chain: 'TRON',
    purpose: 'income',
    balanceOnChain: '12800000.00',
    balanceLastSyncAt: '2026-05-28T08:30:00+08:00',
    status: '1',
    risk: 'normal',
    createdAt: '2025-09-01T10:00:00+08:00',
    remark: '默认接收用户入金'
  },
  {
    id: nextId(),
    name: '主出金钱包',
    address: trc20('OUT01'),
    chain: 'TRON',
    purpose: 'outcome',
    balanceOnChain: '200000.00',
    balanceLastSyncAt: '2026-05-28T08:30:00+08:00',
    status: '1',
    risk: 'warning',
    createdAt: '2025-09-01T10:00:00+08:00',
    remark: '余额偏低，请补充'
  },
  {
    id: nextId(),
    name: '冷储备钱包',
    address: trc20('RSV01'),
    chain: 'TRON',
    purpose: 'reserve',
    balanceOnChain: '5000000.00',
    balanceLastSyncAt: '2026-05-25T20:00:00+08:00',
    status: '1',
    risk: 'normal',
    createdAt: '2025-09-01T10:00:00+08:00',
    remark: '冷钱包；定期同步'
  },
  {
    id: nextId(),
    name: '测试钱包',
    address: trc20('TEST'),
    chain: 'TRON',
    purpose: 'income',
    balanceOnChain: '0.00',
    balanceLastSyncAt: '2026-04-10T08:00:00+08:00',
    status: '2',
    risk: 'normal',
    createdAt: '2025-09-01T10:00:00+08:00',
    remark: '已停用'
  }
];

export function findChainWallet(id: number): ChainWallet | undefined {
  return CHAIN_WALLETS.find(w => w.id === id);
}

export function appendChainWallet(w: Omit<ChainWallet, 'id'>): ChainWallet {
  const next: ChainWallet = { id: nextId(), ...w };
  CHAIN_WALLETS.push(next);
  return next;
}

export function chainTotal(): string {
  let sum = 0;
  CHAIN_WALLETS.forEach(w => {
    if (w.status === '1') sum += Number(w.balanceOnChain);
  });
  return sum.toFixed(2);
}
