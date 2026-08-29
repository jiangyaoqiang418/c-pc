import { realOrderRequest } from '@/service/request';

export function fetchAvailableFlashSaleSessions(options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealFlashSale.SessionDTO[]>('/flash-sale/sessions/available', options);
}

export function fetchMyFlashSaleEnrollments(options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealFlashSale.EnrollmentDTO[]>('/flash-sale/my', options);
}

export function enrollFlashSale(p: Api.RealFlashSale.EnrollParams) {
  return realOrderRequest.post<string, Api.RealFlashSale.EnrollParams>('/flash-sale/enroll', p);
}

export async function cancelFlashSaleEnrollment(sessionId: string, productId: string) {
  await realOrderRequest.delete<string>('/flash-sale/enroll', { params: { sessionId, productId } });
  return { ok: true };
}
