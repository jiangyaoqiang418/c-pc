/**
 * 商品分类内存池（R-DATA-20 3 级强制）。
 *
 * 10 大类 / ~40 小类 / ~200 品牌；JD 风格。
 * 内置 system 分类 + 3 个 buyer 申请通过的演示分类。
 */

type CategoryNode = Api.Category.CategoryNode;
type FlatCategory = Api.Category.FlatCategory;
type CategoryLevel = Api.Category.CategoryLevel;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function nowIso() {
  return new Date().toISOString();
}

function daysAgo(d: number): string {
  const t = new Date('2025-09-01T10:00:00+08:00');
  t.setDate(t.getDate() + d);
  return t.toISOString();
}

/** 树定义 DSL：[大类, 小类列表] / 小类: [小类, 品牌列表] */
type BrandSeed = string | { name: string; icon?: string };
type SubSeed = [string, BrandSeed[]];
type RootSeed = [string, string, SubSeed[]]; // [大类, icon, [小类列表]]

const TREE_SEED: RootSeed[] = [
  [
    '电脑整机',
    'i-mdi-laptop',
    [
      ['笔记本', ['Apple', 'Lenovo', 'Dell', 'HP', 'ASUS', 'Microsoft', '华为', 'Razer']],
      ['台式机', ['Lenovo', 'Dell', 'HP', 'ASUS', '海尔']],
      ['平板', ['Apple', 'Samsung', '华为', '小米', 'Microsoft']],
      ['一体机', ['Apple', 'Lenovo', 'Dell', 'HP']]
    ]
  ],
  [
    '手机数码',
    'i-mdi-cellphone',
    [
      ['手机', ['Apple', 'Samsung', '华为', '小米', 'OPPO', 'Vivo', '一加', '荣耀']],
      ['智能穿戴', ['Apple', '华为', '小米', 'Garmin', 'Fitbit']],
      ['摄影摄像', ['Sony', 'Canon', 'Nikon', 'Fujifilm', 'GoPro', 'DJI']],
      ['影音娱乐', ['Sony', 'Bose', '森海塞尔', 'Apple', 'JBL']]
    ]
  ],
  [
    '家用电器',
    'i-mdi-washing-machine',
    [
      ['大家电', ['美的', '海尔', '西门子', 'LG', '松下', '三星']],
      ['小家电', ['美的', 'Dyson', '飞利浦', '苏泊尔', '九阳']],
      ['厨房电器', ['美的', '苏泊尔', '九阳', '老板', '方太']],
      ['个护健康', ['Philips', '飞利浦', 'Braun', '松下']]
    ]
  ],
  [
    '美妆护肤',
    'i-mdi-lipstick',
    [
      ['面部护肤', ['SK-II', '雅诗兰黛', 'La Mer', '兰蔻', '资生堂', 'Clinique']],
      ['彩妆', ['MAC', 'Charlotte Tilbury', 'NARS', 'YSL', '迪奥', '阿玛尼']],
      ['男士护理', ["Kiehl's", "L'Oréal", 'Nivea', 'Gillette']],
      ['香水', ['Chanel', '迪奥', 'Jo Malone', 'Tom Ford', 'Le Labo']]
    ]
  ],
  [
    '个人护理',
    'i-mdi-toothbrush-paste',
    [
      ['口腔', ['Philips', 'Oral-B', 'Sonicare', '高露洁']],
      ['美发', ['Olaplex', '资生堂', 'Kerastase', '欧莱雅']],
      ['身体护理', ['Aesop', "L'Occitane", '欧舒丹', 'Body Shop']],
      ['保健', ['Swisse', 'GNC', '汤臣倍健', 'BLACKMORES']]
    ]
  ],
  [
    '母婴用品',
    'i-mdi-baby-carriage',
    [
      ['奶粉辅食', ['Aptamil', '美素佳儿', '雀巢', 'A2', '惠氏']],
      ['婴童用品', ['Pampers', '花王', '好奇', 'Combi']],
      ['玩具乐器', ['LEGO', 'Fisher-Price', '万代', 'Hape']],
      ['童装', ['优衣库', 'Zara Kids', 'H&M Kids', 'GAP Kids']]
    ]
  ],
  [
    '食品饮料',
    'i-mdi-food',
    [
      ['进口零食', ['Lindt', 'Ferrero', 'Lotte', '不二家', "Walker's"]],
      ['茶酒', ['Lipton', 'Twinings', 'Maxwell', 'Nespresso']],
      ['保健食品', ['Swisse', 'BLACKMORES', "Nature's Way", 'GNC']],
      ['生鲜', ['佳沛', '都乐', '新奇士']]
    ]
  ],
  [
    '服饰内衣',
    'i-mdi-tshirt-crew',
    [
      ['男装', ['Uniqlo', 'Zara', 'H&M', 'GAP', "Levi's", 'Polo Ralph Lauren']],
      ['女装', ['Uniqlo', 'Zara', 'H&M', 'GAP', 'Mango', 'COS']],
      ['内衣', ['Calvin Klein', "Victoria's Secret", '优衣库', 'Tommy Hilfiger']],
      ['配饰', ['Coach', 'Michael Kors', 'Kate Spade', 'Fossil']]
    ]
  ],
  [
    '运动户外',
    'i-mdi-run',
    [
      ['运动鞋', ['Nike', 'Adidas', 'New Balance', 'ASICS', 'Puma', 'Under Armour']],
      ['运动服', ['Nike', 'Adidas', 'Lululemon', 'Under Armour', 'Puma']],
      ['户外装备', ['The North Face', 'Patagonia', 'Columbia', "Arc'teryx", 'Salomon']],
      ['健身器材', ['Bowflex', 'Peloton', 'NordicTrack', 'Concept2']]
    ]
  ],
  [
    '图书音像',
    'i-mdi-book-open-variant',
    [
      ['文学', ['商务印书馆', '人民文学', '上海译文', '三联书店']],
      ['童书', ['启发文化', '蒲蒲兰', '童趣出版社']],
      ['教辅', ['人民教育', '高等教育', '机械工业']],
      ['进口原版', ['Penguin', 'Oxford', 'Cambridge', 'HarperCollins']]
    ]
  ]
];

