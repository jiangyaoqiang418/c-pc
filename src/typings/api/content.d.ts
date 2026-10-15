declare namespace Api.RealContent {
  type Id = string | number;
  type AgreementKind = 'user' | 'privacy' | 'service' | 'kyc' | 'aml';
  type ContentType = 'HELP' | 'AGREEMENT' | 'ANNOUNCEMENT';

  interface PublicContentVO {
    id: Id;
    contentType: ContentType;
    code: string;
    topic?: string | null;
    title: string;
    body?: string | null;
    contentVersion: string;
    status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
    audience: 'PUBLIC' | 'LOGGED_IN';
    sortOrder?: number;
    pinned?: boolean;
    publishedAt?: string | number | null;
    effectiveAt?: string | number | null;
  }

  interface PageQuery {
    current?: number;
    size?: number;
    keyword?: string;
    topic?: string;
    signal?: AbortSignal;
  }

  interface ContentPage {
    records: PublicContentVO[];
    total: number;
    current: number;
    size: number;
  }
}
