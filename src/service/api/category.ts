import { realOrderRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';

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
  const list = await fetchRealCategoryTree({ ...options, onlyWithProduct: true });
  return requireArray<Api.RealCategory.CategoryNodeDTO>(list, '分类树').map(toCategoryNode);
}

export async function fetchRealCategoryTree(options: { signal?: AbortSignal; onlyWithProduct?: boolean } = {}) {
  const { onlyWithProduct = false, ...requestOptions } = options;
  const list = await realOrderRequest.get<Api.RealCategory.CategoryNodeDTO[]>('/categories/tree', {
    ...requestOptions,
    params: { onlyEnabled: true, onlyWithProduct }
  });
  return requireArray<Api.RealCategory.CategoryNodeDTO>(list, '分类树');
}

export interface CategoryOption {
  value: string;
  label: string;
  children?: CategoryOption[];
}

/** 发布和求购允许选择任一启用层级，最多五级，并保留完整父子关系。 */
export function createCategoryOptions(nodes: Api.RealCategory.CategoryNodeDTO[], level = 1, parentId?: string): CategoryOption[] {
  return nodes.flatMap(node => {
    if (node.enabled !== true || node.level !== level || !String(node.id ?? '').trim()
      || (node.parentId !== undefined && node.parentId !== null
        && String(node.parentId) !== String(parentId ?? '0'))) return [];
    const children = createCategoryOptions(node.children || [], level + 1, node.id);
    return [{ value: node.id, label: node.name, children: children.length ? children : undefined }];
  });
}

export function isSelectableCategory(options: CategoryOption[], id: string | number | undefined): boolean {
  return id !== undefined && options.some(option => String(option.value) === String(id)
    || !!option.children && isSelectableCategory(option.children, id));
}

export async function fetchCreateCategoryOptions(options: { signal?: AbortSignal } = {}) {
  return createCategoryOptions(await fetchRealCategoryTree(options));
}

export async function fetchMyCategoryApplications(q: Api.RealCategory.CategoryApplyPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const result = await realOrderRequest.postQuery<
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
    records: requireArray<Api.RealCategory.CategoryApplyDTO>(result.records, '分类申请分页记录')
  };
}

export function submitCategoryApplication(p: Api.RealCategory.CategoryApplySubmitParams) {
  return realOrderRequest.post<string, Api.RealCategory.CategoryApplySubmitParams>('/categories/apply/submit', p);
}
