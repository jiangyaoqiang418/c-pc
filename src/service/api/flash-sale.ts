import { realOrderRequest } from '@/service/request';

export function fetchAvailableFlashSaleSessions() {
  return realOrderRequest.get<Api.RealFlashSale.SessionDTO[]>('/flash-sale/sessions/available');
}

export function fetchMyFlashSaleEnrollments() {
  return realOrderRequest.get<Api.RealFlashSale.EnrollmentDTO[]>('/flash-sale/my');
}

export function enrollFlashSale(p: Api.RealFlashSale.EnrollParams) {
  return realOrderRequest.post<string, Api.RealFlashSale.EnrollParams>('/flash-sale/enroll', p);
}

export async function cancelFlashSaleEnrollment(sessionId: string, productId: string) {
  await realOrderRequest.delete<string>('/flash-sale/enroll', { params: { sessionId, productId } });
  return { ok: true };
}
