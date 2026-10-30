declare namespace Api.RealSearch {
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
