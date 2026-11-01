import { realOrderRequest } from '@/service/request';
import { requireCurrentProduct } from '@/utils/ai-product';

/** 公开商品实时查询；只合并请求，不改变每条消息的推荐顺序。 */
export async function fetchCurrentProductCards(ids: string[], signal?: AbortSignal) {
  if (ids.some(id => typeof id !== 'string' || !/^[1-9]\d*$/.test(id))) throw new Error('商品信息暂时无法加载');
  const unique = [...new Set(ids)];
  const result: Record<string, Api.Ai.CurrentProduct> = {};
  for (let offset = 0; offset < unique.length; offset += 100) {
    signal?.throwIfAborted();
    const batch = unique.slice(offset, offset + 100);
    const rows = await realOrderRequest.postQuery<unknown[]>('/storefront/products/cards', { ids: batch }, { signal, showError: false, skipAuthRedirect: true });
    if (!Array.isArray(rows)) throw new Error('商品信息暂时无法加载');
    for (const row of rows) {
      const item = requireCurrentProduct(row);
      if (!batch.includes(item.id) || result[item.id]) throw new Error('商品信息暂时无法加载');
      result[item.id] = item;
    }
    if (batch.some(id => !result[id])) throw new Error('商品信息暂时无法加载');
  }
  return result;
}
