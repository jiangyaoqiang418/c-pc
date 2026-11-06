declare namespace Api.RealVip {
  interface Status {
    userId: string | number;
    audience: Api.Vip.Audience;
    level: Api.Vip.Level;
    vipLevel: Api.Vip.Level;
    points: string;
    nextThreshold?: string;
    pointsToNext?: string;
    benefits: Partial<Api.Vip.CustomerBenefits> | Partial<Api.Vip.BuyerBenefits>;
    config?: LevelConfig;
  }

  type LevelConfig = Omit<Api.Vip.LevelConfig, 'customerBenefits' | 'buyerBenefits' | 'threshold'> & {
    threshold: string;
    dimensions: { key: string; label: string; unit: string }[];
    customerBenefits?: Partial<Api.Vip.CustomerBenefits>;
    buyerBenefits?: Partial<Api.Vip.BuyerBenefits>;
  };

  interface VipDimMetaVO {
    code: string;
    name: string;
    unit?: string;
  }

  interface VipLevelRowVO {
    level: string;
    threshold: string | number;
    benefits?: Record<string, string | number>;
  }

  interface VipRoleGridVO {
    role: string;
    roleText?: string;
    dims?: VipDimMetaVO[];
    levels?: VipLevelRowVO[];
  }

  interface VipConfigVO {
    roles?: VipRoleGridVO[];
  }

  interface VipBenefitVO { code: string; name?: string; unit?: string; value?: string | number; }
  interface VipCatalogLevelVO { level: string; rank?: number; threshold: string | number; current?: boolean; benefits?: VipBenefitVO[]; }
  interface VipCatalogRoleVO { role: string; roleText?: string; currentLevel?: string; levels?: VipCatalogLevelVO[]; }
  interface VipLevelCatalogVO { points?: string | number; logged?: boolean; roles?: VipCatalogRoleVO[]; }
}
