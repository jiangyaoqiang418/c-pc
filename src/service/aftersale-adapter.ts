/**
 * 售后接口尚未具备完整后端契约时的唯一调用边界。
 * 页面不得直接依赖 Mock；后端提供创建、详情、撤销等接口后，仅替换本文件。
 */
import { aftersaleApi } from '@shared';

export function fetchMyAftersales(params: Parameters<typeof aftersaleApi.fetchMyAftersales>[0]) {
  return aftersaleApi.fetchMyAftersales(params);
}

export function fetchAftersaleDetail(id: number) {
  return aftersaleApi.fetchAftersaleDetail(id);
}

export function createAftersale(params: Parameters<typeof aftersaleApi.createAftersaleMock>[0]) {
  return aftersaleApi.createAftersaleMock(params);
}

export function cancelAftersale(id: number) {
  return aftersaleApi.cancelAftersaleMock(id);
}
