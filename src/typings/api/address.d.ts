declare namespace Api.RealAddress {
  interface UserAddressVO {
    id: string | number;
    receiverName: string;
    receiverPhone: string;
    country: string;
    countryCode: string;
    province?: string;
    provinceCode?: string;
    city?: string;
    cityCode?: string;
    district?: string;
    districtCode?: string;
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
    countryCode: string;
    province: string;
    provinceCode?: string;
    city: string;
    cityCode?: string;
    district: string;
    districtCode?: string;
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
    countryCode: string;
    provinceCode?: string;
    cityCode?: string;
    districtCode?: string;
    province?: string;
    city?: string;
    district?: string;
    detailAddress: string;
    postalCode?: string;
    idCardNo?: string;
    defaultFlag?: boolean;
    tag?: string;
  }

  interface CountryVO {
    code: string;
    name: string;
    enName?: string;
    phoneCode?: string;
    hasRegion: boolean;
  }

  interface RegionVO {
    code: string;
    name: string;
    level: number;
    parentCode?: string | null;
    leaf: boolean;
  }
}
