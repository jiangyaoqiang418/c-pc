/**
 * 1-18 商品分类管理类型（R-DATA-20）。
 *
 * 3 级硬强制：大类 → 小类 → 品牌；商品必须挂在 level=3 的叶子上。
 * 创建来源：system（内置）/ buyer（买手申请通过后创建）。
 */
declare namespace Api.Category {
  type CategoryLevel = 1 | 2 | 3;
  type CategoryStatus = '1' | '2'; // 启用 / 停用
  type CreatorType = 'system' | 'buyer';
  type AppStatus = 'pending' | 'approved' | 'rejected';

  /** 分类节点（嵌套树） */
  interface CategoryNode {
    id: number;
    code: string;
    name: string;
    level: CategoryLevel;
    parentId: number | null;
    parentPath?: string;
    sort: number;
    status: CategoryStatus;
    icon?: string;
    description?: string;
    productCount: number; // 派生：该节点（含子节点）下的 NORMAL 状态商品总数
    createdAt: string;
    updatedAt: string;
    creatorType: CreatorType;
    creatorId?: number;
    children?: CategoryNode[];
  }

  /** 扁平节点（含 children 但不嵌套使用，例如表格展示） */
  interface FlatCategory {
    id: number;
    code: string;
    name: string;
    level: CategoryLevel;
    parentId: number | null;
    parentPath: string; // 完整路径："电脑整机 / 笔记本 / Apple"
    sort: number;
    status: CategoryStatus;
    icon?: string;
    description?: string;
    productCount: number;
    creatorType: CreatorType;
    creatorId?: number;
    childrenCount: number;
    createdAt: string;
    updatedAt: string;
  }

  interface CategoryApplication {
    id: number;
    applicantId: number;
    applicantName: string;
    level: CategoryLevel;
    parentId: number;
    parentPath: string;
    name: string;
    icon?: string;
    description?: string;
    reason: string;
    status: AppStatus;
    submitAt: string;
    auditAt?: string;
    auditor?: string;
    auditOpinion?: string;
    createdCategoryId?: number;
  }

  // ===== 请求参数 =====
  interface FlatListQuery {
    keyword?: string;
    levels?: CategoryLevel[];
    status?: CategoryStatus | 'all';
    creatorType?: CreatorType | 'all';
    onlyHasProducts?: boolean;
  }

  interface SaveParams {
    id?: number;
    name: string;
    level: CategoryLevel;
    parentId: number | null;
    icon?: string;
    description?: string;
    sort?: number;
    status?: CategoryStatus;
  }

  interface ApplicationListQuery {
    current?: number;
    size?: number;
    keyword?: string;
    statuses?: AppStatus[];
    fromAt?: string;
    toAt?: string;
  }

  interface AuditApplicationParams {
    id: number;
    decision: 'approve' | 'reject';
    opinion: string;
  }
}
