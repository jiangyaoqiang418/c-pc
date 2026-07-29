declare namespace Api.RealVip {
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
}
