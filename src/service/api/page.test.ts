import { describe, expect, it } from 'vitest';
import { toPageTotal } from './page';

describe('分页总数适配', () => {
  it('将后端字符串总数转换为分页控件可用数值', () => {
    expect(toPageTotal('27')).toBe(27);
    expect(toPageTotal(3)).toBe(3);
  });

  it('将无效总数降级为零', () => {
    expect(toPageTotal()).toBe(0);
    expect(toPageTotal('invalid')).toBe(0);
    expect(toPageTotal(-1)).toBe(0);
  });
});
