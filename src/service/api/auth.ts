import { clearAccessToken, realUserRequest } from '@/service/request';
import type { RequestOptions } from '@/service/request';
import { toOptionalFiniteNumber } from './number';

function normalizeKycStatus(status?: string): Api.User.KycStatus {
  const value = status?.toLowerCase();
  if (value === 'approved' || value === 'passed') return 'approved';
  if (value === 'pending') return 'pending';
  if (value === 'rejected') return 'rejected';
  if (value === 'expired') return 'expired';
  return 'none';
}

function normalizeVipLevel(level?: string): Api.User.VipLevel | undefined {
  if (level === 'VIP0' || level === 'VIP1' || level === 'VIP2') return level;
  return undefined;
}

function hasBuyerRole(roles?: string[]) {
  return !!roles?.some(role => role.toUpperCase() === 'BUYER');
}

function toUserRecord(
  profile: Api.RealAuth.UserProfileVO,
  fallback?: Partial<Api.RealAuth.LoginVO>,
  pointAccount?: Api.RealPoint.UserPointVO
): Api.RealSession.UserRecord {
  const roles = profile.roles || [];
  const id = profile.userId || fallback?.userId || '';
  const points = toOptionalFiniteNumber(pointAccount?.points ?? profile.points);
  const isBuyer = hasBuyerRole(roles);
  const roleInfo = isBuyer ? pointAccount?.buyer : pointAccount?.customer;

  return {
    id,
    email: profile.email || '',
    nickname: profile.nickname || fallback?.nickname || '',
    avatar: profile.avatar || fallback?.avatar,
    phone: profile.phone,
    isBuyer,
    kycStatus: normalizeKycStatus(profile.kycStatus),
    status: '1',
    points,
    vipLevel: normalizeVipLevel(roleInfo?.level),
    accountInfoUnavailable: !pointAccount || points === undefined || normalizeVipLevel(roleInfo?.level) === undefined,
    tagIds: [],
    registeredAt: ''
  };
}

export async function login(params: Api.RealAuth.LoginParams) {
  const loginResult = await realUserRequest.post<Api.RealAuth.LoginVO>('/auth/login', params, { skipAuthRedirect: true, showError: false });
  if (!loginResult.token) throw new Error('登录未返回有效凭证');
  const profile = await fetchCurrentUser(loginResult, {
    skipAuthRedirect: true,
    showError: false,
    deferAccount: true,
    headers: { 'X-Access-Token': loginResult.token }
  });
  return { token: loginResult.token, user: profile };
}

export async function register(params: Api.RealAuth.RegisterParams) {
  return realUserRequest.post<string>('/auth/register', params, { skipAuthRedirect: true });
}

export function prepareRegistration(form: { email: string; nickname: string; password: string; confirm: string }) {
  const params = { email: form.email.trim(), nickname: form.nickname.trim(), password: form.password, roles: ['CUSTOMER'] };
  let error = '';
  if (!params.email || !params.nickname || !params.password) error = '请完善信息，邮箱和昵称不能只填写空格';
  else if (!/^[^\s@]+@[^\s@]+$/.test(params.email)) error = '请输入正确的邮箱地址';
  else if (params.password.length < 6 || params.password.length > 64) error = '密码长度应为 6–64 位';
  else if (params.password !== form.confirm) error = '两次密码不一致';
  return { params, error };
}

export async function fetchCurrentUser(
  fallback?: Partial<Api.RealAuth.LoginVO>,
  options: Pick<RequestOptions, 'signal' | 'skipAuthRedirect' | 'headers' | 'showError'> & { deferAccount?: boolean } = {}
) {
  const { deferAccount, ...requestOptions } = options;
  const profile = await realUserRequest.get<Api.RealAuth.UserProfileVO>('/auth/me', requestOptions);
  if (deferAccount) return toUserRecord(profile, fallback);
  let pointAccount: Api.RealPoint.UserPointVO | undefined;
  try {
    pointAccount = await realUserRequest.get<Api.RealPoint.UserPointVO>('/points/account', {
      ...requestOptions,
      showError: false
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    pointAccount = undefined;
  }
  return toUserRecord(profile, fallback, pointAccount);
}

/** 登录身份先完成，积分/等级单独补充，不影响登录态。 */
export async function fetchUserAccountInfo(user: Api.RealSession.UserRecord) {
  const account = await realUserRequest.get<Api.RealPoint.UserPointVO>('/points/account', { showError: false, skipAuthRedirect: true });
  const points = toOptionalFiniteNumber(account?.points ?? user.points);
  const vipLevel = normalizeVipLevel((user.isBuyer ? account?.buyer : account?.customer)?.level);
  return { points, vipLevel, accountInfoUnavailable: points === undefined || vipLevel === undefined };
}

export async function updateProfile(params: Api.RealAuth.ProfileUpdateParams) {
  await realUserRequest.put<void, Api.RealAuth.ProfileUpdateParams>('/auth/profile', params);
}

export function logoutLocal() {
  clearAccessToken();
}
