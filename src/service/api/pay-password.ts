import { realUserRequest } from '@/service/request';

export interface PayPasswordStatus {
  hasSet: boolean;
  locked: boolean;
  lockedUntil?: string | number | null;
  remainingAttempts: number;
  updatedAt?: string | number;
}

export function fetchPayPasswordStatus() {
  return realUserRequest.get<PayPasswordStatus>('/auth/pay-password/status');
}

export function setPayPassword(params: { loginPassword: string; payPassword: string; confirmPayPassword: string }) {
  return realUserRequest.post<void, typeof params>('/auth/pay-password/set', params, { showError: false });
}

export function updatePayPassword(params: { oldPayPassword: string; payPassword: string; confirmPayPassword: string }) {
  return realUserRequest.put<void, typeof params>('/auth/pay-password/update', params);
}

export function resetPayPassword(params: { loginPassword: string; payPassword: string; confirmPayPassword: string }) {
  return realUserRequest.put<void, typeof params>('/auth/pay-password/reset', params, { showError: false });
}
