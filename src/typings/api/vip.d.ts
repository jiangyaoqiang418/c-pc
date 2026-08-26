declare namespace Api.RealVip {
  interface Status {
    userId: string | number;
    audience: Api.Vip.Audience;
    level: Api.Vip.Level;
    vipLevel: Api.Vip.Level;
    points: number;
    nextThreshold?: number;
    pointsToNext: number;
    benefits: Api.Vip.CustomerBenefits | Api.Vip.BuyerBenefits;
    config?: Api.Vip.LevelConfig;
  }

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
