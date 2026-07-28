/**
 * 鉴权 + 演示用户切换 mock API。
 *
 * 纯前端原型 — 没有真实 token，currentUser 由前端 store 管理。
 */
import { findUserById, USERS } from '../mock/data/users';
import { FEATURE_FLAGS, MOCK_USERS } from '../constants';
import { delay } from '../utils/mock-delay';

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  user: Api.User.UserRecord;
  token: string;
}

export async function mockLogin(p: LoginParams): Promise<LoginResult | { error: string }> {
  const user = USERS.find(u => u.email === p.email);
  if (!user) return delay({ error: '邮箱不存在' }, 300);
  if (user.status === '2') return delay({ error: '账户已冻结' }, 300);
  return delay({ user, token: `mock-token-${user.id}-${Date.now()}` }, 400);
}

export async function mockRegister(email: string, nickname: string): Promise<LoginResult | { error: string }> {
  if (USERS.some(u => u.email === email)) return delay({ error: '邮箱已注册' }, 300);
  return delay({ error: '原型环境不支持注册新用户，请从演示用户中选择' }, 300);
}

export async function fetchMockUserList() {
  return delay(MOCK_USERS, 100);
}

export async function switchCurrentUser(userId: number): Promise<Api.User.UserRecord | { error: string }> {
  const user = findUserById(userId);
  if (!user) return delay({ error: '用户不存在' }, 100);
  return delay(user, 150);
}

export async function isBuyerRegistrationOpen(): Promise<boolean> {
  return delay(FEATURE_FLAGS.buyerRegistrationOpen, 100);
}

export async function applyToBecomeBuyer(): Promise<{ ok: boolean; message: string }> {
  return delay({ ok: true, message: '申请已提交，请前往 KYC 中心完成实名认证' }, 500);
}
