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
    idCardFrontFileId?: string | number;
    idCardBackFileId?: string | number;
    holdingPhotoFileId?: string | number;
    photoUrlExpireAt?: string | number;
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
    idCardFrontFileId: string | number;
    idCardBackFileId?: string | number;
    holdingPhotoFileId?: string | number;
    nationality?: string;
  }

  interface FileUploadResult {
    id: string | number;
    scene?: string;
    url?: string;
    privateAccess?: boolean;
    expireAt?: string | number;
    expireSeconds?: number;
  }

  interface FileAccessResult {
    fileId: string | number;
    scene?: string;
    url: string;
    privateAccess?: boolean;
    expireAt?: string | number;
    expireSeconds?: number;
  }
}
