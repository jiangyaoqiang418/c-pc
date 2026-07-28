/**
 * mock 异步包装：模拟网络延迟，让 mock API 行为接近真实接口。
 */

export function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise(r => setTimeout(() => r(data), ms));
}

export interface Paginated<T> {
  current: number;
  size: number;
  total: number;
  records: T[];
}

export function delayPaginated<T>(arr: T[], current = 1, size = 10, ms = 200): Promise<Paginated<T>> {
  const start = (current - 1) * size;
  return delay<Paginated<T>>(
    {
      current,
      size,
      total: arr.length,
      records: arr.slice(start, start + size)
    },
    ms
  );
}
