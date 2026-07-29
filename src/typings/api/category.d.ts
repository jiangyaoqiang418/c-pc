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
}
