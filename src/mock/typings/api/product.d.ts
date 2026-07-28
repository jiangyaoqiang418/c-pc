/**
 * 1-8 商品管理类型（R-DATA-17 / R-DATA-18 / R-DATA-19 / R-MOD-10）。
 *
 * - 商品 5 状态硬枚举（R-DATA-17）；
 * - 变更类型 10 类硬枚举（R-DATA-18）；
 * - 信息修改"草稿态待审"模型（R-DATA-19）：已通过商品的 INFO_UPDATE 写入 draftPatch；
 *   老版本对外仍展示；审核通过合并、驳回保留 draft 让卖家再改。
 */
declare namespace Api.Product {
  /** R-DATA-17 硬枚举：商品 5 状态 */
  type ProductStatus = 'PENDING_AUDIT' | 'IN_AUDIT' | 'NORMAL' | 'FROZEN' | 'DELETED';

  type ShelfStatus = 'on-shelf' | 'off-shelf';

  /** R-DATA-30 V2.2：扩展为 4 类（增加 national-warranty 全国联保） */
  type AftersaleType = 'none' | '7day-no-reason' | 'shop-warranty' | 'national-warranty';

  type DraftStatus = 'pending' | 'rejected';

  /** R-DATA-18 硬枚举：变更类型 10 类 */
  type ChangeType =
    | 'CREATE'
    | 'PRICE_UPDATE'
    | 'SHELF_TOGGLE'
    | 'INFO_UPDATE_SUBMIT'
    | 'INFO_UPDATE_APPLY'
    | 'AUDIT_APPROVE'
    | 'AUDIT_REJECT'
    | 'FREEZE'
    | 'UNFREEZE'
    | 'DELETE';

  interface ProductMedia {
    url: string;
    name: string;
    type: 'image' | 'video';
    sort: number;
  }

  interface ProductRecord {
    id: number;
    code: string;
    title: string;
    sellerId: number;
    sellerName: string;
    categoryId: number;
    categoryPath: string;
    price: string;
    stock: number;
    shippingFee: string;
    tax: string;
    images: ProductMedia[];
    summary: string;
    description: string;
    aftersaleType: AftersaleType;
    aftersaleDays?: number;
    /** R-DATA-30 V2.2：海外过关商品（不可退） */
    overseasCustoms?: boolean;
    status: ProductStatus;
    shelfStatus: ShelfStatus;
    draftPatch?: Partial<ProductRecord>;
    draftStatus?: DraftStatus;
    draftSubmitAt?: string;
    draftAuditOpinion?: string;
    salesCount: number;
    viewCount: number;
    favoriteCount: number;
    createdAt: string;
    submittedAt: string;
    publishedAt?: string;
    updatedAt: string;
  }

  interface AuditAnnotation {
    field: string;
    note: string;
  }

  interface ChangeLog {
    id: number;
    productId: number;
    productTitle: string;
    sellerId: number;
    sellerName: string;
    changeType: ChangeType;
    actor: 'seller' | 'admin' | 'system';
    actorId?: number;
    actorName?: string;
    diff?: { field: string; label: string; from: string; to: string }[];
    annotations?: AuditAnnotation[];
    auditOpinion?: string;
    createdAt: string;
  }

  // ===== 请求参数 =====
  interface ListQuery {
    current?: number;
    size?: number;
    keyword?: string;
    sellerId?: number;
    categoryId?: number;
    statuses?: ProductStatus[];
    shelfStatuses?: ShelfStatus[];
    hasDraft?: boolean;
    priceMin?: string;
    priceMax?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface CreateParams {
    title: string;
    sellerId: number;
    categoryId: number;
    price: string;
    stock: number;
    shippingFee: string;
    tax: string;
    summary: string;
    description: string;
    images: ProductMedia[];
    aftersaleType: AftersaleType;
    aftersaleDays?: number;
  }

  interface InfoUpdateParams {
    id: number;
    patch: Partial<Omit<CreateParams, 'price' | 'sellerId'>>;
  }

  interface PriceUpdateParams {
    id: number;
    price: string;
    reason?: string;
  }

  interface ShelfToggleParams {
    id: number;
    shelfStatus: ShelfStatus;
  }

  interface AuditParams {
    id: number;
    kind: 'create' | 'change';
    decision: 'approve' | 'reject';
    opinion: string;
    annotations?: AuditAnnotation[];
  }

  interface FreezeParams {
    id: number;
    reason: string;
  }
  interface UnfreezeParams {
    id: number;
    reason: string;
  }
  interface DeleteParams {
    id: number;
    reason: string;
  }

  interface ChangeLogListQuery {
    current?: number;
    size?: number;
    productId?: number;
    sellerId?: number;
    changeTypes?: ChangeType[];
    fromAt?: string;
    toAt?: string;
  }

  interface CategoryDist {
    categoryId: number;
    categoryPath: string;
    count: number;
  }
  interface SellerDist {
    sellerId: number;
    sellerName: string;
    count: number;
  }

  interface ProductStats {
    total: number;
    byStatus: Record<ProductStatus, number>;
    byShelfStatus: Record<ShelfStatus, number>;
    pendingAuditCount: number;
    pendingChangeAuditCount: number;
    frozenCount: number;
    topCategories: CategoryDist[];
    topSellers: SellerDist[];
  }
}
