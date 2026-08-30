declare namespace Api.RealPurchase {
  type Id = string | number;

  type Record = Omit<
    Api.PurchaseRequest.PurchaseRequest,
    'id' | 'customerId' | 'categoryId' | 'pushedToBuyerIds' | 'claimedBy' | 'relatedOrderId' | 'aftersaleType'
  > & {
    id: Id;
    aftersaleType: Api.RealProduct.DisplayAfterSaleType;
    rawAfterSaleType?: string;
    customerId: Id;
    categoryId: Id;
    pushedToBuyerIds: Id[];
    claimedBy?: Id;
    relatedOrderId?: Id;
    reviewComment?: string;
    reviewedAt?: string;
    assignedBy?: Id;
  };

  type DisplayRecord = Api.PurchaseRequest.PurchaseRequest | Record;

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
    reviewComment?: string;
    reviewedAt?: string | number;
    assignedBy?: string;
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
    addressId: string | number;
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
