declare namespace Api.ReferenceRates {
  interface Quote {
    asset: 'USDT' | 'USDC';
    quoteCurrency: 'CNY';
    rate: string | null;
    source: 'OKX';
    methodology: string;
    status: 'FRESH' | 'STALE' | 'UNAVAILABLE';
    fetchedAt: string | null;
    marketAt: string | null;
    expiresAt: string | null;
  }
}
