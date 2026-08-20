/** 分页 total 仅用于统计和分页控件，不是业务 ID，统一转为安全的数值。 */
export function toPageTotal(value?: string | number) {
  const total = Number(value ?? 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}
