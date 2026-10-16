/** Read-only data for the separate development visual entry; never an API fallback. */
import type { fetchStorefrontProducts, uploadFile } from '@/service/api/product';

export type VisualProductRecord = Api.RealProduct.Record & { brandName?: string; salesCount: number };

export interface CatalogVisualFixture {
  load: (query: Parameters<typeof fetchStorefrontProducts>[0]) => ReturnType<typeof fetchStorefrontProducts>;
}

export interface AddressVisualFixture {
  countries: () => Promise<Api.RealAddress.CountryVO[]>;
  regions: (countryCode: string, parentCode?: string) => Promise<Api.RealAddress.RegionVO[]>;
}

export interface EvidenceVisualFixture { upload: typeof uploadFile }

export interface HomeVisualFixture {
  recommendations: VisualProductRecord[];
  hot: VisualProductRecord[];
  newest: VisualProductRecord[];
  feedRecords: VisualProductRecord[];
  rankingProducts?: VisualProductRecord[];
  discoveryProducts?: VisualProductRecord[][];
  categories: readonly Api.RealCategory.DisplayCategoryNode[];
}
