export function parseDateValue(value?: string | number, endOfDay = false) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (/^\d+$/.test(value)) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

/** 日期选择器的结束日期按本地日历日包含到当天末尾。 */
export function isWithinDateRange(value: string | number | undefined, from?: string, to?: string) {
  const timestamp = parseDateValue(value);
  if (timestamp === undefined) return false;
  const fromTimestamp = parseDateValue(from);
  const toTimestamp = parseDateValue(to, true);
  return (fromTimestamp === undefined || timestamp >= fromTimestamp)
    && (toTimestamp === undefined || timestamp <= toTimestamp);
}

export function formatDateValue(value?: string | number, dateOnly = false) {
  const timestamp = parseDateValue(value);
  if (timestamp === undefined) return '—';
  const date = new Date(timestamp);
  return dateOnly ? date.toLocaleDateString() : date.toLocaleString();
}
