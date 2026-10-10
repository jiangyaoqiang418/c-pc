import { markRaw, shallowReactive, type VNode } from 'vue';

export type FeedbackContent = string | number | VNode | (() => VNode);
type NoticeKind = 'success' | 'error' | 'warning' | 'info' | 'loading';
interface NoticeOptions {
  content: FeedbackContent;
  duration?: number;
  resetOnHover?: boolean;
  id?: string;
  onClose?: () => void;
}
interface Notice extends NoticeOptions {
  key: number;
  kind: NoticeKind;
  remaining: number;
  startedAt: number;
  timer?: ReturnType<typeof setTimeout>;
  hovered: boolean;
  focused: boolean;
}
export interface ConfirmationOptions {
  title?: string;
  content?: FeedbackContent;
  okText?: string;
  cancelText?: string;
  maskClosable?: boolean;
  closable?: boolean;
  width?: string | number;
  okButtonProps?: { status?: string; disabled?: boolean };
  onBeforeOk?: () => boolean | void | Promise<boolean | void>;
  onBeforeCancel?: () => boolean | void | Promise<boolean | void>;
  onOk?: () => unknown;
  onCancel?: () => unknown;
  onClose?: () => unknown;
}
export interface Confirmation extends ConfirmationOptions {
  key: number;
  showCancel: boolean;
}

export const notices = shallowReactive<Notice[]>([]);
export const confirmations = shallowReactive<Confirmation[]>([]);
let sequence = 0;

function preserveContent(content: FeedbackContent | undefined) {
  return content && typeof content === 'object' ? markRaw(content) : content;
}

export function closeNotice(key: number) {
  const index = notices.findIndex(item => item.key === key);
  if (index < 0) return;
  const item = notices[index]!;
  if (item.timer) clearTimeout(item.timer);
  notices.splice(index, 1);
  item.onClose?.();
}

function resumeNotice(item: Notice) {
  if (item.hovered || item.focused || item.remaining === 0) return;
  item.startedAt = Date.now();
  item.timer = setTimeout(() => closeNotice(item.key), Math.max(1, item.remaining));
}

export function pauseNotice(key: number, source: 'hovered' | 'focused', paused: boolean) {
  const item = notices.find(entry => entry.key === key);
  if (!item) return;
  const wasPaused = item.hovered || item.focused;
  item[source] = paused;
  if (!wasPaused && paused && item.timer) {
    clearTimeout(item.timer);
    item.timer = undefined;
    item.remaining = Math.max(1, item.remaining - (Date.now() - item.startedAt));
  } else if (wasPaused && !item.hovered && !item.focused) {
    resumeNotice(item);
  }
}

function showNotice(kind: NoticeKind, value: FeedbackContent | NoticeOptions) {
  const options: NoticeOptions = typeof value === 'object' && value !== null && 'content' in value
    ? value as NoticeOptions : { content: value as FeedbackContent };
  if (options.id) {
    const previous = notices.find(item => item.id === options.id);
    if (previous) closeNotice(previous.key);
  }
  const item = shallowReactive<Notice>({
    ...options, content: preserveContent(options.content)!, key: ++sequence, kind,
    remaining: Math.max(0, options.duration ?? (kind === 'loading' ? 0 : 3000)),
    startedAt: 0, hovered: false, focused: false
  });
  notices.push(item);
  resumeNotice(item);
  return { close: () => closeNotice(item.key) };
}

export const Message = {
  success: (value: FeedbackContent | NoticeOptions) => showNotice('success', value),
  error: (value: FeedbackContent | NoticeOptions) => showNotice('error', value),
  warning: (value: FeedbackContent | NoticeOptions) => showNotice('warning', value),
  info: (value: FeedbackContent | NoticeOptions) => showNotice('info', value),
  loading: (value: FeedbackContent | NoticeOptions) => showNotice('loading', value),
  clear: () => [...notices].forEach(item => closeNotice(item.key))
};

export function closeConfirmation(key: number) {
  const index = confirmations.findIndex(item => item.key === key);
  if (index < 0) return;
  const item = confirmations[index]!;
  confirmations.splice(index, 1);
  item.onClose?.();
}

function showConfirmation(options: ConfirmationOptions, showCancel: boolean) {
  const item: Confirmation = { ...options, content: preserveContent(options.content), key: ++sequence, showCancel };
  confirmations.push(item);
  return { close: () => closeConfirmation(item.key) };
}

export const Modal = {
  confirm: (options: ConfirmationOptions) => showConfirmation(options, true),
  warning: (options: ConfirmationOptions) => showConfirmation(options, true),
  error: (options: ConfirmationOptions) => showConfirmation(options, false),
  info: (options: ConfirmationOptions) => showConfirmation(options, false),
  success: (options: ConfirmationOptions) => showConfirmation(options, false)
};
