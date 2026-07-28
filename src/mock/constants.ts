/**
 * 全局常量：演示用户切换池 / 品牌 / 主题色。
 *
 * 该模块同时被 PC 工程和 H5 工程通过 `@shared/constants` 引用。
 */

export interface MockUserOption {
  userId: number;
  label: string;
  desc: string;
}

/**
 * 演示用户：顶部菜单 / H5 设置页有切换下拉。
 * userId 必须存在于 [mock/data/users.ts](./mock/data/users.ts) USERS 池中。
 */
export const MOCK_USERS: MockUserOption[] = [
  { userId: 1,  label: '王小美', desc: '顾客 · VIP1 · KYC 已过' },
  { userId: 2,  label: '李建华', desc: '顾客 · 待 KYC (申请买手场景)' },
  { userId: 6,  label: '陈乔乔', desc: '顾客 · 黑名单测试' },
  { userId: 21, label: '张丽琳', desc: '买手 · VIP1 · KYC 已过' },
  { userId: 22, label: '杨建军', desc: '买手 · VIP2 · 大户' }
];

export const DEFAULT_MOCK_USER_ID = MOCK_USERS[0].userId;

export const BRAND = {
  name: '油宝',
  fullName: '油宝 · Web3 USDT 跨境代购',
  slogan: '链上撮合 · USDT 结算 · 全球代购',
  copyright: '© 2026 油宝 · 原型演示'
};

export const THEME = {
  /** Arco Design primary（PC 端使用） */
  primary: '#165DFF',
  /** wot-design-uni primary（H5 端使用） */
  primaryH5: '#4D80F0',
  success: '#00B42A',
  warning: '#FF7D00',
  danger: '#F53F3F',
  info: '#86909C'
};

/** sys-config 中 buyer.enable_registration 的镜像（PC + H5 不直接连后台时使用） */
export const FEATURE_FLAGS = {
  buyerRegistrationOpen: true
};

/** 当前演示用户在 localStorage 的存储 key */
export const STORAGE_KEY = {
  currentUserId: 'bw-shop-current-user-id',
  currentAudience: 'bw-shop-current-audience',
  cart: 'bw-shop-cart'
};

export type Audience = 'customer' | 'buyer';
