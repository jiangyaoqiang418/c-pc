declare namespace Api.RealPurchase {
  type DemandStatus = string;

  interface PurchaseDemandVO {
    id: string;
    title: string;
    categoryId: string;
    description?: string;
    buyerId?: string;
    budget?: string | number;
    expectDeliveryDays?: number;
    overseasClearance?: boolean;
    afterSaleType?: string;
    afterSaleTypeText?: string;
    demandNote?: string;
    status?: DemandStatus;
    statusText?: string;
    expireAt?: string | number;
    takenBy?: string;
    takenAt?: string | number;
    orderId?: string;
    images?: string[];
    createdAt?: string | number;
  }

  interface PurchaseDemandCreateParams {
    title: string;
    categoryId: string | number;
    description?: string;
    budget: number;
    expectDeliveryDays: number;
    overseasClearance?: boolean;
    afterSaleType: Api.RealProduct.AfterSaleType;
    demandNote?: string;
    images?: string[];
  }

  interface PurchaseDemandPageQuery {
    pageNo?: number;
    pageSize?: number;
    categoryId?: string | number;
    keyword?: string;
  }
}
