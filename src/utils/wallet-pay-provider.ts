import type { WalletPayOrder } from '@/service/api/wallet-pay';

interface EvmProvider {
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  providers?: EvmProvider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface TronWeb {
  ready?: boolean;
  fullNode?: { host?: string };
  defaultAddress?: { base58?: string };
  isAddress?(address: string): boolean;
  contract(): { at(address: string): Promise<{ transfer(to: string, amount: string): { send(options: { feeLimit: number }): Promise<unknown> } }> };
}

interface TronProvider {
  isTronLink?: boolean;
  tronWeb?: TronWeb | false;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface WalletOption { key: string; label: string }
export interface ConnectedWallet { account: string; sendTransfer(): Promise<string> }

function injectedWallets() {
  return window as Window & {
    ethereum?: EvmProvider;
    okxwallet?: { ethereum?: EvmProvider };
    tron?: TronProvider;
    tronLink?: TronProvider;
  };
}

function evmProviders(): Array<{ key: string; label: string; provider: EvmProvider }> {
  const injected = injectedWallets();
  const candidates = [
    ...(injected.ethereum?.providers || []),
    injected.okxwallet?.ethereum,
    injected.ethereum
  ];
  const seen = new Set<EvmProvider>();
  return candidates.filter((provider): provider is EvmProvider => !!provider && typeof provider.request === 'function')
    .filter(provider => { if (seen.has(provider)) return false; seen.add(provider); return true; })
    .map((provider, index) => ({
      key: `evm-${index}`,
      label: provider.isOkxWallet ? 'OKX Wallet' : provider.isMetaMask ? 'MetaMask' : '浏览器 EVM 钱包',
      provider
    }));
}

function tronProvider() {
  const injected = injectedWallets();
  const provider = injected.tron?.isTronLink ? injected.tron : injected.tronLink;
  return provider && typeof provider.request === 'function' ? provider : undefined;
}

export function availableWallets(chain: string): WalletOption[] {
  if (chain === 'TRON') return tronProvider() ? [{ key: 'tronlink', label: 'TronLink' }] : [];
  if (chain === 'ETH' || chain === 'BSC') return evmProviders().map(({ key, label }) => ({ key, label }));
  return [];
}

function requireRawAmount(pay: WalletPayOrder) {
  if (!/^\d+$/.test(pay.rawAmount) || BigInt(pay.rawAmount) <= 0n || BigInt(pay.rawAmount) >= (1n << 256n)) {
    throw new Error('链上转账金额无效，请返回订单核对');
  }
}

function matchesEvmChain(value: unknown, expected: bigint) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return false;
  return BigInt(value) === expected;
}

async function connectEvm(pay: WalletPayOrder, walletKey: string): Promise<ConnectedWallet> {
  const provider = evmProviders().find(item => item.key === walletKey)?.provider;
  if (!provider) throw new Error('所选钱包不可用，请刷新页面后重试');
  if (!/^0x[0-9a-fA-F]{40}$/.test(pay.toAddress) || !/^0x[0-9a-fA-F]{40}$/.test(pay.tokenContract)) {
    throw new Error('收款地址或 USDT 合约地址无效，请停止转账');
  }
  if (!/^\d+$/.test(pay.network) || BigInt(pay.network) <= 0n) throw new Error('支付网络配置无效，请停止转账');
  requireRawAmount(pay);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof account !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('未取得有效的钱包账户');
  const expectedChain = BigInt(pay.network);
  const chainId = `0x${expectedChain.toString(16)}`;
  if (!matchesEvmChain(await provider.request({ method: 'eth_chainId' }), expectedChain)) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
  if (!matchesEvmChain(await provider.request({ method: 'eth_chainId' }), expectedChain)) throw new Error('钱包网络仍与支付单不一致，请手动切换后重试');
  return {
    account,
    async sendTransfer() {
      const currentAccounts = await provider.request({ method: 'eth_accounts' });
      if (!Array.isArray(currentAccounts) || typeof currentAccounts[0] !== 'string'
        || currentAccounts[0].toLowerCase() !== account.toLowerCase()) throw new Error('钱包账户已变化，请重新连接后核对');
      if (!matchesEvmChain(await provider.request({ method: 'eth_chainId' }), expectedChain)) throw new Error('钱包网络已变化，请重新连接后核对');
      const encodedAddress = pay.toAddress.slice(2).toLowerCase().padStart(64, '0');
      const encodedAmount = BigInt(pay.rawAmount).toString(16).padStart(64, '0');
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{
        from: account, to: pay.tokenContract, value: '0x0', data: `0xa9059cbb${encodedAddress}${encodedAmount}`
      }] });
      if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('钱包未返回有效交易哈希，请先核对钱包交易记录，勿重复转账');
      return hash;
    }
  };
}

