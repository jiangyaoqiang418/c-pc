/** 分页 total 仅用于统计和分页控件，不是业务 ID，统一转为安全的数值。 */
export function toPageTotal(value?: string | number) {
  const total = Number(value ?? 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

/**
 * 真实接口成功响应中的必需数组必须保持“异常”和“空数据”可区分。
 * 缺少数组时抛错，由页面现有错误态承接，避免把契约异常误显示成空态。
 */
export function requireArray<T>(value: unknown, label = '接口返回数据') {
  if (!Array.isArray(value)) throw new Error(`${label}格式异常`);
  return value as T[];
}
