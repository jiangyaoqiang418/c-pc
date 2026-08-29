/** 将后端可能返回的数字时间戳安全转换为 ISO 字符串。 */
export function toIsoDate(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number' || /^\d+$/.test(value)) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  return value;
}
