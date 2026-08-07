declare namespace Api.RealKyc {
  type Status = 'PENDING' | 'PASSED' | 'REJECTED' | string;

  interface KycVO {
    id: string | number;
    realName?: string;
    idType?: 'ID_CARD' | 'PASSPORT' | string;
    idNo?: string;
    idCardFront?: string;
    idCardBack?: string;
    holdingPhoto?: string;
    nationality?: string;
    expireAt?: string | number;
    status: Status;
    reviewRemark?: string;
    submittedAt?: string | number;
    reviewedAt?: string | number;
  }

  interface SubmitParams {
    realName: string;
    idType: 'ID_CARD' | 'PASSPORT';
    idNo: string;
    idCardFront: string;
    idCardBack?: string;
    holdingPhoto?: string;
    nationality?: string;
  }
}
