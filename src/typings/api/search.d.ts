declare namespace Api.RealSearch {
  interface Suggestion { keyword: string; source: 'KEYWORD' | 'MODEL' | 'QUERY' }
  interface Keyword {
    id?: string;
    keyword: string;
    productId: string;
    pinyin?: string;
    initials?: string;
    promoted: boolean;
    enabled?: boolean;
    sortOrder?: number;
  }
}
