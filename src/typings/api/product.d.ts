declare namespace Api.RealProduct {
  type Id = string | number;

  interface ProductSpecGroup { name: string; options: string[] }
  interface ProductSkuOption { name: string; value: string }
  interface ProductSkuDTO {
    id: Id;
    specs: ProductSkuOption[];
    price: string | number;
    stock: number;
    enabled: boolean;
    image?: string | null;
  }
  interface ProductSku extends Omit<ProductSkuDTO, 'price'> { price: string }
  interface ProductSkuSaveParams extends Omit<ProductSkuDTO, 'id' | 'price'> {
    id?: Id | null;
    price: string;
  }
  interface ProductSkuFields {
    hasSku?: boolean;
    specGroups?: ProductSpecGroup[];
    skus?: ProductSku[];
  }

  type DisplayAfterSaleType = Api.Product.AftersaleType | 'unknown';
  type Record = Omit<Api.Product.ProductRecord, 'id' | 'sellerId' | 'categoryId' | 'aftersaleType' | 'salesCount' | 'viewCount' | 'favoriteCount' | 'shippingFee' | 'tax'> & {
    id: Id;
    sellerId: Id;
    categoryId: Id;
    aftersaleType: DisplayAfterSaleType;
    salesCount?: number;
    viewCount?: number;
    favoriteCount?: number;
    brandId?: Id | null;
    brand?: Api.RealBrand.BrandDTO | null;
    brandName?: string;
    shippingFee?: string;
    tax?: string;
    rawAfterSaleType?: string;
    rawStatus?: ProductStatus;
    imageFiles?: ProductImageDTO[];
  } & ProductSkuFields;

  type DisplayRecord = (Api.Product.ProductRecord | Record) & ProductSkuFields;

  type AfterSaleType = 'SEVEN_DAY_NO_REASON' | 'NONE' | 'SHOP_WARRANTY' | 'NATIONAL_WARRANTY';
  type ProductStatus = 'REVIEWING' | 'REJECTED' | 'ON_SALE' | 'OFF_SHELF' | 'FROZEN';

  interface ProductDTO {
    brandId?: Id | null;
    brand?: Api.RealBrand.BrandDTO | null;
    hasSku?: boolean;
    specGroups?: ProductSpecGroup[];
    skus?: ProductSkuDTO[];
    id: string;
    sellerId: string;
    sellerName?: string;
    title: string;
    categoryId: string;
    categoryName?: string;
    price: string | number;
    shippingFee?: string | number;
    taxFee?: string | number;
    stock: number;
    afterSaleType?: AfterSaleType;
    overseasClearance?: boolean;
    brief?: string;
    description?: string;
    status?: ProductStatus;
    auditStage?: 'PENDING_AUDIT' | 'IN_AUDIT';
    statusText?: string;
    reviewComment?: string;
    reviewerId?: string;
    reviewedAt?: string | number;
    salesCount?: string | number;
    viewCount?: string | number;
    favoriteCount?: string | number;
    images?: string[];
    imageFiles?: ProductImageDTO[];
    createdAt?: string | number;
    updatedAt?: string | number;
  }

  interface StorefrontProductVO {
    brandId?: Id | null;
    brand?: Api.RealBrand.BrandDTO | null;
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
    brandId?: Id;
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

  interface ProductImageDTO extends ProductImageParam {
    url: string;
  }

  interface ProductUpdateParams extends Omit<ProductCreateParams, 'price' | 'shippingFee' | 'taxFee'> {
    id: Id;
    price: string;
    shippingFee: string;
    taxFee: string;
  }

  interface ProductCreateParams {
    brandId?: Id | null;
    specGroups?: ProductSpecGroup[];
    skus?: ProductSkuSaveParams[];
    title: string;
    categoryId: string | number;
    price: string | number;
    shippingFee?: string | number;
    taxFee?: string | number;
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
    auditStage?: 'PENDING_AUDIT' | 'IN_AUDIT';
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

  interface FavoriteState { productId: Id; favorited: boolean }
  interface SellerQualification { sellerId: Id; verifiedBuyer: boolean; approvedAt?: string | number | null }

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
