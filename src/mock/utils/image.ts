/**
 * 图片资源 helper —— 商品图 / 头像 / hero 品牌图
 *
 * 策略：
 * - 商品图：按类别精选 Unsplash 图片 ID 池，商品 id → 类别池 → 图片 ID
 * - 头像：DiceBear personas SVG (稳定 CDN，无需注册)
 * - Hero 品牌图：固定精选 Unsplash 图 ID
 *
 * 用法：
 *   productImageUrl(product.id, 720, product.categoryPath)
 *   avatarUrl(user.id)
 *   heroBrandImage('luxury', 1600)
 */

/** 类别 → 精选 Unsplash photo ID 池（都是产品/场景类真实图） */
const PRODUCT_IMAGE_POOL: Record<string, string[]> = {
  电脑整机: [
    '1517336714731-489689fd1ca8', '1593642632559-0c6d3fc62b89', '1531492746076-161ca9bcad58',
    '1541746972996-4e0b0f43e02a', '1587614382346-4ec70e388b28', '1547082299-de196ea013d6',
    '1517430816045-df4b7de11d1d', '1587202372775-e229f172b9d7'
  ],
  手机数码: [
    '1511707171634-5f897ff02aa9', '1512499617640-c74ae3a79d37', '1585060544812-6b45742d762f',
    '1592750475338-74b7b21085ab', '1574944985070-8f3ebc6b79d2', '1580910051074-3eb694886505',
    '1574755393849-623942496936', '1601784551446-20c9e07cdbdb'
  ],
  家用电器: [
    '1585771724684-38269d6639fd', '1571902943202-507ec2618e8f', '1556228453-efd6c1ff04f6',
    '1585659722983-3a675dabf23d', '1556909114-f6e7ad7d3136'
  ],
  美妆护肤: [
    '1522337360788-8b13dee7a37e', '1512496015851-a90fb38ba796', '1571781926291-c477ebfd024b',
    '1596462502278-27bfdc403348', '1526045478516-99145907023c', '1571875257727-256c39da42af',
    '1487412720507-e7ab37603c6f', '1583241800698-e8ab01830a07'
  ],
  个人护理: [
    '1556228720-195a672e8a03', '1608248543803-ba4f8c70ae0b',
    '1571781565036-d3f759be73e4', '1585232004423-244e0e6904e3'
  ],
  母婴用品: [
    '1522771930-78848d9293e8', '1584464491033-06628f3a6b7b', '1519689680058-324335c77eba',
    '1519689373023-dd07c7988603', '1541961017774-22349e4a1262', '1544117519-31a4b719223d'
  ],
  食品饮料: [
    '1493770348161-369560ae357d', '1504674900247-0877df9cc836', '1565299624946-b28f40a0ae38',
    '1495474472287-4d71bcdd2085', '1490474418585-ba9bad8fd0ea',
    '1544025162-d76694265947', '1517244683847-7456b63c5969'
  ],
  服饰内衣: [
    '1483985988355-763728e1935b', '1490481651871-ab68de25d43d', '1523381210434-271e8be1f52b',
    '1441986300917-64674bd600d8', '1445205170230-053b83016050', '1479064555552-3ef4979f8908',
    '1499696010180-025ef6e1a8f9', '1434389677669-e08b4cac3105'
  ],
  运动户外: [
    '1517649763962-0c623066013b', '1461896836934-ffe607ba8211', '1552674605-db6ffd4facb5',
    '1526506118085-60ce8714f8c5', '1571019613454-1cb2f99b2d8b',
    '1546519638-68e109498ffc', '1530549387789-4c1017266635'
  ],
  图书音像: [
    '1524995997946-a1c2e315a42f', '1512820790803-83ca734da794', '1495446815901-a7297e633e8d',
    '1519677100203-a0e668c92439', '1544947950-fa07a98d237f', '1481627834876-b7833e8f5570'
  ]
};

const DEFAULT_POOL = PRODUCT_IMAGE_POOL.服饰内衣;

/**
 * 商品图 URL —— 按类别取 Unsplash 精选图，同商品 id 稳定返回同图
 * 图片会自动 resize + crop + 质量压缩
 */
export function productImageUrl(productId: number, size = 720, categoryPath?: string): string {
  const rootCategory = categoryPath?.split('/')[0]?.trim();
  const pool = (rootCategory && PRODUCT_IMAGE_POOL[rootCategory]) || DEFAULT_POOL;
  const photoId = pool[productId % pool.length];
  return `https://images.unsplash.com/photo-${photoId}?w=${size}&h=${size}&fit=crop&auto=format&q=80`;
}

/** 一个商品多张图 (gallery) —— 从同类池里选相邻的 count 张 */
export function productImageUrls(productId: number, count = 5, size = 720, categoryPath?: string): string[] {
  const rootCategory = categoryPath?.split('/')[0]?.trim();
  const pool = (rootCategory && PRODUCT_IMAGE_POOL[rootCategory]) || DEFAULT_POOL;
  return Array.from({ length: count }, (_, i) => {
    const photoId = pool[(productId + i) % pool.length];
    return `https://images.unsplash.com/photo-${photoId}?w=${size}&h=${size}&fit=crop&auto=format&q=80`;
  });
}

/** 用户头像 —— DiceBear personas （SVG，稳定 CDN，无需注册） */
export function avatarUrl(userId: number, style: 'personas' | 'avataaars' | 'bottts' | 'notionists' = 'notionists'): string {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=youbao-${userId}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,f6efe4`;
}

/** Hero 品牌图 —— 首页 hero / 商品详情 fallback */
const HERO_IMAGES: Record<string, string> = {
  fashion: '1483985988355-763728e1935b',
  electronics: '1526738549149-8e07eca6c147',
  cosmetics: '1522337360788-8b13dee7a37e',
  travel: '1488646953014-85cb44e25828',
  luxury: '1490481651871-ab68de25d43d',
  home: '1554995207-c18c203602cb'
};

export type HeroTheme = keyof typeof HERO_IMAGES;

export function heroBrandImage(theme: HeroTheme = 'luxury', width = 1600): string {
  const id = HERO_IMAGES[theme] || HERO_IMAGES.luxury;
  return `https://images.unsplash.com/photo-${id}?w=${width}&auto=format&fit=crop&q=80`;
}

/** Banner 图 —— 从 hero 图池挑选 */
export function bannerImage(index: number, width = 1200): string {
  const keys = Object.keys(HERO_IMAGES) as HeroTheme[];
  return heroBrandImage(keys[index % keys.length], width);
}

/** 通用凭证 / 上传占位图 (KYC / 售后 / 评价) —— 保留 picsum 场景 (随机图更符合"上传"语义) */
export function uploadPlaceholderUrl(seed: string | number, size = 400): string {
  return `https://picsum.photos/seed/${seed}/${size}/${size}`;
}
