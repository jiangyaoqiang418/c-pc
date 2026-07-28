/**
 * 收货地址 mock seed（Phase 1）。
 *
 * 每个顾客用户 3 条收货地址（本人 / 家人 / 公司），第一条 isDefault=true。
 * 买手身份不强求收货地址（仍可下单代购，但不在 seed 中）。
 */
import { USERS } from './users';

export interface AddressRecord {
  id: number;
  userId: number;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
  createdAt: string;
}

const SEED_TEMPLATES: { receiverName: string; province: string; city: string; district: string; detail: string }[] = [
  { receiverName: '本人', province: '北京市', city: '北京市', district: '朝阳区', detail: 'CBD 国贸三期 88 号 1308 室' },
  { receiverName: '家人', province: '上海市', city: '上海市', district: '浦东新区', detail: '陆家嘴环路 1000 号 2502 室' },
  { receiverName: '公司', province: '广东省', city: '深圳市', district: '南山区', detail: '深南大道 9988 号科技园 A 栋 1502 室' }
];

export const ADDRESSES: AddressRecord[] = [];
let cursor = 0;

USERS.filter(u => !u.isBuyer).forEach(u => {
  SEED_TEMPLATES.forEach((t, i) => {
    cursor += 1;
    ADDRESSES.push({
      id: cursor,
      userId: u.id,
      receiverName: `${t.receiverName}·${u.nickname}`,
      receiverPhone: u.phone || '13800000000',
      province: t.province,
      city: t.city,
      district: t.district,
      detail: t.detail,
      isDefault: i === 0,
      createdAt: new Date('2026-01-01').toISOString()
    });
  });
});

export function findAddressesByUser(userId: number): AddressRecord[] {
  return ADDRESSES.filter(a => a.userId === userId);
}

export function findDefaultAddress(userId: number): AddressRecord | undefined {
  return ADDRESSES.find(a => a.userId === userId && a.isDefault);
}

export function appendAddress(a: Omit<AddressRecord, 'id'>): AddressRecord {
  cursor += 1;
  const next: AddressRecord = { id: cursor, ...a };
  if (a.isDefault) {
    ADDRESSES.forEach(x => {
      if (x.userId === a.userId) x.isDefault = false;
    });
  }
  ADDRESSES.push(next);
  return next;
}

export function setDefaultAddress(addressId: number): AddressRecord | undefined {
  const target = ADDRESSES.find(a => a.id === addressId);
  if (!target) return undefined;
  ADDRESSES.forEach(a => {
    if (a.userId === target.userId) a.isDefault = false;
  });
  target.isDefault = true;
  return target;
}

export function removeAddress(addressId: number): boolean {
  const idx = ADDRESSES.findIndex(a => a.id === addressId);
  if (idx < 0) return false;
  ADDRESSES.splice(idx, 1);
  return true;
}
