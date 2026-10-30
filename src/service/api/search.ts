import { realOrderRequest } from '@/service/request';
import { requireArray } from './page';

async function keywords(path: string, keyword?: string, signal?: AbortSignal) {
  const rows = requireArray<Api.RealSearch.Keyword>(await realOrderRequest.get(path, {
    params: { keyword }, signal, showError: false, skipAuthRedirect: true
  }), '搜索词');
  if (rows.some(row => !row || typeof row.keyword !== 'string' || !row.keyword.trim()
    || typeof row.productId !== 'string' || !row.productId)) throw new Error('搜索词数据异常');
  return rows;
}

export const fetchSearchPromotions = (signal?: AbortSignal) => keywords('/storefront/search/promotions', undefined, signal);
export const fetchSearchHot = (signal?: AbortSignal) => keywords('/storefront/search/hot', undefined, signal);
export const fetchSearchSuggestions = (keyword: string, signal?: AbortSignal) => keywords('/storefront/search/suggest', keyword, signal);
export const trackSearch = (keyword: string) => realOrderRequest.post('/storefront/search/track', { keyword }, { showError: false, skipAuthRedirect: true });

export function normalizeSearchHistory(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.filter((row): row is string => typeof row === 'string').map(row => row.trim())
    .filter(row => row.length > 0 && row.length <= 50))].slice(0, 20);
}

export const searchHistoryKey = (userId?: string | number) => `cpc:search-history:v1:${userId === undefined ? 'guest' : encodeURIComponent(String(userId))}`;
