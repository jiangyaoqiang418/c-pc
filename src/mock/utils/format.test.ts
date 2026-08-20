import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';

describe('金额展示', () => {
  it('统一保留两位小数并添加千分位', () => {
    expect(formatAmount('1234567.8')).toBe('1,234,567.80');
    expect(formatAmount(-20)).toBe('-20.00');
  });

  it('对空值和非法金额使用占位符', () => {
    expect(formatAmount(undefined)).toBe('—');
    expect(formatAmount('not-a-number')).toBe('—');
  });
});
