import { realOrderRequest } from '@/service/request';

function toCategoryNode(node: Api.RealCategory.CategoryNodeDTO): Api.Category.CategoryNode {
  const id = node.id as unknown as number;
  const parentId = (node.parentId ?? null) as unknown as number | null;

  return {
    id,
    code: String(node.id),
    name: node.name,
    level: node.level,
    parentId,
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

export async function fetchCategoryTree() {
  const list = await realOrderRequest.get<Api.RealCategory.CategoryNodeDTO[]>('/categories/tree');
  return list.map(toCategoryNode);
}
