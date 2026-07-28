/**
 * 承运商主数据池（R-DATA-31 / R-MOD-20）— logistics 模块自有的两个真实源之一。
 *
 * 5 条 carrier 对应 Api.Order.ShippingCarrier 5 类硬枚举（SF_INTL / FEDEX / DHL / 4PX / EMS）。
 * 含 API 配置 + 健康度心跳 + 启用 / 默认承运商。
 */
type CarrierRecord = Api.Logistics.CarrierRecord;
type ShippingCarrier = Api.Order.ShippingCarrier;

function iso(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

export const CARRIERS: CarrierRecord[] = [
  {
    code: 'SF_INTL',
    name: '顺丰国际',
    category: 'international',
    enabled: true,
    isDefault: true,
    apiEndpoint: 'https://api.sf-express.com/intl/v2',
    accountName: 'SF-PROD-001',
    appKey: 'sk-sf-prod-9f8e7d6c5b4a',
    appSecret: 'ss-sf-prod-1234567890ab',
    contactPhone: '+86-400-111-1111',
    contactEmail: 'intl-support@sf-express.com',
    health: {
      status: 'healthy',
      successRate24h: '98.50',
      avgResponseMs: 420,
      lastCallAt: iso(0, 8, 30),
      totalCalls24h: 312,
      failedCalls24h: 4
    },
    createdAt: iso(140, 10, 0),
    updatedAt: iso(0, 8, 30)
  },
  {
    code: 'FEDEX',
    name: 'FedEx 联邦快递',
    category: 'international',
    enabled: true,
    isDefault: false,
    apiEndpoint: 'https://apis.fedex.com/track/v1',
    accountName: 'FEDEX-PROD-A02',
    appKey: 'sk-fedex-prod-4c8b7a5d6e9f',
    appSecret: 'ss-fedex-prod-9876543210cd',
    contactPhone: '+1-800-463-3339',
    contactEmail: 'api-team@fedex.com',
    health: {
      status: 'healthy',
      successRate24h: '96.20',
      avgResponseMs: 580,
      lastCallAt: iso(0, 8, 15),
      totalCalls24h: 186,
      failedCalls24h: 7
    },
    createdAt: iso(120, 14, 0),
    updatedAt: iso(2, 11, 0)
  },
  {
    code: 'DHL',
    name: 'DHL Express',
    category: 'international',
    enabled: true,
    isDefault: false,
    apiEndpoint: 'https://api-eu.dhl.com/track/shipments',
    accountName: 'DHL-PROD-EU-03',
    appKey: 'sk-dhl-prod-2e3f4a5b6c7d',
    appSecret: 'ss-dhl-prod-abcdef123456',
    contactPhone: '+49-228-902-8888',
    contactEmail: 'dev-support@dhl.com',
    health: {
      status: 'degraded',
      successRate24h: '88.00',
      avgResponseMs: 1820,
      lastCallAt: iso(0, 7, 45),
      totalCalls24h: 95,
      failedCalls24h: 11
    },
    createdAt: iso(98, 9, 30),
    updatedAt: iso(0, 7, 45)
  },
  {
    code: '4PX',
    name: '4PX 递四方',
    category: 'consolidator',
    enabled: true,
    isDefault: false,
    apiEndpoint: 'https://open.4px.com/openapi/v1',
    accountName: '4PX-PROD-CN-01',
    appKey: 'sk-4px-prod-7a8b9c0d1e2f',
    appSecret: 'ss-4px-prod-fedcba654321',
    contactPhone: '+86-755-2826-0666',
    contactEmail: 'api@4px.com',
    health: {
      status: 'healthy',
      successRate24h: '97.80',
      avgResponseMs: 520,
      lastCallAt: iso(0, 8, 5),
      totalCalls24h: 224,
      failedCalls24h: 5
    },
    createdAt: iso(150, 11, 0),
    updatedAt: iso(5, 14, 0)
  },
  {
    code: 'EMS',
    name: 'EMS 国际邮政',
    category: 'international',
    enabled: false,
    isDefault: false,
    apiEndpoint: 'https://api.ems.com.cn/track/v1',
    accountName: 'EMS-PROD-CN-01',
    appKey: 'sk-ems-prod-deprecated',
    appSecret: 'ss-ems-prod-deprecated',
    contactPhone: '+86-11183',
    contactEmail: 'cs@ems.com.cn',
    health: {
      status: 'down',
      successRate24h: '0.00',
      avgResponseMs: 0,
      lastCallAt: iso(7, 18, 0),
      totalCalls24h: 0,
      failedCalls24h: 0
    },
    createdAt: iso(180, 9, 0),
    updatedAt: iso(7, 18, 0)
  }
];

export function findCarrierByCode(code: ShippingCarrier): CarrierRecord | undefined {
  return CARRIERS.find(c => c.code === code);
}

export function upsertCarrier(patch: Api.Logistics.CarrierSaveParams): CarrierRecord | undefined {
  const carrier = findCarrierByCode(patch.code);
  if (!carrier) return undefined;
  if (patch.name) carrier.name = patch.name;
  carrier.apiEndpoint = patch.apiEndpoint;
  carrier.accountName = patch.accountName;
  if (patch.appKey) carrier.appKey = patch.appKey;
  if (patch.appSecret) carrier.appSecret = patch.appSecret;
  carrier.contactPhone = patch.contactPhone;
  carrier.contactEmail = patch.contactEmail;
  carrier.updatedAt = new Date().toISOString();
  return carrier;
}

export function setDefaultCarrier(code: ShippingCarrier): CarrierRecord | undefined {
  const target = findCarrierByCode(code);
  if (!target || !target.enabled) return undefined;
  CARRIERS.forEach(c => {
    c.isDefault = c.code === code;
  });
  target.updatedAt = new Date().toISOString();
  return target;
}

export function toggleCarrierEnabled(code: ShippingCarrier, enabled: boolean): CarrierRecord | undefined {
  const carrier = findCarrierByCode(code);
  if (!carrier) return undefined;
  carrier.enabled = enabled;
  if (!enabled) {
    carrier.isDefault = false;
    carrier.health.status = 'down';
  } else if (carrier.health.status === 'down') {
    carrier.health.status = 'healthy';
  }
  carrier.updatedAt = new Date().toISOString();
  return carrier;
}

/** 掩码处理（列表展示用） */
export function maskCarrier(c: CarrierRecord): CarrierRecord {
  return {
    ...c,
    appKey: maskSecret(c.appKey),
    appSecret: maskSecret(c.appSecret)
  };
}

function maskSecret(s: string): string {
  if (!s || s.length < 8) return '****';
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

/** 健康度小计（用于 stats strip） */
export function countCarriersOnline(): number {
  return CARRIERS.filter(c => c.enabled && c.health.status !== 'down').length;
}
