/** 仅允许最新一次读取请求写回页面，避免慢响应覆盖用户刚切换的筛选结果。 */
export function createLatestRequestGuard() {
  let version = 0;

  function begin() {
    const current = ++version;
    return () => current === version;
  }

  function invalidate() {
    version += 1;
  }

  return { begin, invalidate };
}
