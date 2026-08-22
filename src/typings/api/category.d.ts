declare namespace Api.RealCategory {
  interface CategoryNodeDTO {
    id: string;
    parentId?: string | null;
    level: 1 | 2 | 3;
    name: string;
    sortOrder?: number;
    enabled?: boolean;
    source?: string;
    childCount?: number;
    children?: CategoryNodeDTO[];
  }

  interface DisplayCategoryNode {
    id: string;
    code: string;
    name: string;
    level: 1 | 2 | 3;
    parentId: string | null;
    parentPath: string;
    sort: number;
    status: '1' | '2';
    productCount: number;
    createdAt: string;
    updatedAt: string;
    creatorType: 'system' | 'buyer';
    children?: DisplayCategoryNode[];
  }

  type CategoryApplyStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

  interface CategoryApplyPageQuery {
    pageNo?: number;
    pageSize?: number;
    keyword?: string;
    status?: CategoryApplyStatus;
  }

  interface CategoryApplyDTO {
    id: string;
    applicantId: string;
    applicantName?: string;
    parentId?: string;
    parentPath?: string;
    level?: number;
    newName: string;
    reason: string;
    status: CategoryApplyStatus;
    reviewComment?: string;
    reviewerId?: string;
    createdCategoryId?: string;
    createdAt: string;
    reviewedAt?: string;
  }

  interface CategoryApplySubmitParams {
    parentId?: string;
    newName: string;
    reason: string;
  }
}
