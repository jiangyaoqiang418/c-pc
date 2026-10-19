import { RequestError } from './type';

export interface EventStreamFrame {
  event: string;
  data: string;
}

/** POST SSE 的传输层：逐段解码，直到空行才交付事件，注释及心跳不进入页面。 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: EventStreamFrame) => boolean,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  let frameSize = 0;
  const interrupted = () => new RequestError('回答中断，请重新提问', { code: 'STREAM_INTERRUPTED' });

  function consumeLine(line: string) {
    if (line === '') {
      const frame = { event, data: data.join('\n') };
      const hasData = data.length > 0;
      event = 'message';
      data = [];
      frameSize = 0;
      return hasData && onFrame(frame);
    }
    frameSize += line.length;
    if (frameSize > 1_048_576) throw new RequestError('客服响应过大，请缩小查询范围后重新提问', { code: 'STREAM_TOO_LARGE' });
    if (line.startsWith(':')) return false;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
    return false;
  }

  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('已停止', 'AbortError');
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal?.aborted) throw error;
        throw interrupted();
      }
      if (signal?.aborted) throw new DOMException('已停止', 'AbortError');
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let start = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const char = buffer[index];
        if (char !== '\n' && char !== '\r') continue;
        // CRLF 可恰好被两次网络读取拆开。
        if (char === '\r' && index === buffer.length - 1 && !chunk.done) break;
        const line = buffer.slice(start, index);
        if (char === '\r' && buffer[index + 1] === '\n') index += 1;
        start = index + 1;
        if (consumeLine(line)) return;
      }
      buffer = buffer.slice(start);
      if (buffer.length + frameSize > 1_048_576) throw new RequestError('客服响应过大，请缩小查询范围后重新提问', { code: 'STREAM_TOO_LARGE' });
      if (chunk.done) throw interrupted();
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
