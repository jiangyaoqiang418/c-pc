/**
 * AI 导购 mock API。
 *
 * 接受用户自然语言输入 → 简单关键字模糊匹配返回相似商品 + 诱导发起求购。
 */
import { PRODUCTS } from '../mock/data/products';
import { delay } from '../utils/mock-delay';

export interface AiSearchResult {
  query: string;
  suggestions: Api.Product.ProductRecord[];
  inducePurchase: boolean;
  inducePurchaseHint?: string;
}

export async function aiSearchMock(query: string): Promise<AiSearchResult> {
  const kw = query.trim().toLowerCase();
  const all = PRODUCTS.filter(p => p.status === 'NORMAL' && p.shelfStatus === 'on-shelf');

  let suggestions: Api.Product.ProductRecord[] = [];
  if (kw) {
    suggestions = all.filter(p => p.title.toLowerCase().includes(kw) || p.summary.toLowerCase().includes(kw));
  }
  // 不足 6 条时按销量补齐随机商品
  if (suggestions.length < 6) {
    const extras = [...all]
      .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
      .filter(p => !suggestions.some(s => s.id === p.id))
      .slice(0, 6 - suggestions.length);
    suggestions = [...suggestions, ...extras];
  }
  suggestions = suggestions.slice(0, 12);

  const inducePurchase = kw.length > 0 && suggestions.length < 3;

  return delay(
    {
      query,
      suggestions,
      inducePurchase,
      inducePurchaseHint: inducePurchase ? '平台暂无完美匹配的商品，要不要发起一笔代购求购？' : undefined
    },
    600
  );
}
