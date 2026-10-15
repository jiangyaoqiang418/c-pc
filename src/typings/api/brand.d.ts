declare namespace Api.RealBrand {
  type Id = string | number;

  interface BrandDTO {
    id: Id;
    name: string;
    aliases?: string | null;
    logo?: string | null;
    enabled: boolean;
    sortOrder?: number;
  }

  interface BrandPageQuery {
    pageNo: number;
    pageSize: number;
    keyword?: string;
  }

  interface BrandPage {
    records: BrandDTO[];
    total: number;
    current: number;
    size: number;
  }
}
