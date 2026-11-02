import { realOrderRequest } from '@/service/request';
import { requireArray } from './page';

/** 识别结果仅为平台候选，提交时始终使用业务 code，不能提交第三方 expressCpCode。 */
export async function detectCarriers(trackingNo: string, options: { signal?: AbortSignal } = {}) {
  const rows = requireArray<Api.RealOrder.CarrierDTO>(await realOrderRequest.get('/orders/carriers/detect', {
    params: { trackingNo: trackingNo.trim() }, signal: options.signal, showError: false
  }), '运单识别候选');
  if (rows.some(row => !row || typeof row.code !== 'string' || !row.code.trim() || typeof row.name !== 'string' || !row.name.trim())) {
    throw new Error('物流公司识别结果异常，请手动选择');
  }
  return rows.filter(row => row.enabled);
}
