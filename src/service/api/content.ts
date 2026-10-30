import { realNotifyRequest } from '@/service/request';
import { RequestError } from '@/service/request/type';
import { requireArray, resolvePageSize } from './page';

// 公开内容读取失败保留页面错误态，不因 notify 独立鉴权故障清空整站会话。
const readOptions = { showError: false, skipAuthRedirect: true };

function readContent(value: Api.RealContent.PublicContentVO, type: Api.RealContent.ContentType, detail = false) {
  if (!value || !['string', 'number'].includes(typeof value.id) || !String(value.id).trim()
    || (typeof value.id === 'number' && !Number.isSafeInteger(value.id))
    || value.contentType !== type || value.status !== 'PUBLISHED'
    || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.contentVersion !== 'string' || !value.contentVersion.trim()
    || (detail && (typeof value.body !== 'string' || !value.body.trim()))) {
    throw new Error('内容加载异常，请重试');
  }
  return value;
}

async function fetchContentPage(path: 'help' | 'announcements', type: Api.RealContent.ContentType, q: Api.RealContent.PageQuery): Promise<Api.RealContent.ContentPage> {
  const current = q.current || 1;
  const size = q.size || 10;
  const page = await realNotifyRequest.postQuery<{
    records: Api.RealContent.PublicContentVO[]; total: string | number; pageNo?: number; pageSize?: number;
  }>(`/content/${path}/page`, {
    pageNo: current, pageSize: size, keyword: q.keyword?.trim() || undefined,
    ...(path === 'help' ? { topic: q.topic || undefined } : {})
  }, { ...readOptions, signal: q.signal });
  const total = Number(page.total);
  if (page.total === undefined || page.total === null || String(page.total).trim() === '' || !Number.isSafeInteger(total) || total < 0) {
    throw new Error('内容分页总数异常，请重新读取');
  }
  return {
    records: requireArray<Api.RealContent.PublicContentVO>(page.records, '内容分页记录').map(item => readContent(item, type)),
    total, current, size: resolvePageSize(page, size)
  };
}

async function fetchContentDetail(path: 'help' | 'announcements', type: Api.RealContent.ContentType, id: Api.RealContent.Id, options: { signal?: AbortSignal }) {
  const content = readContent(await realNotifyRequest.get<Api.RealContent.PublicContentVO>(`/content/${path}/detail`, {
    ...readOptions, params: { id }, signal: options.signal
  }), type, true);
  if (String(content.id) !== String(id)) throw new Error('内容已变化，请重新读取');
  return content;
}

export function fetchHelpPage(q: Api.RealContent.PageQuery = {}) {
  return fetchContentPage('help', 'HELP', q);
}

export function fetchHelpDetail(id: Api.RealContent.Id, options: { signal?: AbortSignal } = {}) {
  return fetchContentDetail('help', 'HELP', id, options);
}

export function fetchAnnouncementsPage(q: Api.RealContent.PageQuery = {}) {
  return fetchContentPage('announcements', 'ANNOUNCEMENT', q);
}

export function fetchAnnouncementDetail(id: Api.RealContent.Id, options: { signal?: AbortSignal } = {}) {
  return fetchContentDetail('announcements', 'ANNOUNCEMENT', id, options);
}

export async function fetchAgreementCurrent(kind: Api.RealContent.AgreementKind, options: { signal?: AbortSignal } = {}) {
  const agreement = readContent(await realNotifyRequest.get<Api.RealContent.PublicContentVO>('/content/agreements/current', {
    ...readOptions, params: { kind }, signal: options.signal
  }), 'AGREEMENT', true);
  if (agreement.code !== kind) throw new Error('协议种类不一致，请重新读取');
  return agreement;
}

export function contentReadMessage(error: unknown, fallback = '内容读取失败，请稍后重试') {
  if (error instanceof RequestError) {
    if (error.code === '-322') return '该内容暂未发布';
    if (error.code === '-323') return '该内容尚未生效';
    if (error.code === '-324') return '该内容已下线';
    if (error.code === '-202' || error.code === '-200') return '当前账号无权查看此内容，请登录后重试';
  }
  return fallback;
}
