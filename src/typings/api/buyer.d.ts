declare namespace Api.RealBuyer {
  type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

  interface BuyerApplyParams {
    realName: string;
    contact: string;
    reason: string;
  }

  interface BuyerApplicationVO {
    id: string | number;
    userId: string | number;
    realName: string;
    contact: string;
    reason: string;
    status: ApplicationStatus;
    reviewRemark?: string;
    reviewerId?: string | number;
    appliedAt?: string | number;
    reviewedAt?: string | number;
  }
}