const tronChainId: Record<string, string> = {
  mainnet: '0x2b6653dc', shasta: '0x94a9059e', nile: '0xcd8690dc'
};

function tronNetwork(tronWeb: TronWeb): string | undefined {
  const host = tronWeb.fullNode?.host;
  if (!host) return;
  let hostname = '';
  try { hostname = new URL(host).hostname.toLowerCase(); } catch { return; }
  if (hostname === 'api.trongrid.io') return 'mainnet';
  if (hostname === 'api.shasta.trongrid.io') return 'shasta';
  if (hostname === 'nile.trongrid.io') return 'nile';
}

async function connectTron(pay: WalletPayOrder): Promise<ConnectedWallet> {
  const provider = tronProvider();
  if (!provider) throw new Error('未检测到 TronLink，请安装并解锁钱包后重试');
  const network = pay.network.toLowerCase();
  if (!tronChainId[network]) throw new Error('TRON 支付网络未识别，请停止转账');
  requireRawAmount(pay);
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4200) throw error;
    const legacy = await provider.request({ method: 'tron_requestAccounts' });
    if ((legacy as { code?: number })?.code !== 200) throw new Error('TronLink 未授权当前网站');
  }
  let tronWeb = provider.tronWeb || undefined;
  const account = Array.isArray(accounts) ? accounts[0] : tronWeb?.defaultAddress?.base58;
  if (!tronWeb?.ready || typeof account !== 'string' || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(account)) {
    throw new Error('TronLink 尚未连接有效账户');
  }
  if (!tronWeb.isAddress?.(pay.toAddress) || !tronWeb.isAddress(pay.tokenContract)) {
    throw new Error('TRON 收款地址或 USDT 合约地址无效，请停止转账');
  }
  if (tronNetwork(tronWeb) !== network) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: tronChainId[network] }] });
    tronWeb = provider.tronWeb || undefined;
  }
  if (!tronWeb?.ready || tronNetwork(tronWeb) !== network) {
    throw new Error('无法确认 TronLink 当前网络与支付单一致，请手动切换官方网络后重试');
  }
  return {
    account,
    async sendTransfer() {
      const activeWeb = provider.tronWeb || undefined;
      if (!activeWeb?.ready || activeWeb.defaultAddress?.base58 !== account || tronNetwork(activeWeb) !== network) {
        throw new Error('TronLink 账户或网络已变化，请重新连接后核对');
      }
      const contract = await activeWeb.contract().at(pay.tokenContract);
      const hash = await contract.transfer(pay.toAddress, pay.rawAmount).send({ feeLimit: 100_000_000 });
      if (typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) {
        throw new Error('TronLink 未返回有效交易哈希，请先核对钱包交易记录，勿重复转账');
      }
      return hash;
    }
  };
}

export function connectPaymentWallet(pay: WalletPayOrder, walletKey: string): Promise<ConnectedWallet> {
  if (pay.chain === 'TRON') return connectTron(pay);
  if (pay.chain === 'ETH' || pay.chain === 'BSC') return connectEvm(pay, walletKey);
  throw new Error('当前链暂不支持浏览器钱包支付');
}

export function walletRequestRejected(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 4001;
}
