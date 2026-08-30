export const ACCESS_TOKEN_KEY = 'bw-shop-access-token';
let acceptedToken: string | undefined;

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function setAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  acceptedToken = token;
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  acceptedToken = '';
}

/** 当前标签页已接受的身份，不随其他标签页的存储写入静默改变。 */
export function getAcceptedAccessToken() {
  if (acceptedToken === undefined) acceptedToken = getAccessToken();
  return acceptedToken;
}

/** 仅在清理旧身份后接纳外部会话，供后续资料读取使用。 */
export function acceptStoredAccessToken() {
  acceptedToken = getAccessToken();
}
