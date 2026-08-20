/** 仅允许最新一次读取请求写回页面，避免慢响应覆盖用户刚切换的筛选结果。 */
export function createLatestRequestGuard() {
  let version = 0;
  let controller: AbortController | undefined;

  function begin() {
    controller?.abort();
    controller = new AbortController();
    const current = ++version;
    const isCurrent = (() => current === version) as (() => boolean) & { signal: AbortSignal };
    isCurrent.signal = controller.signal;
    return isCurrent;
  }

  function invalidate() {
    version += 1;
    controller?.abort();
    controller = undefined;
  }

  return { begin, invalidate };
}
