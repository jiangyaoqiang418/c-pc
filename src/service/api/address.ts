import { realUserRequest } from '@/service/request';

function toAddressRecord(dto: Api.RealAddress.UserAddressVO): Api.RealAddress.AddressRecord {
  return {
    id: dto.id,
    receiverName: dto.receiverName,
    receiverPhone: dto.receiverPhone,
    country: dto.country,
    province: dto.province || '',
    city: dto.city || '',
    district: dto.district || '',
    detail: dto.detailAddress,
    postalCode: dto.postalCode,
    idCardNo: dto.idCardNo,
    isDefault: Boolean(dto.defaultFlag),
    tag: dto.tag,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt
  };
}

export async function fetchMyAddresses(options: { signal?: AbortSignal } = {}) {
  const list = await realUserRequest.get<Api.RealAddress.UserAddressVO[]>('/addresses/list', { signal: options.signal });
  return list.map(toAddressRecord);
}

export async function createAddress(params: Api.RealAddress.AddressSaveParams) {
  const id = await realUserRequest.post<string | number, Api.RealAddress.AddressSaveParams>('/addresses/create', params);
  return fetchAddressDetail(id);
}

export async function updateAddress(params: Api.RealAddress.AddressSaveParams) {
  if (params.id === undefined || params.id === null || params.id === '') {
    throw new Error('编辑地址缺少地址 ID');
  }
  await realUserRequest.put<void, Api.RealAddress.AddressSaveParams>('/addresses/update', params);
  return fetchAddressDetail(params.id);
}

export function setDefaultAddress(id: string | number) {
  return realUserRequest.put<void, { id: string | number }>('/addresses/default', { id });
}

export function deleteAddress(id: string | number) {
  return realUserRequest.delete<void>('/addresses/delete', { params: { id } });
}

export async function fetchAddressDetail(id: string | number) {
  const detail = await realUserRequest.get<Api.RealAddress.UserAddressVO>('/addresses/detail', { params: { id } });
  return toAddressRecord(detail);
}
