import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';
import { priceSet, RATE_SOURCE_TEXT } from './currency';

describe('金额展示', () => {
  it('参考折算不冒充实时汇率，不改变 USDT 结算金额', () => {
    const value = priceSet('10');
    expect(value.usdtRaw).toBe('10');
    expect(value.rateLabel).toContain('非实时');
    expect(value.rateLabel).toContain('以 USDT 结算');
    expect(RATE_SOURCE_TEXT).not.toContain('每 5 分钟');
  });
  it('统一保留两位小数并添加千分位', () => {
    expect(formatAmount('1234567.8')).toBe('1,234,567.80');
    expect(formatAmount(-20)).toBe('-20.00');
  });

  it('对空值和非法金额使用占位符', () => {
    expect(formatAmount(undefined)).toBe('—');
    expect(formatAmount('not-a-number')).toBe('—');
  });
});
