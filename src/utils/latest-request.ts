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

/** 合并密集刷新；在途新事件保留一次续读，取消后旧任务不得阻塞或唤醒新上下文。 */
export function createCoalescedRefresh(task: () => Promise<unknown>, onError: (error: unknown) => void, delayMs = 100) {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let runningGeneration: number | undefined;
  let requested = false;

  function schedule() {
    requested = true;
    if (timer || runningGeneration === generation) return;
    const current = generation;
    timer = setTimeout(async () => {
      timer = undefined;
      if (current !== generation) return;
      requested = false;
      runningGeneration = current;
      try {
        await task();
      } catch (error) {
        if (current === generation) onError(error);
      } finally {
        if (current === generation) {
          runningGeneration = undefined;
          if (requested) schedule();
        }
      }
    }, delayMs);
  }

  function cancel() {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = undefined;
    runningGeneration = undefined;
    requested = false;
  }

  return { schedule, cancel };
}
