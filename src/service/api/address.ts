import { realUserRequest, RequestError } from '@/service/request';
import { requireArray } from './page';

/** 两个地址入口共用校验；保留现有省份必填要求，不把国际电话限制为 11 位。 */
export function prepareAddress(params: Api.RealAddress.AddressSaveParams) {
  const normalized = { ...params };
  const limits = { receiverName: 64, receiverPhone: 32, country: 64, province: 64, city: 64,
    district: 64, detailAddress: 255, postalCode: 16, idCardNo: 64, tag: 32 } as const;
  for (const key of Object.keys(limits) as Array<keyof typeof limits>) {
    const value = params[key];
    if (typeof value === 'string') normalized[key] = value.trim();
  }
  if (![normalized.receiverName, normalized.receiverPhone, normalized.country, normalized.province, normalized.detailAddress].every(Boolean)) {
    return { params: normalized, error: '请完善地址必填信息，不能只填写空格' };
  }
  if ((Object.keys(limits) as Array<keyof typeof limits>).some(key => (normalized[key]?.length || 0) > limits[key])) {
    return { params: normalized, error: '地址字段超过长度限制：姓名、地区最多64字，电话32字，详细地址255字，邮编16字，标签32字' };
  }
  return { params: normalized, error: '' };
}

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
  return requireArray<Api.RealAddress.UserAddressVO>(list, '地址列表').map(toAddressRecord);
}

export async function createAddress(params: Api.RealAddress.AddressSaveParams) {
  const id = await realUserRequest.post<string | number, Api.RealAddress.AddressSaveParams>('/addresses/create', params);
  return confirmedAddressId(id);
}

export async function updateAddress(params: Api.RealAddress.AddressSaveParams) {
  if (params.id === undefined || params.id === null || params.id === '') {
    throw new Error('编辑地址缺少地址 ID');
  }
  const id = await realUserRequest.put<string | number, Api.RealAddress.AddressSaveParams>('/addresses/update', params);
  return confirmedAddressId(id);
}

function confirmedAddressId(id: string | number) {
  if ((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id))) return id;
  throw new RequestError('未取得可核对的地址编号，请先读取地址列表核实，勿重复新增', { code: 'UNKNOWN_OPERATION_RESULT' });
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
