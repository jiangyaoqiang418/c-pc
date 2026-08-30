import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCoalescedRefresh, createLatestRequestGuard } from './latest-request';
import { waitForScrollPosition } from './scroll';
import { reactive } from 'vue';
import { createUnsavedFormState } from '@/composables/use-unsaved-form';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('实时刷新合并与取消', () => {
  it('密集事件合成一次读取，在途新事件只保留一次续读', async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const task = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const queue = createCoalescedRefresh(task, vi.fn());
    for (let i = 0; i < 50; i++) queue.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('取消排队读取，并阻止旧任务完成或失败后唤醒新上下文', async () => {
    vi.useFakeTimers();
    const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const task = vi.fn(() => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })));
    const onError = vi.fn();
    const queue = createCoalescedRefresh(task, onError);
    queue.schedule();
    queue.cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).not.toHaveBeenCalled();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(100);
    queue.schedule();
    queue.cancel();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    pending[0].reject(new Error('旧账号失败'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).not.toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(2);
    pending[1].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('当前读取失败有反馈，无新事件不自动循环重试，后续事件仍可恢复', async () => {
    vi.useFakeTimers();
    const error = new Error('读取失败');
    const task = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const onError = vi.fn();
    const queue = createCoalescedRefresh(task, onError);
    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    queue.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('未提交表单状态', () => {
  it('先聚焦再自动回填不误报，也不抹掉其他字段的真实编辑', () => {
    const form = reactive({ title: '', addressId: undefined as string | undefined });
    const state = createUnsavedFormState(() => form);
    state.markInteracted();
    form.addressId = 'qa-default';
    state.acceptAutomaticField('addressId', form.addressId);
    expect(state.dirty.value).toBe(false);
    form.title = 'QA 编辑';
    form.addressId = 'qa-refilled';
    state.acceptAutomaticField('addressId', form.addressId);
    expect(state.dirty.value).toBe(true);
    form.title = '';
    expect(state.dirty.value).toBe(false);
    form.addressId = 'qa-user-selected';
    expect(state.dirty.value).toBe(true);
  });
  it('自动回填和仅聚焦不提示，真实编辑及上传变化才标记未保存', () => {
    const form = reactive({ title: '', address: '', images: [] as string[] });
    const state = createUnsavedFormState(() => form);
    form.address = 'qa-default-address';
    expect(state.dirty.value).toBe(false);
    state.markInteracted();
    expect(state.dirty.value).toBe(false);
    form.title = 'QA 未提交';
    expect(state.dirty.value).toBe(true);
    form.title = '';
    expect(state.dirty.value).toBe(false);
    form.images.push('qa-file-id');
    expect(state.dirty.value).toBe(true);
    state.markSaved();
    expect(state.dirty.value).toBe(false);
  });

  it('成功提交或切换上下文后清除旧编辑状态，下一次编辑独立追踪', () => {
    const form = reactive({ reason: '' });
    const state = createUnsavedFormState(() => form);
    state.markInteracted();
    form.reason = 'QA 原账号';
    expect(state.dirty.value).toBe(true);
    state.markSaved();
    form.reason = '';
    expect(state.dirty.value).toBe(false);
    state.markInteracted();
    form.reason = 'QA 新账号';
    expect(state.dirty.value).toBe(true);
  });
});

describe('异步页面后退位置', () => {
  function setup() {
    vi.useFakeTimers();
    const page = { scrollHeight: 800 };
    const target = new EventTarget();
    Object.assign(target, { innerHeight: 600 });
    let resize!: () => void;
    let mutate!: () => void;
    let main = {};
    const disconnect = vi.fn();
    const mutationDisconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('document', { scrollingElement: page, documentElement: {}, body: {}, querySelector: () => main });
    vi.stubGlobal('window', target);
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe = observe; disconnect = disconnect; });
    vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { mutate = callback; } observe() {} disconnect = mutationDisconnect; });
    return { page, target, resize: () => resize(), mutate: () => mutate(), disconnect, mutationDisconnect, observe,
      replaceMain: () => (main = {}) };
  }

  it('列表未撑开时不提前恢复，足够高度后返回原位置', async () => {
    const state = setup();
    const position = { top: 900, left: 0 };
    let complete = false;
    const pending = waitForScrollPosition(position, new AbortController().signal).then(result => { complete = true; return result; });
    state.resize();
    await Promise.resolve();
    expect(complete).toBe(false);
    state.page.scrollHeight = 1600;
    state.resize();
    expect(await pending).toEqual(position);
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('再次导航或用户滚动后迟到内容不得抢回旧位置', async () => {
    for (const reason of ['abort', 'wheel', 'pointerdown', 'keydown', 'touchstart']) {
      const state = setup();
      const controller = new AbortController();
      const pending = waitForScrollPosition({ top: 900, left: 0 }, controller.signal);
      if (reason === 'abort') controller.abort();
      else state.target.dispatchEvent(new Event(reason));
      expect(await pending).toBe(false);
      state.page.scrollHeight = 2000;
      state.resize();
      expect(state.disconnect).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('已有足够高度立即恢复，目标始终不存在时有界结束并清理', async () => {
    const state = setup();
    expect(await waitForScrollPosition({ top: 100, left: 0 }, new AbortController().signal)).toEqual({ top: 100, left: 0 });
    const pending = waitForScrollPosition({ top: 2000, left: 0 }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBe(false);
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('固定高度根节点不发生 resize 时，异步主内容插入仍能恢复后退位置', async () => {
    const state = setup();
    const pending = waitForScrollPosition({ top: 900.5, left: 0 }, new AbortController().signal);
    const main = state.replaceMain();
    state.page.scrollHeight = 1500;
    state.mutate();
    expect(await pending).toEqual({ top: 900.5, left: 0 });
    expect(state.observe).toHaveBeenCalledWith(main);
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(state.mutationDisconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

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
