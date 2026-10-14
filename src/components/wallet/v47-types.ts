/** Read-only data for the development visual entry, never a wallet API fallback. */
export interface WalletVisualFixture {
  account?: Api.RealWallet.Account;
  totalAssets?: string;
  today?: { depositIn?: string; withdrawOut?: string };
  recentTxns: Api.RealWallet.Ledger[];
  showProductionDetails?: boolean;
}
