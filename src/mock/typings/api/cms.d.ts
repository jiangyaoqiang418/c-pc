/**
 * 内容管理类型（R-DATA-40）。
 */
declare namespace Api.Cms {
  type AnnouncementType = 'system' | 'maintenance' | 'campaign' | 'risk';
  type AnnouncementStatus = 'draft' | 'published' | 'archived';
  type Audience = 'all' | 'customer' | 'buyer' | 'staff';

  interface Announcement {
    id: number;
    code: string;
    title: string;
    summary: string;
    body: string;
    type: AnnouncementType;
    status: AnnouncementStatus;
    audience: Audience;
    publishAt?: string;
    expireAt?: string;
    viewsCount: number;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  type AgreementKind = 'user' | 'privacy' | 'service' | 'kyc' | 'aml';

  interface Agreement {
    id: number;
    kind: AgreementKind;
    version: string;
    title: string;
    body: string;
    effectiveAt: string;
    isCurrent: boolean;
    publishedBy: string;
  }

  type HelpCategory = 'guide' | 'order' | 'wallet' | 'kyc' | 'aftersale' | 'other';

  interface HelpArticle {
    id: number;
    title: string;
    category: HelpCategory;
    body: string;
    viewsCount: number;
    helpful: number;
    notHelpful: number;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }

  interface Stats {
    announcementsPublished: number;
    pendingDrafts: number;
    agreementsActive: number;
    helpArticlesTotal: number;
    helpViewsLast7d: number;
  }

  interface AnnListQuery {
    current?: number;
    size?: number;
    type?: AnnouncementType;
    status?: AnnouncementStatus;
    audience?: Audience;
    keyword?: string;
  }
  interface AgreementListQuery {
    kind?: AgreementKind;
  }
  interface HelpListQuery {
    current?: number;
    size?: number;
    category?: HelpCategory;
    enabled?: boolean;
    keyword?: string;
  }
  interface AnnSaveParams {
    id?: number;
    title: string;
    summary: string;
    body: string;
    type: AnnouncementType;
    audience: Audience;
    pinned: boolean;
    publishAt?: string;
    expireAt?: string;
    status: AnnouncementStatus;
  }
  interface AnnPublishParams {
    announcementId: number;
  }
  interface AnnArchiveParams {
    announcementId: number;
  }
  interface AgreementSaveParams {
    kind: AgreementKind;
    version: string;
    title: string;
    body: string;
    effectiveAt: string;
  }
  interface AgreementSetCurrentParams {
    agreementId: number;
  }
  interface HelpSaveParams {
    id?: number;
    title: string;
    category: HelpCategory;
    body: string;
    enabled: boolean;
  }
  interface HelpToggleParams {
    articleId: number;
    enabled: boolean;
  }
}
