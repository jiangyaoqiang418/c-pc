import { realOrderRequest } from '@/service/request';
import { requireArray, resolvePageSize } from './page';

function readBrand(value: Api.RealBrand.BrandDTO) {
  if (!value || !['string', 'number'].includes(typeof value.id) || !String(value.id).trim()
    || (typeof value.id === 'number' && !Number.isSafeInteger(value.id))
    || typeof value.name !== 'string' || !value.name.trim() || typeof value.enabled !== 'boolean') {
    throw new Error('品牌资料格式异常，请重新读取');
  }
  return value;
}

export async function fetchBrandsPage(q: { current?: number; size?: number; keyword?: string; signal?: AbortSignal } = {}): Promise<Api.RealBrand.BrandPage> {
  const current = q.current || 1;
  const size = q.size || 20;
  const page = await realOrderRequest.postQuery<{
    records: Api.RealBrand.BrandDTO[]; total: string | number; pageNo?: number; pageSize?: number;
  }, Api.RealBrand.BrandPageQuery>('/storefront/brands/page', {
    pageNo: current, pageSize: size, keyword: q.keyword?.trim() || undefined
  }, { signal: q.signal, showError: false });
  const records = requireArray<Api.RealBrand.BrandDTO>(page.records, '品牌分页记录').map(readBrand);
  if (records.some(item => !item.enabled)) throw new Error('品牌目录包含未启用资料，请重新读取');
  const total = Number(page.total);
  if (page.total === undefined || page.total === null || String(page.total).trim() === '' || !Number.isSafeInteger(total) || total < 0) {
    throw new Error('品牌分页总数异常，请重新读取');
  }
  return { records, total, current, size: resolvePageSize(page, size) };
}

export async function fetchBrandDetail(id: Api.RealBrand.Id, options: { signal?: AbortSignal } = {}) {
  const brand = readBrand(await realOrderRequest.get<Api.RealBrand.BrandDTO>('/storefront/brands/detail', {
    params: { id }, signal: options.signal, showError: false
  }));
  if (String(brand.id) !== String(id) || !brand.enabled) throw new Error('该品牌已停用或无法访问');
  return brand;
}
