import { realOrderRequest } from '@/service/request';
import { toPageTotal } from './page';

function toCategoryNode(node: Api.RealCategory.CategoryNodeDTO): Api.RealCategory.DisplayCategoryNode {
  return {
    id: node.id,
    code: String(node.id),
    name: node.name,
    level: node.level,
    parentId: node.parentId ?? null,
    parentPath: '',
    sort: node.sortOrder || 0,
    status: node.enabled === false ? '2' : '1',
    productCount: 0,
    createdAt: '',
    updatedAt: '',
    creatorType: node.source === 'BUYER' ? 'buyer' : 'system',
    children: node.children?.map(toCategoryNode)
  };
}

export async function fetchCategoryTree(options: { signal?: AbortSignal } = {}) {
  const list = await fetchRealCategoryTree(options);
  return list.map(toCategoryNode);
}

export function fetchRealCategoryTree(options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealCategory.CategoryNodeDTO[]>('/categories/tree', options);
}

export async function fetchMyCategoryApplications(q: Api.RealCategory.CategoryApplyPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const result = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealCategory.CategoryApplyDTO> & { pageNo?: number; pageSize?: number },
    Api.RealCategory.CategoryApplyPageQuery
  >('/categories/apply/my/page', {
    pageNo: q.pageNo || 1,
    pageSize: q.pageSize || 20,
    keyword: q.keyword,
    status: q.status
  }, options);
  return {
    current: result.current || result.pageNo || q.pageNo || 1,
    size: result.size || result.pageSize || q.pageSize || 20,
    total: toPageTotal(result.total),
    records: result.records
  };
}

export function submitCategoryApplication(p: Api.RealCategory.CategoryApplySubmitParams) {
  return realOrderRequest.post<string, Api.RealCategory.CategoryApplySubmitParams>('/categories/apply/submit', p);
}
