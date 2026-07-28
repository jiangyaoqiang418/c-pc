/**
 * shared/api 统一导出入口。
 * PC + H5 通过 `@shared/api` 或 `@shared/api/<module>` 引用。
 */
export * as authApi from './auth';
export * as productApi from './product';
export * as orderApi from './order';
export * as walletApi from './wallet';
export * as financeApi from './finance';
export * as purchaseApi from './purchase';
export * as reviewApi from './review';
export * as aftersaleApi from './aftersale';
export * as imApi from './im';
export * as kycApi from './kyc';
export * as cmsApi from './cms';
export * as vipApi from './vip';
export * as pointApi from './point';
export * as buyerApi from './buyer';
export * as aiApi from './ai';
export * as addressApi from './address';

export type { Paginated } from '../utils/mock-delay';
export { delay, delayPaginated } from '../utils/mock-delay';
