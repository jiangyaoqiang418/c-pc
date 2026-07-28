/**
 * 4.4 VIP 模块 API 类型（R-DATA-10：权益维度写死，阈值/数值可配）。
 */
declare namespace Api {
  namespace Vip {
    type Audience = 'customer' | 'buyer';
    type Level = 'VIP0' | 'VIP1' | 'VIP2';

    /** 顾客权益维度（写死 5 维） */
    interface CustomerBenefits {
      interestRateBonus: number; // 利率上浮 %
      purchaseConcurrent: number; // 求购大厅同时存在数
      purchasePriority: number; // 求购大厅优先级
      aftersaleResponse: number; // 售后响应优先级（0 标准 / 1 较高 / 2 高）
      withdrawFeeDiscount: number; // 出金手续费减免 %
    }

    /** 买手权益维度（写死 3 维） */
    interface BuyerBenefits {
      pushIntervalMinutes: number; // 推送间隔分钟（越小越好）
      transactionFeeDiscount: number; // 交易手续费减免 %
      productSlotsMax: number; // 在架商品上限
    }

    interface LevelConfig {
      audience: Audience;
      level: Level;
      label: string; // 写死
      threshold: number; // 可配：积分阈值（下限）
      customerBenefits?: CustomerBenefits;
      buyerBenefits?: BuyerBenefits;
    }

    interface SaveConfigParams {
      configs: LevelConfig[];
    }

    /** 查询某用户当前权益 */
    interface LevelOfResult {
      userId: number;
      audience: Audience;
      level: Level;
      points: number;
      nextThreshold?: number;
      benefits: CustomerBenefits | BuyerBenefits;
    }
  }
}
