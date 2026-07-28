/**
 * 收货地址 mock API（Phase 1）。
 */
import {
  ADDRESSES,
  AddressRecord,
  appendAddress,
  findAddressesByUser,
  findDefaultAddress,
  removeAddress,
  setDefaultAddress
} from '../mock/data/addresses';
import { delay } from '../utils/mock-delay';

export type { AddressRecord } from '../mock/data/addresses';

export async function fetchMyAddresses(userId: number): Promise<AddressRecord[]> {
  return delay(findAddressesByUser(userId));
}

export async function fetchDefaultAddress(userId: number): Promise<AddressRecord | undefined> {
  return delay(findDefaultAddress(userId));
}

export interface CreateAddressParams {
  userId: number;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault?: boolean;
}

export async function createAddress(p: CreateAddressParams): Promise<AddressRecord> {
  return delay(
    appendAddress({
      userId: p.userId,
      receiverName: p.receiverName,
      receiverPhone: p.receiverPhone,
      province: p.province,
      city: p.city,
      district: p.district,
      detail: p.detail,
      isDefault: !!p.isDefault,
      createdAt: new Date().toISOString()
    }),
    400
  );
}

export async function setDefault(addressId: number): Promise<{ ok: boolean }> {
  const r = setDefaultAddress(addressId);
  return delay({ ok: !!r }, 200);
}

export async function deleteAddress(addressId: number): Promise<{ ok: boolean }> {
  return delay({ ok: removeAddress(addressId) }, 200);
}

void ADDRESSES;
