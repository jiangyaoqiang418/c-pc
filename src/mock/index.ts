/**
 * @youbao/shared 主入口。
 *
 * 重新导出：
 * - api：mock API 函数（按模块分类）
 * - constants：MOCK_USERS / BRAND / THEME 等
 * - utils：format / mock-delay
 * - enums：label/color/icon 映射
 *
 * 类型定义在 typings/api/ 下，通过 tsconfig 全局 declare namespace Api 暴露。
 */
export * from './api';
export * from './constants';
export * from './utils/format';
export * as enums from './enums';
