declare namespace Api.RealSession {
  type Id = string | number;

  /** 真实登录态与演示用户模型隔离，业务 ID 保持服务端原值。 */
  type UserRecord = Omit<Api.User.UserRecord, 'id' | 'points' | 'vipLevel'> & {
    id: Id;
    points?: number;
    vipLevel?: Api.User.VipLevel;
    accountInfoUnavailable?: boolean;
  };
}
