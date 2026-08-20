import { describe, expect, it } from 'vitest';
import { parseJsonPreservingLong } from './json';

describe('Long 安全 JSON 解析', () => {
  it('保留响应中的超长业务 ID 原值', () => {
    const result = parseJsonPreservingLong<{ id: string; nested: { orderId: string }; total: number }>(
      '{"id":2089334325133266944,"nested":{"orderId":2089329381734961152},"total":2}'
    );

    expect(result.id).toBe('2089334325133266944');
    expect(result.nested.orderId).toBe('2089329381734961152');
    expect(result.total).toBe(2);
  });

  it('不改写字符串中的长数字和普通数字', () => {
    const result = parseJsonPreservingLong<{ content: string; count: number }>('{"content":"订单 2089334325133266944","count":12}');

    expect(result).toEqual({ content: '订单 2089334325133266944', count: 12 });
  });
});
