/** 分页 total 仅用于统计和分页控件，不是业务 ID，统一转为安全的数值。 */
export function toPageTotal(value?: string | number) {
  const total = Number(value ?? 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

/** 分页器使用服务端实际步长；不能拿末页记录数推断页大小。 */
export function resolvePageSize(page: { size?: number; pageSize?: number }, requestedSize: number) {
  const value = Number(page.size ?? page.pageSize ?? requestedSize);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('分页大小异常，请重新加载');
  return value;
}

/**
 * 真实接口成功响应中的必需数组必须保持“异常”和“空数据”可区分。
 * 缺少数组时抛错，由页面现有错误态承接，避免把契约异常误显示成空态。
 */
export function requireArray<T>(value: unknown, label = '接口返回数据') {
  if (!Array.isArray(value)) throw new Error(`${label}格式异常`);
  return value as T[];
}

interface MergeSourcePage {
  total?: string | number;
  records: unknown[];
  size?: number;
  pageSize?: number;
}

/** 合并分页只取每个来源的前 current * size 条候选；同来源串行，最多四个来源并行。 */
export async function fetchMergeSourcePages<S, P extends MergeSourcePage>(options: {
  sources: S[];
  current: number;
  size: number;
  request: (source: S, pageNo: number, pageSize: number) => Promise<P>;
  recordId: (record: P['records'][number]) => string | number | undefined;
  signal?: AbortSignal;
}) {
  const { sources, current, size, request, recordId, signal } = options;
  const checkAbort = () => { signal?.throwIfAborted(); };
  async function boundedMap<T, R>(items: T[], run: (item: T, index: number) => Promise<R>) {
    const result = new Array<R>(items.length);
    let next = 0;
    let failed = false;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (!failed && next < items.length) {
        checkAbort();
        const index = next++;
        try {
          result[index] = await run(items[index], index);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }));
    return result;
  }
  function readTotal(page: P) {
    const total = Number(page.total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('分页总数异常，请重新加载');
    return total;
  }
  function readSize(page: P) {
    const value = page.size ?? page.pageSize;
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('分页大小异常，请重新加载');
    return parsed;
  }
  checkAbort();
  const firstPages = await boundedMap(sources, source => request(source, 1, size));
  const totals = firstPages.map(readTotal);
  const total = totals.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('分页总数异常，请重新加载');
  if (current > Math.max(1, Math.ceil(total / size))) return { pages: [] as P[], total };
  const groups = await boundedMap(sources, async (source, index) => {
    const first = firstPages[index];
    const sourceTotal = totals[index];
    const firstRecords = requireArray(first.records, '分页记录');
    // 无页大小元数据时，只在第一页推断；后续短页不能改变翻页步长。
    const actualSize = readSize(first) ?? (firstRecords.length || size);
    const targetCount = Math.min(sourceTotal, current * size);
    const pageCount = Math.max(1, Math.ceil(targetCount / actualSize));
    const seen = new Set<string>();
    const pages: P[] = [];
    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      checkAbort();
      const page = pageNo === 1 ? first : await request(source, pageNo, actualSize);
      checkAbort();
      if (readTotal(page) !== sourceTotal || (readSize(page) ?? actualSize) !== actualSize) {
        throw new Error('分页列表已变化，请重新加载');
      }
      const records = requireArray<P['records'][number]>(page.records, '分页记录');
      if (records.length !== Math.min(actualSize, sourceTotal - (pageNo - 1) * actualSize)) {
        throw new Error('分页不完整，请重新加载');
      }
      for (const record of records) {
        const id = recordId(record);
        if (id === undefined || id === null || String(id) === '') throw new Error('分页记录 ID 缺失');
        if (seen.has(String(id))) throw new Error('分页列表已变化，请重新加载');
        seen.add(String(id));
      }
      pages.push(page);
    }
    return pages;
  });
  return { pages: groups.flat(), total };
}
