/**
 * 用户标签池（R-DATA-11）。供 4.3 用户管理打标。
 */
type Tag = Api.User.Tag;

export const TAGS: Tag[] = [
  { id: 1, name: '高消费', color: 'orange', description: '近 30 天消费 ≥ 1000U', userCount: 0 },
  { id: 2, name: '商品收藏家', color: 'magenta', description: '收藏 ≥ 20 件商品', userCount: 0 },
  { id: 3, name: '复购客户', color: 'gold', description: '完成订单 ≥ 5 笔', userCount: 0 },
  { id: 4, name: '潜在买手', color: 'purple', description: 'KYC 通过但未缴押金', userCount: 0 },
  { id: 5, name: '高积分', color: 'volcano', description: '积分 ≥ 5000', userCount: 0 },
  { id: 6, name: '新注册', color: 'cyan', description: '注册 ≤ 7 天', userCount: 0 },
  { id: 7, name: '长期沉默', color: 'default', description: '近 90 天无活跃', userCount: 0 },
  { id: 8, name: '风险用户', color: 'red', description: '客诉率高或申诉多', userCount: 0 }
];

let tagIdCursor = 100;
export function takeNextTagId() {
  tagIdCursor += 1;
  return tagIdCursor;
}

export function findTagById(id: number) {
  return TAGS.find(t => t.id === id);
}

export function recomputeTagUserCount(allUserTagIds: number[][]) {
  const map = new Map<number, number>();
  allUserTagIds.forEach(arr => {
    arr.forEach(id => map.set(id, (map.get(id) || 0) + 1));
  });
  TAGS.forEach(t => {
    t.userCount = map.get(t.id) || 0;
  });
}
