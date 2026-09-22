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
    newUser?: boolean;
    loginPasswordSet?: boolean;
    payPasswordSet?: boolean;
  }

  interface OAuthConfigVO {
    googleEnabled: boolean;
    googleClientId?: string | null;
    googleOneTapEnabled?: boolean;
    telegramEnabled: boolean;
    telegramBotUsername?: string | null;
  }

  type OAuthProvider = 'GOOGLE' | 'TELEGRAM';

  interface OAuthLoginParams {
    provider: OAuthProvider;
    credential?: string;
    telegramPayload?: Record<string, string>;
  }

  interface UserProfileVO {
    userId: string;
    email: string | null;
    loginPasswordSet?: boolean;
    nickname: string;
    avatar?: string;
    phone?: string;
    points: string | number;
    roles?: UserRole[];
    kycStatus?: string;
  }

  interface ProfileUpdateParams {
    nickname?: string;
    avatar?: string;
    phone?: string;
  }

  interface SetLoginPasswordParams {
    password: string;
    confirmPassword: string;
    email?: string;
  }
}
