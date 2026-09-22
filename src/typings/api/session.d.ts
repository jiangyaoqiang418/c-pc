declare namespace Api.RealSession {
  type Id = string | number;

  /** 真实登录态与演示用户模型隔离，业务 ID 保持服务端原值。 */
  type UserRecord = Omit<Api.User.UserRecord, 'id' | 'email' | 'points' | 'vipLevel'> & {
    id: Id;
    email: string | null;
    /** undefined 表示后端尚未返回或本次读取未确认，不得当作 false。 */
    loginPasswordSet?: boolean;
    points?: number;
    vipLevel?: Api.User.VipLevel;
    accountInfoUnavailable?: boolean;
  };
}
