/**
 * 4.5 买手管理模块 API 类型（R-DATA-11：与 Api.User.UserRecord 通过 userId 关联）。
 *
 * 钱包金额一律 string 传输（R-DATA-1），UI 展示用 formatAmount。
 */
declare namespace Api {
  namespace Buyer {
    /** 钱包账户结构（5 余额项） */
    interface Wallet {
      available: string;
      depositAvailable: string;
      depositGuaranteed: string;
      frozenOrder: string;
      interest: string;
    }

    /** 交易统计 */
    interface TransactionStats {
      orderTotal: number;
      orderCompleted: number;
      completionRate: number;
      goodReviewRate: number;
      complaintRate: number;
      avgShipHours: number;
      unfulfilledCount: number;
    }

    /** 买手画像（与 UserRecord 用 userId 关联） */
    interface BuyerProfile {
      userId: number;
      wallet: Wallet;
      stats: TransactionStats;
      productCount: number;
      lastDepositChange?: { delta: string; reason: string; time: string };
    }

    /** 买手列表行 = UserRecord 扩展画像 */
    interface BuyerListRow extends Api.User.UserRecord {
      profile: BuyerProfile;
    }

    type SearchParams = Partial<{
      keyword: string;
      kycStatuses: Api.User.KycStatus[];
      vipLevels: Api.User.VipLevel[];
      statuses: Api.User.Status[];
      depositMin: number;
      depositMax: number;
      completionRateMin: number;
      goodReviewRateMin: number;
    }> &
      Api.Common.CommonSearchParams;

    type BuyerList = Api.Common.PaginatingQueryRecord<BuyerListRow>;

    interface DepositAdjustParams {
      userId: number;
      delta: string;
      type: 'pledge' | 'penalty' | 'refund' | 'topup';
      reason: string;
    }

    /** 上架商品 mini */
    interface ProductMini {
      id: number;
      title: string;
      price: string;
      stock: number;
      status: 'on-shelf' | 'off-shelf' | 'frozen';
      createdAt: string;
    }
  }
}