function brandName(b: BrandSeed): string {
  return typeof b === 'string' ? b : b.name;
}
function brandIcon(b: BrandSeed): string | undefined {
  return typeof b === 'string' ? undefined : b.icon;
}

function pinyinCode(name: string): string {
  // 简化：mock 用名字 lowercase + 去空格代替拼音；接入真实拼音库可后续替换
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

/** 内存池（嵌套树） */
export const CATEGORIES: CategoryNode[] = [];

function buildSystemTree() {
  let dayOffset = 0;
  TREE_SEED.forEach((root, rootIdx) => {
    const [rootName, rootIcon, subs] = root;
    const rootId = nextId();
    const rootNode: CategoryNode = {
      id: rootId,
      code: pinyinCode(rootName),
      name: rootName,
      level: 1,
      parentId: null,
      parentPath: '',
      sort: rootIdx + 1,
      status: '1',
      icon: rootIcon,
      description: '',
      productCount: 0,
      createdAt: daysAgo(dayOffset),
      updatedAt: daysAgo(dayOffset),
      creatorType: 'system',
      children: []
    };
    dayOffset += 1;
    subs.forEach((sub, subIdx) => {
      const [subName, brands] = sub;
      const subId = nextId();
      const subNode: CategoryNode = {
        id: subId,
        code: `${rootNode.code}/${pinyinCode(subName)}`,
        name: subName,
        level: 2,
        parentId: rootId,
        parentPath: rootName,
        sort: subIdx + 1,
        status: '1',
        description: '',
        productCount: 0,
        createdAt: daysAgo(dayOffset),
        updatedAt: daysAgo(dayOffset),
        creatorType: 'system',
        children: []
      };
      dayOffset += 0.5;
      brands.forEach((brand, brandIdx) => {
        const brandStr = brandName(brand);
        const leafNode: CategoryNode = {
          id: nextId(),
          code: `${subNode.code}/${pinyinCode(brandStr)}`,
          name: brandStr,
          level: 3,
          parentId: subId,
          parentPath: `${rootName} / ${subName}`,
          sort: brandIdx + 1,
          status: '1',
          icon: brandIcon(brand),
          description: '',
          productCount: 0,
          createdAt: daysAgo(dayOffset),
          updatedAt: daysAgo(dayOffset),
          creatorType: 'system'
        };
        subNode.children!.push(leafNode);
      });
      rootNode.children!.push(subNode);
    });
    CATEGORIES.push(rootNode);
  });
}

buildSystemTree();

/**
 * 追加 3 个 buyer 申请通过的演示分类（审计示例）：
 * - 服饰内衣 / 男装 / Carhartt（买手 21 张丽琳申请）
 * - 食品饮料 / 进口零食 / Ritter Sport（买手 22 杨建军申请）
 * - 美妆护肤 / 面部护肤 / Drunk Elephant（买手 23 宋若涵申请）
 */
interface BuyerCategorySpec {
  rootName: string;
  subName: string;
  brandName: string;
  buyerId: number;
  daysOld: number;
}

function addBuyerCategory(spec: BuyerCategorySpec) {
  const root = CATEGORIES.find(c => c.name === spec.rootName);
  if (!root) return;
  const sub = root.children?.find(c => c.name === spec.subName);
  if (!sub) return;
  const leaf: CategoryNode = {
    id: nextId(),
    code: `${sub.code}/${pinyinCode(spec.brandName)}`,
    name: spec.brandName,
    level: 3,
    parentId: sub.id,
    parentPath: `${spec.rootName} / ${spec.subName}`,
    sort: (sub.children?.length || 0) + 1,
    status: '1',
    description: '',
    productCount: 0,
    createdAt: daysAgo(180 - spec.daysOld),
    updatedAt: daysAgo(180 - spec.daysOld),
    creatorType: 'buyer',
    creatorId: spec.buyerId
  };
  sub.children?.push(leaf);
}

addBuyerCategory({ rootName: '服饰内衣', subName: '男装', brandName: 'Carhartt', buyerId: 21, daysOld: 30 });
addBuyerCategory({ rootName: '食品饮料', subName: '进口零食', brandName: 'Ritter Sport', buyerId: 22, daysOld: 60 });
addBuyerCategory({ rootName: '美妆护肤', subName: '面部护肤', brandName: 'Drunk Elephant', buyerId: 23, daysOld: 90 });

// ===== 工具 API =====

export function walkAll(visit: (node: CategoryNode) => void) {
  function rec(nodes: CategoryNode[]) {
    nodes.forEach(n => {
      visit(n);
      if (n.children) rec(n.children);
    });
  }
  rec(CATEGORIES);
}

export function findCategoryById(id: number): CategoryNode | undefined {
  let hit: CategoryNode | undefined;
  walkAll(n => {
    if (n.id === id) hit = n;
  });
  return hit;
}

/** 仅叶子（level=3 且无 children） */
export function findLeafById(id: number): CategoryNode | undefined {
  const c = findCategoryById(id);
  return c && c.level === 3 ? c : undefined;
}

export function findChildren(parentId: number | null): CategoryNode[] {
  if (parentId === null) return CATEGORIES;
  const p = findCategoryById(parentId);
  return p?.children || [];
}

/** 取节点 + 其所有后代的 id 集合（用于"商品挂在该节点下"的判断） */
export function descendantIds(id: number): number[] {
  const out: number[] = [];
  const start = findCategoryById(id);
  if (!start) return out;
  function rec(n: CategoryNode) {
    out.push(n.id);
    n.children?.forEach(rec);
  }
  rec(start);
  return out;
}

/** 路径字符串：'电脑整机 / 笔记本 / Apple' */
export function categoryPath(id: number): string {
  const c = findCategoryById(id);
  if (!c) return '';
  if (c.level === 1) return c.name;
  if (c.level === 2) return `${c.parentPath} / ${c.name}`;
  return `${c.parentPath} / ${c.name}`;
}

/** 扁平化（用于 /category/flat 表格展示） */
export function flatList(): FlatCategory[] {
  const out: FlatCategory[] = [];
  walkAll(n => {
    out.push({
      id: n.id,
      code: n.code,
      name: n.name,
      level: n.level,
      parentId: n.parentId,
      parentPath: n.parentPath || '',
      sort: n.sort,
      status: n.status,
      icon: n.icon,
      description: n.description,
      productCount: n.productCount,
      creatorType: n.creatorType,
      creatorId: n.creatorId,
      childrenCount: n.children?.length || 0,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt
    });
  });
  return out;
}

function buildParentPath(parent: CategoryNode | null | undefined): string {
  if (!parent) return '';
  if (parent.level === 1) return parent.name;
  return `${parent.parentPath} / ${parent.name}`;
}

/** 追加新节点（用于审核通过 + 管理员新增） */
export function appendCategory(p: {
  name: string;
  level: CategoryLevel;
  parentId: number | null;
  icon?: string;
  description?: string;
  creatorType: Api.Category.CreatorType;
  creatorId?: number;
}): CategoryNode {
  const parent = p.parentId !== null ? findCategoryById(p.parentId) : null;
  if (p.parentId !== null && !parent) throw new Error('parent not found');
  if (p.level !== 1 && !parent) throw new Error('level>1 must have parent');
  if (parent && parent.level !== ((p.level - 1) as CategoryLevel)) {
    throw new Error(`level ${p.level} parent must be ${p.level - 1}`);
  }
  const code = parent ? `${parent.code}/${pinyinCode(p.name)}` : pinyinCode(p.name);
  const node: CategoryNode = {
    id: nextId(),
    code,
    name: p.name,
    level: p.level,
    parentId: p.parentId,
    parentPath: buildParentPath(parent),
    sort: (parent?.children?.length || (p.level === 1 ? CATEGORIES.length : 0)) + 1,
    status: '1',
    icon: p.icon,
    description: p.description,
    productCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    creatorType: p.creatorType,
    creatorId: p.creatorId
  };
  if (p.level === 1) {
    CATEGORIES.push(node);
  } else if (parent) {
    if (!parent.children) parent.children = [];
    parent.children.push(node);
  }
  return node;
}

/** 重算 productCount（含子节点累计） */
export function recomputeProductCount(getCountByLeafId: (leafId: number) => number) {
  walkAll(n => {
    n.productCount = 0;
  });
  // 先填叶子（level 3）
  walkAll(n => {
    if (n.level === 3) n.productCount = getCountByLeafId(n.id);
  });
  // 自下而上累加：level 2 = 子叶子总和；level 1 = 子小类总和
  function sumChildren(node: CategoryNode): number {
    if (!node.children || !node.children.length) return node.productCount;
    let total = 0;
    node.children.forEach(c => {
      total += sumChildren(c);
    });
    node.productCount = node.level === 3 ? node.productCount : total;
    return node.productCount;
  }
  CATEGORIES.forEach(sumChildren);
}

export function countLeaves(): number {
  let n = 0;
  walkAll(c => {
    if (c.level === 3) n += 1;
  });
  return n;
}
