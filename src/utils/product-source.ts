export const productSourceOptions = ['京东国际', '淘宝', '京东', '拼多多', '天猫国际'];

/** 来源为商品文本；不截断、不创建字典项，清空显式回传 null。 */
export function normalizeProductSource(value?: string | null): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('商品来源格式不正确');
  const source = value.trim();
  if ([...source].length > 32) throw new Error('商品来源最多32个字符');
  return source || null;
}
