declare namespace Api.RealAddress {
  interface UserAddressVO {
    id: string | number;
    receiverName: string;
    receiverPhone: string;
    country: string;
    province?: string;
    city?: string;
    district?: string;
    detailAddress: string;
    postalCode?: string;
    idCardNo?: string;
    defaultFlag?: boolean;
    tag?: string;
    createdAt?: string | number;
    updatedAt?: string | number;
  }

  interface AddressRecord {
    id: string | number;
    receiverName: string;
    receiverPhone: string;
    country: string;
    province: string;
    city: string;
    district: string;
    detail: string;
    postalCode?: string;
    idCardNo?: string;
    isDefault: boolean;
    tag?: string;
    createdAt?: string | number;
    updatedAt?: string | number;
  }

  interface AddressSaveParams {
    id?: string | number;
    receiverName: string;
    receiverPhone: string;
    country: string;
    province?: string;
    city?: string;
    district?: string;
    detailAddress: string;
    postalCode?: string;
    idCardNo?: string;
    defaultFlag?: boolean;
    tag?: string;
  }
}
