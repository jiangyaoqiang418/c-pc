declare namespace Api.RealProduct {
  type AfterSaleType = 'SEVEN_DAY_NO_REASON' | 'NONE' | 'SHOP_WARRANTY' | 'NATIONAL_WARRANTY';
  type ProductStatus = 'REVIEWING' | 'REJECTED' | 'ON_SALE' | 'OFF_SHELF' | 'FROZEN';

  interface ProductDTO {
    id: string;
    sellerId: string;
    title: string;
    categoryId: string;
    price: string | number;
    shippingFee?: string | number;
    taxFee?: string | number;
    stock: number;
    afterSaleType?: AfterSaleType;
    overseasClearance?: boolean;
    brief?: string;
    description?: string;
    status?: ProductStatus;
    statusText?: string;
    reviewComment?: string;
    salesCount?: string | number;
    viewCount?: string | number;
    favoriteCount?: string | number;
    images?: string[];
    createdAt?: string | number;
    updatedAt?: string | number;
  }

  interface StorefrontProductVO {
    id: string;
    title: string;
    coverImage?: string;
    price?: string | number;
    salesCount?: string | number;
    stock?: number;
    categoryId?: string;
    categoryName?: string;
    afterSaleType?: AfterSaleType;
    afterSaleTypeText?: string;
    overseasClearance?: boolean;
    sellerId?: string;
    sellerName?: string;
  }

  interface StorefrontProductPageQuery {
    pageNo?: number;
    pageSize?: number;
    keyword?: string;
    categoryId?: string | number;
    minPrice?: number;
    maxPrice?: number;
    afterSaleType?: AfterSaleType;
    overseasClearance?: boolean;
    sortBy?: 'DEFAULT' | 'SALES' | 'NEW' | 'PRICE_ASC' | 'PRICE_DESC';
  }

  interface ProductImageParam {
    bucket: string;
    filePath: string;
  }

  interface ProductCreateParams {
    title: string;
    categoryId: string | number;
    price: number;
    shippingFee?: number;
    taxFee?: number;
    stock: number;
    afterSaleType: AfterSaleType;
    overseasClearance?: boolean;
    brief?: string;
    description?: string;
    images: ProductImageParam[];
  }

  interface ProductPageQuery {
    pageNo?: number;
    pageSize?: number;
    keyword?: string;
    status?: ProductStatus;
    categoryId?: string | number;
  }

  interface ProductShelfParams {
    id: string | number;
    onShelf: boolean;
  }

  interface ProductIdParams {
    id: string | number;
  }

  interface FavoritePageQuery {
    pageNo?: number;
    pageSize?: number;
  }

  interface FileUploadResult {
    id: string;
    bucket: string;
    filePath: string;
    url: string;
    originalName?: string;
    contentType?: string;
    size?: number;
  }

  interface FlashSaleItemVO {
    productId: string;
    title: string;
    image?: string;
    price?: string | number;
    flashPrice?: string | number;
    flashStock?: number;
    stock?: number;
    salesCount?: string | number;
    sessionId?: string;
    sessionEndTime?: string | number;
  }

  interface BannerDTO {
    id: string;
    image: string;
    title: string;
    subtitle?: string;
    tag?: string;
    pathTo?: string;
    sortOrder?: number;
    enabled?: boolean;
    createdAt?: string | number;
    updatedAt?: string | number;
  }
}
