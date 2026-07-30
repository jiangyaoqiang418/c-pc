import { clearAccessToken, realUserRequest, setAccessToken } from '@/service/request';

function normalizeKycStatus(status?: string): Api.User.KycStatus {
  const value = status?.toLowerCase();
  if (value === 'approved' || value === 'passed') return 'approved';
  if (value === 'pending') return 'pending';
  if (value === 'rejected') return 'rejected';
  if (value === 'expired') return 'expired';
  return 'none';
}

function normalizeVipLevel(level?: string): Api.User.VipLevel {
  if (level === 'VIP1' || level === 'VIP2') return level;
  return 'VIP0';
}

function hasBuyerRole(roles?: string[]) {
  return !!roles?.some(role => role.toUpperCase() === 'BUYER');
}

function toUserRecord(
  profile: Api.RealAuth.UserProfileVO,
  fallback?: Partial<Api.RealAuth.LoginVO>,
  pointAccount?: Api.RealPoint.UserPointVO
): Api.User.UserRecord {
  const roles = profile.roles || [];
  const id = (profile.userId || fallback?.userId || '') as unknown as number;
  const points = Number(pointAccount?.points ?? profile.points ?? 0);
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
    tagIds: [],
    registeredAt: ''
  };
}

export async function login(params: Api.RealAuth.LoginParams) {
  const loginResult = await realUserRequest.post<Api.RealAuth.LoginVO>('/auth/login', params);
  setAccessToken(loginResult.token);
  const profile = await fetchCurrentUser(loginResult);
  return { token: loginResult.token, user: profile };
}

export async function register(params: Api.RealAuth.RegisterParams) {
  return realUserRequest.post<string>('/auth/register', params);
}

export async function fetchCurrentUser(fallback?: Partial<Api.RealAuth.LoginVO>) {
  const profile = await realUserRequest.get<Api.RealAuth.UserProfileVO>('/auth/me');
  let pointAccount: Api.RealPoint.UserPointVO | undefined;
  try {
    pointAccount = await realUserRequest.get<Api.RealPoint.UserPointVO>('/points/account', { showError: false });
  } catch {
    pointAccount = undefined;
  }
  return toUserRecord(profile, fallback, pointAccount);
}

export async function updateProfile(params: Api.RealAuth.ProfileUpdateParams) {
  await realUserRequest.put<void, Api.RealAuth.ProfileUpdateParams>('/auth/profile', params);
  return fetchCurrentUser();
}

export function logoutLocal() {
  clearAccessToken();
}
