import { realOrderRequest } from '@/service/request';
import { requireArray } from './page';
import { exactTransactionAmount } from '@/components/wallet/decimal-amount';

export async function fetchAvailableFlashSaleSessions(options: { signal?: AbortSignal } = {}) {
  const list = await realOrderRequest.get<Api.RealFlashSale.SessionDTO[]>('/flash-sale/sessions/available', options);
  return requireArray<Api.RealFlashSale.SessionDTO>(list, '可用秒杀场次');
}

export async function fetchMyFlashSaleEnrollments(options: { signal?: AbortSignal } = {}) {
  const list = await realOrderRequest.get<Api.RealFlashSale.EnrollmentDTO[]>('/flash-sale/my', { ...options, preserveDecimals:true });
  return requireArray<Api.RealFlashSale.EnrollmentDTO>(list, '我的秒杀报名');
}

export function enrollFlashSale(p: Api.RealFlashSale.EnrollParams) {
  if (p.flashPrice !== undefined && exactTransactionAmount(p.flashPrice).value === undefined) throw new Error('秒杀价须为正数，最多 28 位整数、8 位小数');
  if (p.flashStock !== undefined && (!Number.isInteger(p.flashStock) || p.flashStock < 1 || p.flashStock > 2147483647)) throw new Error('秒杀库存须为 1–2147483647 的整数');
  return realOrderRequest.post<string, Api.RealFlashSale.EnrollParams>('/flash-sale/enroll', p);
}

export async function cancelFlashSaleEnrollment(sessionId: string, productId: string) {
  await realOrderRequest.delete<string>('/flash-sale/enroll', { params: { sessionId, productId } });
  return { ok: true };
}
