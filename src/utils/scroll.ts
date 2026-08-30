/** 等异步列表撑开页面再恢复后退位置；用户主动操作或再次导航后不再抢滚动。 */
export function waitForScrollPosition(position: { left: number; top: number }, signal: AbortSignal) {
  return new Promise<false | { left: number; top: number }>(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const fits = () => (document.scrollingElement?.scrollHeight || 0) + 1 >= position.top + window.innerHeight;
    if (fits()) { resolve(position); return; }
    let settled = false;
    const finish = (value: false | { left: number; top: number }) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      mutations.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', cancel);
      resolve(value);
    };
    const cancel = () => finish(false);
    const check = () => {
      // html/body/#app 固定 height:100%，列表变长不会触发它们的 ResizeObserver。
      // 观察自然高度的主内容，并在异步布局替换后重新绑定。
      const content = document.querySelector('main');
      if (content) observer.observe(content);
      if (fits()) finish(position);
    };
    const observer = new ResizeObserver(check);
    const mutations = new MutationObserver(check);
    const timer = setTimeout(() => finish(false), 10_000);
    signal.addEventListener('abort', cancel, { once: true });
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('pointerdown', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
    const content = document.querySelector('main');
    if (content) observer.observe(content);
    if (document.body) mutations.observe(document.body, { childList: true, subtree: true });
  });
}
