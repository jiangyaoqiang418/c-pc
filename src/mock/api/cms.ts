/**
 * CMS mock API：公告 / 帮助文章 / 协议。
 */
import { ANNOUNCEMENTS, findAnnouncementById } from '../mock/data/cms-announcements';
import { HELP_ARTICLES, findHelpArticleById } from '../mock/data/cms-help-articles';
import { AGREEMENTS, findAgreementById, findCurrentAgreement } from '../mock/data/cms-agreements';
import { delay, delayPaginated } from '../utils/mock-delay';

export interface AnnouncementQuery {
  current?: number;
  size?: number;
  type?: Api.Cms.AnnouncementType;
  audience?: Api.Cms.Audience;
}

export async function fetchAnnouncements(q: AnnouncementQuery = {}) {
  let list = ANNOUNCEMENTS.filter(a => a.status === 'published');
  if (q.type) list = list.filter(a => a.type === q.type);
  if (q.audience) list = list.filter(a => a.audience === 'all' || a.audience === q.audience);
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchAnnouncementDetail(id: number) {
  const a = findAnnouncementById(id);
  if (a) a.viewsCount += 1;
  return delay(a);
}

export interface HelpQuery {
  current?: number;
  size?: number;
  category?: Api.Cms.HelpCategory;
  keyword?: string;
}

export async function fetchHelpArticles(q: HelpQuery = {}) {
  let list = HELP_ARTICLES.filter(a => a.enabled);
  if (q.category) list = list.filter(a => a.category === q.category);
  if (q.keyword) {
    const kw = q.keyword.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(kw) || a.body.toLowerCase().includes(kw));
  }
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchHelpArticleDetail(id: number) {
  const a = findHelpArticleById(id);
  if (a) a.viewsCount += 1;
  return delay(a);
}

export async function fetchAgreementCurrent(kind: Api.Cms.AgreementKind) {
  return delay(findCurrentAgreement(kind));
}

export async function fetchAgreementById(id: number) {
  return delay(findAgreementById(id));
}

export async function fetchAllCurrentAgreements() {
  const kinds: Api.Cms.AgreementKind[] = ['user', 'privacy', 'service', 'kyc', 'aml'];
  return delay(
    kinds.map(k => findCurrentAgreement(k)).filter(Boolean) as Api.Cms.Agreement[]
  );
}

void AGREEMENTS;
