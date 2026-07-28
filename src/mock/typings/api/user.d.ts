/**
 * 4.3 用户管理模块 API 类型（R-DATA-11：C 端用户池，与后台 accounts 完全独立）。
 *
 * 顾客与买手统一表，isBuyer 标识买手身份。
 * 同一邮箱仅有一个 user 记录；买手由 isBuyer=true + kycStatus='approved' 派生。
 */
declare namespace Api {
  namespace User {
    type KycStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired';
    type Status = '1' | '2'; // 启用 / 冻结
    type VipLevel = 'VIP0' | 'VIP1' | 'VIP2';

    interface UserRecord {
      id: number;
      email: string;
      nickname: string;
      avatar?: string;
      phone?: string;
      isBuyer: boolean;
      kycStatus: KycStatus;
      status: Status;
      points: number;
      vipLevel: VipLevel;
      tagIds: number[];
      registeredAt: string;
      lastActiveAt?: string;
      remark?: string;
      /**
       * 出金须人工审核（顾客黑名单标志位 · R-MOD-11 V2.0）
       * 加入顾客黑名单时设 true；移出时设 false；
       * 4.16 提现模块完整流程上线后，所有 WITHDRAW_OUT 申请须按此标志判定是否进入人工审核队列。
       */
      withdrawRequiresAudit?: boolean;
    }

    type SearchParams = Partial<{
      keyword: string;
      isBuyer: '' | 'true' | 'false';
      vipLevels: VipLevel[];
      kycStatuses: KycStatus[];
      statuses: Status[];
      tagIds: number[];
      registeredFrom: string;
      registeredTo: string;
    }> &
      Api.Common.CommonSearchParams;

    type UserList = Api.Common.PaginatingQueryRecord<UserRecord>;

    interface Tag {
      id: number;
      name: string;
      color: string; // 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan' | 'magenta' | 'gold'
      description?: string;
      userCount: number;
    }

    interface TagCreateParams {
      name: string;
      color: string;
      description?: string;
    }
    interface TagUpdateParams extends Partial<TagCreateParams> {
      id: number;
    }

    interface GroupFilters {
      keyword?: string;
      isBuyer?: '' | 'true' | 'false';
      vipLevels?: VipLevel[];
      kycStatuses?: KycStatus[];
      tagIds?: number[];
      registeredFrom?: string;
      registeredTo?: string;
    }

    interface Group {
      id: number;
      name: string;
      type: 'static' | 'dynamic';
      filters?: GroupFilters;
      userIds?: number[];
      userCount: number;
      createdAt: string;
      remark?: string;
    }

    interface GroupCreateParams {
      name: string;
      type: 'static' | 'dynamic';
      filters?: GroupFilters;
      userIds?: number[];
      remark?: string;
    }

    /** 购买历史 mock */
    interface PurchaseHistory {
      id: string;
      orderNo: string;
      title: string;
      amount: string;
      status: 'completed' | 'shipping' | 'cancelled' | 'aftersale';
      time: string;
    }

    interface WalletSummary {
      address: string; // 链上钱包地址（占位）
      available: string;
      nonWithdrawable: string;
      lockedFinance: string;
      frozenOrder: string;
      frozenRisk: string;
    }

    interface Review {
      id: number;
      from: 'self-as-customer' | 'self-as-buyer'; // 评价来源
      orderNo: string;
      rating: 'good' | 'bad';
      content: string;
      time: string;
    }
  }
}
