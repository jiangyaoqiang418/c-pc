import { describe, expect, it } from 'vitest';
import { createLatestRequestGuard } from './latest-request';

describe('最新请求保护', () => {
  it('只允许最后一次请求写回结果', () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('失效后不再接受正在进行的请求', () => {
    const guard = createLatestRequestGuard();
    const pending = guard.begin();

    guard.invalidate();

    expect(pending()).toBe(false);
  });

  it('开始新请求或失效时取消上一读取请求', () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    guard.invalidate();

    expect(second.signal.aborted).toBe(true);
  });
});
