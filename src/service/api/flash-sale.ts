import { realOrderRequest } from '@/service/request';
import { requireArray } from './page';

export async function fetchAvailableFlashSaleSessions(options: { signal?: AbortSignal } = {}) {
  const list = await realOrderRequest.get<Api.RealFlashSale.SessionDTO[]>('/flash-sale/sessions/available', options);
  return requireArray<Api.RealFlashSale.SessionDTO>(list, '可用秒杀场次');
}

export async function fetchMyFlashSaleEnrollments(options: { signal?: AbortSignal } = {}) {
  const list = await realOrderRequest.get<Api.RealFlashSale.EnrollmentDTO[]>('/flash-sale/my', options);
  return requireArray<Api.RealFlashSale.EnrollmentDTO>(list, '我的秒杀报名');
}

export function enrollFlashSale(p: Api.RealFlashSale.EnrollParams) {
  return realOrderRequest.post<string, Api.RealFlashSale.EnrollParams>('/flash-sale/enroll', p);
}

export async function cancelFlashSaleEnrollment(sessionId: string, productId: string) {
  await realOrderRequest.delete<string>('/flash-sale/enroll', { params: { sessionId, productId } });
  return { ok: true };
}
