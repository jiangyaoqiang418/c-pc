/** Read-only data for the separate development visual entry; never an API fallback. */
export type VisualProductRecord = Api.RealProduct.Record & { brandName?: string; salesCount: number };

export interface HomeVisualFixture {
  recommendations: VisualProductRecord[];
  hot: VisualProductRecord[];
  newest: VisualProductRecord[];
  feedRecords: VisualProductRecord[];
  rankingProducts?: VisualProductRecord[];
  discoveryProducts?: VisualProductRecord[][];
  categories: readonly Api.RealCategory.DisplayCategoryNode[];
}
