declare namespace Api.RealWallet {
  interface WalletBucketVO {
    type: string;
    name?: string;
    description?: string;
    amount: string | number;
    ratio?: string | number;
  }

  interface WalletVO {
    total: string | number;
    currency?: string;
    todayIn?: string | number;
    todayOut?: string | number;
    distribution?: WalletBucketVO[];
  }
}
