/**
 * 系统配置类型（R-DATA-39）。
 */
declare namespace Api.SysConfig {
  type ConfigCategory = 'business' | 'fee' | 'sla' | 'email' | 'security';
  type ValueType = 'string' | 'number' | 'boolean' | 'json';

  interface ConfigItem {
    key: string;
    category: ConfigCategory;
    name: string;
    description: string;
    valueType: ValueType;
    value: string;
    defaultValue: string;
    minValue?: string;
    maxValue?: string;
    enumOptions?: string[];
    isSensitive: boolean;
    lastModifiedBy?: string;
    lastModifiedAt: string;
  }

  interface ConfigHistory {
    id: number;
    key: string;
    oldValue: string;
    newValue: string;
    modifiedBy: string;
    modifiedAt: string;
  }

  interface EmailTemplate {
    code: string;
    name: string;
    subject: string;
    body: string;
    variables: string[];
    enabled: boolean;
    lastModifiedAt: string;
  }

  interface Stats {
    totalConfigs: number;
    byCategory: Record<ConfigCategory, number>;
    sensitiveCount: number;
    emailTemplateCount: number;
    recentHistoryCount: number;
  }

  interface ListQuery {
    category?: ConfigCategory;
    keyword?: string;
  }
  interface SaveParams {
    key: string;
    value: string;
  }
  interface ResetParams {
    key: string;
  }
  interface EmailTemplateSaveParams {
    code: string;
    subject: string;
    body: string;
    enabled: boolean;
  }
}
