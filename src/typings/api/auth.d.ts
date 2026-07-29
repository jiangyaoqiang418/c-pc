declare namespace Api.RealAuth {
  type UserRole = 'CUSTOMER' | 'BUYER' | string;

  interface LoginParams {
    email: string;
    password: string;
  }

  interface RegisterParams {
    email: string;
    password: string;
    nickname: string;
    phone?: string;
    roles?: UserRole[];
    emailCode?: string;
  }

  interface LoginVO {
    userId: string;
    token: string;
    nickname: string;
    avatar?: string;
  }

  interface UserProfileVO {
    userId: string;
    email: string;
    nickname: string;
    avatar?: string;
    phone?: string;
    points: string | number;
    roles?: UserRole[];
    kycStatus?: string;
  }
}
