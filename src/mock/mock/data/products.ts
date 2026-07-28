/**
 * 商品内存池（R-MOD-10 主真实源）。
 *
 * 35+ 商品按 doc 1-8 状态分布：
 * - 20 NORMAL+on-shelf
 * - 5  NORMAL+off-shelf
 * - 5  PENDING_AUDIT
 * - 3  IN_AUDIT
 * - 2  FROZEN
 * - 3 NORMAL 含 draftPatch（信息修改待审，draftStatus=pending）
 *
 * 卖家分布：15 买手每人 1-3 件商品（buyer IDs 21-35）
 * 分类：按 JD 风格挂在 3 级品牌叶子上
 */
import { walkAll } from './categories';
import { USERS } from './users';
import { productImageUrl } from '../../utils/image';

type Product = Api.Product.ProductRecord;

let prodId = 0;
function nextProdId(): number {
  prodId += 1;
  return prodId;
}

function nowIso() {
  return new Date().toISOString();
}

function daysAgo(d: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

function pcode(id: number): string {
  return `P2026${String(id).padStart(5, '0')}`;
}

function img(seed: number, sort = 1, categoryPath?: string): Api.Product.ProductMedia {
  return {
    url: productImageUrl(seed, 800, categoryPath),
    name: `主图-${sort}.jpg`,
    type: 'image',
    sort
  };
}

function leafIdByPath(rootName: string, subName: string, brandName: string): { id: number; path: string } {
  let hitId = 0;
  let hitPath = '';
  walkAll(n => {
    if (n.level === 3 && n.name === brandName && n.parentPath === `${rootName} / ${subName}`) {
      hitId = n.id;
      hitPath = `${n.parentPath} / ${n.name}`;
    }
  });
  return { id: hitId, path: hitPath };
}

function buyerByEmail(email: string) {
  return USERS.find(u => u.email === email);
}

interface ProductSeed {
  title: string;
  sellerEmail: string;
  rootName: string;
  subName: string;
  brandName: string;
  price: string;
  stock: number;
  shippingFee: string;
  tax: string;
  summary: string;
  description: string;
  imagesCount: number;
  aftersaleType: Api.Product.AftersaleType;
  aftersaleDays?: number;
  /** R-DATA-30 V2.2：海外过关商品（不可退） */
  overseasCustoms?: boolean;
  status: Api.Product.ProductStatus;
  shelfStatus: Api.Product.ShelfStatus;
  salesCount: number;
  viewCount: number;
  favoriteCount: number;
  daysAgoCreated: number;
  draftPatch?: Partial<Product>;
  draftStatus?: Api.Product.DraftStatus;
  daysAgoDraftSubmit?: number;
  draftAuditOpinion?: string;
}

// 20 NORMAL+on-shelf
const SEEDS_NORMAL_ON: ProductSeed[] = [
  {
    title: 'Apple MacBook Pro 14 M3 Pro 18GB 1TB 深空灰',
    sellerEmail: 'zhanglilin@example.com',
    rootName: '电脑整机',
    subName: '笔记本',
    brandName: 'Apple',
    price: '14999.00',
    stock: 8,
    shippingFee: '50.00',
    tax: '0.00',
    summary: '美国直邮 / 国行版可选 / 全新未拆封',
    description: 'M3 Pro 12 核 CPU + 18 核 GPU；18GB 统一内存；1TB SSD；深空灰；美版含 1 年 AppleCare。',
    imagesCount: 4,
    overseasCustoms: true,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 12,
    viewCount: 1380,
    favoriteCount: 56,
    daysAgoCreated: 75
  },
  {
    title: 'Lenovo ThinkPad X1 Carbon Gen 11 i7 32GB',
    sellerEmail: 'yangjianjun@example.com',
    rootName: '电脑整机',
    subName: '笔记本',
    brandName: 'Lenovo',
    price: '11800.00',
    stock: 5,
    shippingFee: '0.00',
    tax: '50.00',
    summary: '商务旗舰 / 美版直邮',
    description: 'Intel Core i7-1365U / 32GB DDR5 / 1TB NVMe / 14" 2.2K OLED / 1.1kg 超轻。',
    imagesCount: 3,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 6,
    viewCount: 720,
    favoriteCount: 22,
    daysAgoCreated: 60
  },
  {
    title: '海外限定 · Apple iPhone 15 Pro Max 256GB 钛原色',
    sellerEmail: 'songruohan@example.com',
    rootName: '手机数码',
    subName: '手机',
    brandName: 'Apple',
    price: '9999.00',
    stock: 15,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '美版 / 港版 / 日版可选',
    description: '钛金属边框 / 4 摄系统 / A17 Pro / Action 按钮。',
    imagesCount: 5,
    overseasCustoms: true,
    aftersaleType: 'national-warranty',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 28,
    viewCount: 2980,
    favoriteCount: 112,
    daysAgoCreated: 45
  },
  {
    title: '海外限定 · 华为 Mate 60 Pro+ 12GB 512GB 砚黑',
    sellerEmail: 'feijiayi@example.com',
    rootName: '手机数码',
    subName: '手机',
    brandName: '华为',
    price: '7999.00',
    stock: 10,
    shippingFee: '0.00',
    tax: '30.00',
    summary: '现货闪发 / 港版全新',
    description: '麒麟 9000S 处理器；卫星通话；超聚光长焦摄像头。',
    imagesCount: 4,
    overseasCustoms: true,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 180,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 18,
    viewCount: 1820,
    favoriteCount: 74,
    daysAgoCreated: 40
  },
  {
    title: 'SK-II 神仙水 230ml 套装',
    sellerEmail: 'liaoyichen@example.com',
    rootName: '美妆护肤',
    subName: '面部护肤',
    brandName: 'SK-II',
    price: '1380.00',
    stock: 25,
    shippingFee: '15.00',
    tax: '8.00',
    summary: '日本直邮 / 免税店货源',
    description: '230ml 大瓶 + 旅行装 75ml；SK-II 经典护肤精华液。',
    imagesCount: 3,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 45,
    viewCount: 3210,
    favoriteCount: 198,
    daysAgoCreated: 30
  },
  {
    title: 'Estée Lauder 小棕瓶精华 100ml',
    sellerEmail: 'tangchuyu@example.com',
    rootName: '美妆护肤',
    subName: '面部护肤',
    brandName: '雅诗兰黛',
    price: '880.00',
    stock: 40,
    shippingFee: '15.00',
    tax: '6.00',
    summary: '美国免税店直邮 / 全新未拆',
    description: '雅诗兰黛智妍修护精华液 100ml；新一代第七代。',
    imagesCount: 3,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 67,
    viewCount: 4520,
    favoriteCount: 245,
    daysAgoCreated: 55
  },
  {
    title: 'Dyson V15 Detect 无线吸尘器',
    sellerEmail: 'cuiyuting@example.com',
    rootName: '家用电器',
    subName: '小家电',
    brandName: 'Dyson',
    price: '4980.00',
    stock: 6,
    shippingFee: '60.00',
    tax: '20.00',
    summary: '英国进口 / 激光除尘',
    description: '激光显尘 + LCD 屏 + 60 分钟续航；含 7 种刷头。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 730,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 8,
    viewCount: 980,
    favoriteCount: 41,
    daysAgoCreated: 35
  },
  {
    title: 'Nike Air Jordan 1 Retro High OG "Chicago Lost & Found"',
    sellerEmail: 'fengwenbo@example.com',
    rootName: '运动户外',
    subName: '运动鞋',
    brandName: 'Nike',
    price: '1899.00',
    stock: 12,
    shippingFee: '30.00',
    tax: '0.00',
    summary: '官方原盒 / 美国 Nike 直发',
    description: '经典 Chicago 复刻 / DZ5485-612。男女通用尺码。',
    imagesCount: 5,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 38,
    viewCount: 2670,
    favoriteCount: 132,
    daysAgoCreated: 25
  },
  {
    title: 'Adidas Samba OG Cloud White Core Black',
    sellerEmail: 'jianglinyu@example.com',
    rootName: '运动户外',
    subName: '运动鞋',
    brandName: 'Adidas',
    price: '699.00',
    stock: 30,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '德国官方直邮',
    description: '经典 Samba OG；T 头复古风；男女通用。',
    imagesCount: 4,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 88,
    viewCount: 5260,
    favoriteCount: 312,
    daysAgoCreated: 20
  },
  {
    title: '日本 Aptamil 爱他美白金版 1 段 800g',
    sellerEmail: 'qiansiya@example.com',
    rootName: '母婴用品',
    subName: '奶粉辅食',
    brandName: 'Aptamil',
    price: '388.00',
    stock: 100,
    shippingFee: '40.00',
    tax: '12.00',
    summary: '日本超市直采 / 真品保障',
    description: '日版白金 1 段；适合 0-6 月龄。日期新鲜，长期供货。',
    imagesCount: 3,
    aftersaleType: 'none',
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 156,
    viewCount: 6980,
    favoriteCount: 421,
    daysAgoCreated: 50
  },
  {
    title: 'Lindt 瑞士莲松露巧克力礼盒 500g',
    sellerEmail: 'wuxiaomeng@example.com',
    rootName: '食品饮料',
    subName: '进口零食',
    brandName: 'Lindt',
    price: '168.00',
    stock: 80,
    shippingFee: '15.00',
    tax: '5.00',
    summary: '德国进口 / 免税价',
    description: '瑞士莲松露巧克力礼盒装；500g；多种口味混合。',
    imagesCount: 3,
    aftersaleType: 'none',
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 224,
    viewCount: 4180,
    favoriteCount: 198,
    daysAgoCreated: 28
  },
  {
    title: 'Uniqlo +J 系列羽绒服男装',
    sellerEmail: 'duomujie@example.com',
    rootName: '服饰内衣',
    subName: '男装',
    brandName: 'Uniqlo',
    price: '799.00',
    stock: 24,
    shippingFee: '25.00',
    tax: '0.00',
    summary: '日本 Uniqlo 直采',
    description: '与 Jil Sander 联名系列；轻薄羽绒服；多色可选。',
    imagesCount: 4,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 56,
    viewCount: 2980,
    favoriteCount: 156,
    daysAgoCreated: 32
  },
  {
    title: 'Lululemon Align 高腰瑜伽裤',
    sellerEmail: 'mengsi@example.com',
    rootName: '运动户外',
    subName: '运动服',
    brandName: 'Lululemon',
    price: '988.00',
    stock: 18,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '美国官网直邮',
    description: '经典 Align 25" 长款；Nulu 面料；多色可选。',
    imagesCount: 5,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 73,
    viewCount: 4520,
    favoriteCount: 287,
    daysAgoCreated: 22
  },
  {
    title: 'Sony WH-1000XM5 旗舰降噪耳机',
    sellerEmail: 'zhanglilin@example.com',
    rootName: '手机数码',
    subName: '影音娱乐',
    brandName: 'Sony',
    price: '2299.00',
    stock: 14,
    shippingFee: '25.00',
    tax: '8.00',
    summary: '日本免税店直邮',
    description: '主动降噪 / 蓝牙 5.2 / 30 小时续航 / 黑色 / 银色可选。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 32,
    viewCount: 2180,
    favoriteCount: 89,
    daysAgoCreated: 18
  },
  {
    title: 'Canon EOS R5 全画幅微单',
    sellerEmail: 'yangjianjun@example.com',
    rootName: '手机数码',
    subName: '摄影摄像',
    brandName: 'Canon',
    price: '23999.00',
    stock: 3,
    shippingFee: '80.00',
    tax: '50.00',
    summary: '日本佳能直邮 / 港行可选',
    description: '4500 万像素全画幅 / 8K 视频 / 单机身。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 4,
    viewCount: 580,
    favoriteCount: 32,
    daysAgoCreated: 90
  },
  {
    title: 'Apple Watch Series 9 41mm 银色铝合金',
    sellerEmail: 'songruohan@example.com',
    rootName: '手机数码',
    subName: '智能穿戴',
    brandName: 'Apple',
    price: '3199.00',
    stock: 20,
    shippingFee: '15.00',
    tax: '0.00',
    summary: '美版 / 港行可选',
    description: 'S9 SiP 芯片；双击手势；亮屏 2000 尼特。',
    imagesCount: 3,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 27,
    viewCount: 1980,
    favoriteCount: 95,
    daysAgoCreated: 16
  },
  {
    title: 'LEGO 乐高 75313 帝国歼星舰',
    sellerEmail: 'feijiayi@example.com',
    rootName: '母婴用品',
    subName: '玩具乐器',
    brandName: 'LEGO',
    price: '5499.00',
    stock: 5,
    shippingFee: '50.00',
    tax: '15.00',
    summary: '丹麦原箱 / 美国直邮',
    description: '星球大战收藏家系列；6,022 块；72cm 长。',
    imagesCount: 5,
    aftersaleType: 'none',
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 9,
    viewCount: 1320,
    favoriteCount: 64,
    daysAgoCreated: 14
  },
  {
    title: 'Penguin Classics 1984 英文原版',
    sellerEmail: 'cuiyuting@example.com',
    rootName: '图书音像',
    subName: '进口原版',
    brandName: 'Penguin',
    price: '89.00',
    stock: 60,
    shippingFee: '8.00',
    tax: '0.00',
    summary: '英国 Penguin 经典版 / 现货',
    description: '乔治·奥威尔《1984》；Penguin Modern Classics 系列；平装。',
    imagesCount: 2,
    aftersaleType: 'none',
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 38,
    viewCount: 980,
    favoriteCount: 22,
    daysAgoCreated: 12
  },
  {
    title: 'Pampers 帮宝适日本顶配纸尿裤 NB 90 片',
    sellerEmail: 'tangchuyu@example.com',
    rootName: '母婴用品',
    subName: '婴童用品',
    brandName: 'Pampers',
    price: '188.00',
    stock: 120,
    shippingFee: '25.00',
    tax: '6.00',
    summary: '日本 Pampers 一级帮 / 直邮',
    description: '一级帮（顶配）NB 90 片；超薄柔软。',
    imagesCount: 3,
    aftersaleType: 'none',
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 312,
    viewCount: 8980,
    favoriteCount: 542,
    daysAgoCreated: 36
  },
  {
    title: 'Microsoft Surface Pro 9 i7 16GB 512GB',
    sellerEmail: 'jianglinyu@example.com',
    rootName: '电脑整机',
    subName: '平板',
    brandName: 'Microsoft',
    price: '11299.00',
    stock: 7,
    shippingFee: '0.00',
    tax: '30.00',
    summary: '美版含原装键盘',
    description: 'i7-1255U / 16GB / 512GB / 13" 触屏 / 含 Type Cover。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 5,
    viewCount: 680,
    favoriteCount: 28,
    daysAgoCreated: 8
  }
];

// 5 NORMAL+off-shelf
const SEEDS_NORMAL_OFF: ProductSeed[] = [
  {
    title: 'Apple iPad Pro 12.9 M2 256GB WiFi 灰',
    sellerEmail: 'zhanglilin@example.com',
    rootName: '电脑整机',
    subName: '平板',
    brandName: 'Apple',
    price: '8499.00',
    stock: 0,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '美版 12.9 寸 256GB',
    description: 'M2 芯片 / 12.9 寸 Liquid Retina XDR / 256GB / WiFi 版。',
    imagesCount: 3,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'off-shelf',
    salesCount: 8,
    viewCount: 720,
    favoriteCount: 28,
    daysAgoCreated: 100
  },
  {
    title: '小米 14 Pro 12+512 钛金属边框',
    sellerEmail: 'songruohan@example.com',
    rootName: '手机数码',
    subName: '手机',
    brandName: '小米',
    price: '4699.00',
    stock: 0,
    shippingFee: '15.00',
    tax: '0.00',
    summary: '国行新机 / 缺货中',
    description: '骁龙 8 Gen 3 / 徕卡光学。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'off-shelf',
    salesCount: 12,
    viewCount: 980,
    favoriteCount: 38,
    daysAgoCreated: 65
  },
  {
    title: 'Nike Dunk Low Panda 黑白熊猫',
    sellerEmail: 'fengwenbo@example.com',
    rootName: '运动户外',
    subName: '运动鞋',
    brandName: 'Nike',
    price: '799.00',
    stock: 0,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '已售罄 / 等待补货',
    description: '经典黑白熊猫配色。',
    imagesCount: 3,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'off-shelf',
    salesCount: 142,
    viewCount: 6890,
    favoriteCount: 412,
    daysAgoCreated: 80
  },
  {
    title: 'YSL 圆管 21 番茄红口红',
    sellerEmail: 'liaoyichen@example.com',
    rootName: '美妆护肤',
    subName: '彩妆',
    brandName: 'YSL',
    price: '380.00',
    stock: 0,
    shippingFee: '8.00',
    tax: '0.00',
    summary: '法国直邮 / 缺货',
    description: 'YSL 圆管唇膏 # 21；经典番茄红。',
    imagesCount: 2,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'off-shelf',
    salesCount: 56,
    viewCount: 2380,
    favoriteCount: 142,
    daysAgoCreated: 42
  },
  {
    title: 'Bose QuietComfort 45 降噪耳机',
    sellerEmail: 'duomujie@example.com',
    rootName: '手机数码',
    subName: '影音娱乐',
    brandName: 'Bose',
    price: '1799.00',
    stock: 0,
    shippingFee: '25.00',
    tax: '0.00',
    summary: '美版 / 待补货',
    description: 'BOSE 经典降噪头戴；24 小时续航。',
    imagesCount: 3,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'off-shelf',
    salesCount: 19,
    viewCount: 1420,
    favoriteCount: 67,
    daysAgoCreated: 26
  }
];

// 5 PENDING_AUDIT
const SEEDS_PENDING: ProductSeed[] = [
  {
    title: 'Apple Vision Pro 256GB 美版',
    sellerEmail: 'zhanglilin@example.com',
    rootName: '手机数码',
    subName: '影音娱乐',
    brandName: 'Apple',
    price: '28999.00',
    stock: 2,
    shippingFee: '100.00',
    tax: '50.00',
    summary: '美国第一手 / 含税申报',
    description: '苹果首款空间计算头戴显示器；M2 + R1。',
    imagesCount: 5,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'PENDING_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 1
  },
  {
    title: 'GoPro HERO 12 Black 黑色',
    sellerEmail: 'yangjianjun@example.com',
    rootName: '手机数码',
    subName: '摄影摄像',
    brandName: 'GoPro',
    price: '2899.00',
    stock: 8,
    shippingFee: '15.00',
    tax: '0.00',
    summary: '美版全套配件',
    description: '5.3K60 视频 / 蓝牙音频 / HyperSmooth 6.0。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'PENDING_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 2
  },
  {
    title: 'Charlotte Tilbury 魔法粉饼',
    sellerEmail: 'liaoyichen@example.com',
    rootName: '美妆护肤',
    subName: '彩妆',
    brandName: 'Charlotte Tilbury',
    price: '480.00',
    stock: 30,
    shippingFee: '15.00',
    tax: '0.00',
    summary: '英国直邮 / 全新',
    description: 'Airbrush Flawless Setting 定妆粉饼。',
    imagesCount: 3,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'PENDING_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 3
  },
  {
    title: 'Patagonia 抓绒衣 Better Sweater',
    sellerEmail: 'cuiyuting@example.com',
    rootName: '运动户外',
    subName: '户外装备',
    brandName: 'Patagonia',
    price: '1180.00',
    stock: 12,
    shippingFee: '25.00',
    tax: '0.00',
    summary: '美版 / 多色',
    description: 'Better Sweater 经典抓绒夹克；100% 再生聚酯纤维。',
    imagesCount: 4,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'PENDING_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 4
  },
  {
    title: 'Swisse 葡萄籽精华片 180 粒',
    sellerEmail: 'wuxiaomeng@example.com',
    rootName: '食品饮料',
    subName: '保健食品',
    brandName: 'Swisse',
    price: '218.00',
    stock: 50,
    shippingFee: '20.00',
    tax: '8.00',
    summary: '澳洲超市直采',
    description: 'Swisse 葡萄籽提取物 180 粒；抗氧化。',
    imagesCount: 2,
    aftersaleType: 'none',
    status: 'PENDING_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 5
  }
];

// 3 IN_AUDIT
const SEEDS_IN_AUDIT: ProductSeed[] = [
  {
    title: 'DJI Mavic 3 Pro 大疆无人机',
    sellerEmail: 'feijiayi@example.com',
    rootName: '手机数码',
    subName: '摄影摄像',
    brandName: 'DJI',
    price: '15999.00',
    stock: 3,
    shippingFee: '50.00',
    tax: '0.00',
    summary: '国行行货 / 全新',
    description: '哈苏三摄相机；43min 续航；15km 图传。',
    imagesCount: 5,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'IN_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 6
  },
  {
    title: 'Peloton 智能动感单车',
    sellerEmail: 'mengsi@example.com',
    rootName: '运动户外',
    subName: '健身器材',
    brandName: 'Peloton',
    price: '12999.00',
    stock: 2,
    shippingFee: '200.00',
    tax: '50.00',
    summary: '美国 Peloton 官方机',
    description: 'Bike+ 完整套装；22" 高清触控屏；含 1 年课程。',
    imagesCount: 4,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'IN_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 7
  },
  {
    title: 'Lululemon Define 夹克女装',
    sellerEmail: 'qiansiya@example.com',
    rootName: '运动户外',
    subName: '运动服',
    brandName: 'Lululemon',
    price: '988.00',
    stock: 15,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '美国官网 / 多色',
    description: 'Define 经典紧身夹克；Luon 面料；适合运动与日常。',
    imagesCount: 4,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'IN_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    daysAgoCreated: 8
  }
];

// 2 FROZEN
const SEEDS_FROZEN: ProductSeed[] = [
  {
    title: '"特价" 仿大牌包包',
    sellerEmail: 'baoyi@example.com',
    rootName: '服饰内衣',
    subName: '配饰',
    brandName: 'Coach',
    price: '380.00',
    stock: 50,
    shippingFee: '20.00',
    tax: '0.00',
    summary: '仿大牌 / 涉嫌侵权（已冻结）',
    description: '该商品因涉嫌品牌侵权被冻结。',
    imagesCount: 2,
    aftersaleType: 'none',
    status: 'FROZEN',
    shelfStatus: 'off-shelf',
    salesCount: 2,
    viewCount: 380,
    favoriteCount: 1,
    daysAgoCreated: 120
  },
  {
    title: '"原厂直邮" 仿三无奶粉',
    sellerEmail: 'guodanyu@example.com',
    rootName: '母婴用品',
    subName: '奶粉辅食',
    brandName: '雀巢',
    price: '88.00',
    stock: 200,
    shippingFee: '15.00',
    tax: '0.00',
    summary: '来源不明 / 已冻结',
    description: '该商品因奶粉来源无法核实被风控冻结。',
    imagesCount: 1,
    aftersaleType: 'none',
    status: 'FROZEN',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 220,
    favoriteCount: 0,
    daysAgoCreated: 95
  }
];

// 3 NORMAL 含 draftPatch（信息修改待审）
const SEEDS_WITH_DRAFT: ProductSeed[] = [
  {
    title: 'Apple AirPods Pro 2 - USB-C',
    sellerEmail: 'zhanglilin@example.com',
    rootName: '手机数码',
    subName: '影音娱乐',
    brandName: 'Apple',
    price: '1799.00',
    stock: 25,
    shippingFee: '15.00',
    tax: '0.00',
    summary: '美版 / USB-C 接口',
    description: 'AirPods Pro 2 USB-C 接口版本；H2 芯片；ANC。',
    imagesCount: 3,
    aftersaleType: 'shop-warranty',
    aftersaleDays: 365,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 67,
    viewCount: 3210,
    favoriteCount: 142,
    daysAgoCreated: 35,
    draftPatch: {
      title: 'Apple AirPods Pro 2 USB-C 接口版（2024 新批次）',
      summary: '美版直邮 / USB-C 接口 / 2024 新批次现货'
    },
    draftStatus: 'pending',
    daysAgoDraftSubmit: 1
  },
  {
    title: 'Estée Lauder Advanced Night Repair 30ml',
    sellerEmail: 'liaoyichen@example.com',
    rootName: '美妆护肤',
    subName: '面部护肤',
    brandName: '雅诗兰黛',
    price: '420.00',
    stock: 60,
    shippingFee: '15.00',
    tax: '5.00',
    summary: '雅诗兰黛小棕瓶 30ml',
    description: '雅诗兰黛智妍修护精华液 30ml 小瓶装。',
    imagesCount: 2,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 89,
    viewCount: 4620,
    favoriteCount: 245,
    daysAgoCreated: 28,
    draftPatch: {
      description:
        '雅诗兰黛智妍修护精华液 30ml 小瓶装。\n新批次：2024 年 8 月生产；保质期 3 年。\n美国免税店直采 / 含原盒。',
      aftersaleType: 'shop-warranty',
      aftersaleDays: 90
    },
    draftStatus: 'pending',
    daysAgoDraftSubmit: 2
  },
  {
    title: 'New Balance 990v6 Made in USA',
    sellerEmail: 'fengwenbo@example.com',
    rootName: '运动户外',
    subName: '运动鞋',
    brandName: 'New Balance',
    price: '1599.00',
    stock: 16,
    shippingFee: '25.00',
    tax: '0.00',
    summary: '美国制造 / 灰色经典',
    description: 'NB 990v6；美国本土工厂制造；ENCAP 缓震。',
    imagesCount: 4,
    aftersaleType: '7day-no-reason',
    aftersaleDays: 7,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: 24,
    viewCount: 1980,
    favoriteCount: 67,
    daysAgoCreated: 18,
    draftPatch: {
      summary: '美国制造 / 灰色 / 黑色 / 海军蓝 多色现货',
      stock: 32
    },
    draftStatus: 'pending',
    daysAgoDraftSubmit: 3
  }
];

const ALL_SEEDS: ProductSeed[] = [
  ...SEEDS_NORMAL_ON,
  ...SEEDS_NORMAL_OFF,
  ...SEEDS_PENDING,
  ...SEEDS_IN_AUDIT,
  ...SEEDS_FROZEN,
  ...SEEDS_WITH_DRAFT
];

function buildProduct(s: ProductSeed): Product {
  const buyer = buyerByEmail(s.sellerEmail);
  if (!buyer) throw new Error(`buyer not found: ${s.sellerEmail}`);
  const { id: catId, path: catPath } = leafIdByPath(s.rootName, s.subName, s.brandName);
  const id = nextProdId();
  const images: Api.Product.ProductMedia[] = [];
  for (let i = 0; i < s.imagesCount; i += 1) images.push(img(id * 10 + i, i + 1, catPath));
  const createdAt = daysAgo(s.daysAgoCreated);
  return {
    id,
    code: pcode(id),
    title: s.title,
    sellerId: buyer.id,
    sellerName: buyer.nickname,
    categoryId: catId,
    categoryPath: catPath,
    price: s.price,
    stock: s.stock,
    shippingFee: s.shippingFee,
    tax: s.tax,
    images,
    summary: s.summary,
    description: s.description,
    aftersaleType: s.aftersaleType,
    aftersaleDays: s.aftersaleDays,
    overseasCustoms: s.overseasCustoms,
    status: s.status,
    shelfStatus: s.shelfStatus,
    draftPatch: s.draftPatch,
    draftStatus: s.draftStatus,
    draftSubmitAt: s.daysAgoDraftSubmit !== undefined ? daysAgo(s.daysAgoDraftSubmit) : undefined,
    draftAuditOpinion: s.draftAuditOpinion,
    salesCount: s.salesCount,
    viewCount: s.viewCount,
    favoriteCount: s.favoriteCount,
    createdAt,
    submittedAt: createdAt,
    publishedAt: s.status === 'NORMAL' || s.status === 'FROZEN' ? daysAgo(s.daysAgoCreated - 1) : undefined,
    updatedAt: createdAt
  };
}

export const PRODUCTS: Product[] = ALL_SEEDS.map(buildProduct);

export function findProductById(id: number): Product | undefined {
  return PRODUCTS.find(p => p.id === id);
}

export function findProductsBySeller(sellerId: number): Product[] {
  return PRODUCTS.filter(p => p.sellerId === sellerId && p.status !== 'DELETED');
}

/** 按分类 id（任意级别）过滤；支持聚合 1/2 级 */
export function findProductsByCategory(categoryId: number, descendantIdsFn: (id: number) => number[]): Product[] {
  const ids = descendantIdsFn(categoryId);
  return PRODUCTS.filter(p => ids.includes(p.categoryId) && p.status !== 'DELETED');
}

export function appendProduct(p: Omit<Product, 'id' | 'code'>): Product {
  const id = nextProdId();
  const next: Product = { id, code: pcode(id), ...p };
  PRODUCTS.unshift(next);
  return next;
}

/** 合并 draftPatch 到主字段（审核通过用） */
export function applyDraftPatch(product: Product): void {
  const patch = product.draftPatch;
  if (!patch) return;
  Object.assign(product, patch);
  product.draftPatch = undefined;
  product.draftStatus = undefined;
  product.draftSubmitAt = undefined;
  product.draftAuditOpinion = undefined;
  product.updatedAt = nowIso();
}

/** 拒绝 draftPatch：保留 patch 但状态置 rejected */
export function rejectDraftPatch(product: Product, opinion: string): void {
  if (!product.draftPatch) return;
  product.draftStatus = 'rejected';
  product.draftAuditOpinion = opinion;
  product.updatedAt = nowIso();
}

/** 计算某买手"所有 on-shelf 商品中最贵单价" */
export function maxOnShelfPrice(sellerId: number): number {
  const list = PRODUCTS.filter(p => p.sellerId === sellerId && p.status === 'NORMAL' && p.shelfStatus === 'on-shelf');
  if (!list.length) return 0;
  return Math.max(...list.map(p => Number(p.price)));
}

/** 统计辅助 */
export function countByStatus(): Record<Api.Product.ProductStatus, number> {
  const init: Record<Api.Product.ProductStatus, number> = {
    PENDING_AUDIT: 0,
    IN_AUDIT: 0,
    NORMAL: 0,
    FROZEN: 0,
    DELETED: 0
  };
  PRODUCTS.forEach(p => {
    init[p.status] += 1;
  });
  return init;
}

export function countByShelf(): Record<Api.Product.ShelfStatus, number> {
  const init: Record<Api.Product.ShelfStatus, number> = { 'on-shelf': 0, 'off-shelf': 0 };
  PRODUCTS.forEach(p => {
    if (p.status === 'NORMAL') init[p.shelfStatus] += 1;
  });
  return init;
}

export function topCategories(top = 10): Api.Product.CategoryDist[] {
  const map = new Map<number, { path: string; count: number }>();
  PRODUCTS.forEach(p => {
    if (p.status === 'DELETED') return;
    const cur = map.get(p.categoryId);
    if (cur) cur.count += 1;
    else map.set(p.categoryId, { path: p.categoryPath, count: 1 });
  });
  return Array.from(map.entries())
    .map(([id, v]) => ({ categoryId: id, categoryPath: v.path, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

export function topSellers(top = 10): Api.Product.SellerDist[] {
  const map = new Map<number, { name: string; count: number }>();
  PRODUCTS.forEach(p => {
    if (p.status === 'DELETED') return;
    const cur = map.get(p.sellerId);
    if (cur) cur.count += 1;
    else map.set(p.sellerId, { name: p.sellerName, count: 1 });
  });
  return Array.from(map.entries())
    .map(([id, v]) => ({ sellerId: id, sellerName: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}
