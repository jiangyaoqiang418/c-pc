import { describe, expect, it } from 'vitest';
import {
  applyReadEvent,
  captureMessageAnchor,
  restoreMessageAnchor,
  compareBusinessId,
  conversationImageUrls,
  createOptimisticMessage,
  imagePreviewIndex,
  isRecallAvailable,
  latestServerMessageId,
  isNearMessageBottom,
  syncMessageGap,
  shouldSendOnEnter,
  mergeMessages,
  parseOrderMessageCard,
  markUnconfirmedMessageFailed
} from './im';

describe('IM Long ID 与乐观消息', () => {
  it('订单卡片二次解析保留数值 Long，缺失或无效 ID 不提供跳转', () => {
    expect(parseOrderMessageCard('{"orderId":2093370220769533954,"productTitle":"QA"}')?.orderId).toBe('2093370220769533954');
    expect(parseOrderMessageCard('{"orderId":"000123"}')?.orderId).toBe('000123');
    expect(parseOrderMessageCard('{"orderId":123}')?.orderId).toBe(123);
    for (const content of ['', 'invalid', 'null', '[]', '{}', '{"orderId":{}}', '{"orderId":" "}']) {
      expect(parseOrderMessageCard(content)).toBeUndefined();
    }
  });

  it('服务端确认后迟到的发送错误不回退成功状态，临时消息仍可原键重试', () => {
    const local = createOptimisticMessage({ conversationId: 'c', clientMsgId: 'qa', msgType: 'TEXT', content: 'QA' }, { id: 'u' });
    const failed = markUnconfirmedMessageFailed([local], 'qa');
    expect(failed[0]).toMatchObject({ pending: false, failed: true, clientMsgId: 'qa' });
    expect(local.pending).toBe(true);
    const confirmed = mergeMessages(failed, { id: '2093370220769533954', conversationId: 'c', clientMsgId: 'qa', msgType: 'TEXT' });
    expect(markUnconfirmedMessageFailed(confirmed, 'qa')[0]).toBe(confirmed[0]);
    expect(confirmed[0]).toMatchObject({ pending: false, failed: false });
  });
  it('历史定位保留当前可见消息偏移，不依赖总高度或底部新消息', () => {
    let top = 80;
    let attached = true;
    const row = { getBoundingClientRect: () => ({ top, bottom: top + 100 }) } as HTMLElement;
    const container = { scrollTop: 320, getBoundingClientRect: () => ({ top: 100, bottom: 600 }),
      querySelectorAll: () => [row], contains: () => attached } as unknown as HTMLElement;
    const anchor = captureMessageAnchor(container);
    expect(anchor?.offset).toBe(-20);
    top += 240;
    restoreMessageAnchor(container, anchor);
    expect(container.scrollTop).toBe(560);
    // 图片尺寸随后增加时继续保持同一消息锚点；切换会话后旧节点不能再定位。
    top = 130;
    restoreMessageAnchor(container, anchor);
    expect(container.scrollTop).toBe(610);
    attached = false;
    top = 900;
    restoreMessageAnchor(container, anchor);
    expect(container.scrollTop).toBe(610);
  });
  it('连续补偿超过 200 条消息，不用先到的实时消息跳过中间缺口', async () => {
    const all = Array.from({ length: 450 }, (_, i) => ({ id: String(i + 101), conversationId: 'c', msgType: 'TEXT' }));
    let messages: Api.RealNotify.ImMessageVO[] = [{ id: '1000', conversationId: 'c', msgType: 'TEXT' }];
    let cursor: string | number = '100';
    const requested: (string | number)[] = [];
    const complete = await syncMessageGap({ conversationId: 'c', sinceId: cursor, signal: new AbortController().signal,
      request: async (sinceId, limit) => {
        requested.push(sinceId);
        return all.filter(item => compareBusinessId(item.id, sinceId) > 0).slice(0, limit);
      },
      accept: (incoming, next) => { messages = mergeMessages(messages, incoming); cursor = next; }
    });
    expect(complete).toBe(true);
    expect(requested).toEqual(['100', '300', '500']);
    expect(cursor).toBe('550');
    expect(messages).toHaveLength(451);
    expect(latestServerMessageId(messages)).toBe('1000');
  });

  it('补偿达到单轮上限时保留连续游标，下一轮从该位置继续', async () => {
    let cursor: string | number = '0';
    const all = Array.from({ length: 1100 }, (_, i) => ({ id: String(i + 1), conversationId: 'c' }));
    const options = { conversationId: 'c', sinceId: cursor, signal: new AbortController().signal,
      request: async (sinceId: string | number, limit: number) => all.filter(item => compareBusinessId(item.id, sinceId) > 0).slice(0, limit),
      accept: (_incoming: Api.RealNotify.ImMessageVO[], next: string | number) => { cursor = next; }
    };
    expect(await syncMessageGap(options)).toBe(false);
    expect(cursor).toBe('1000');
    expect(await syncMessageGap({ ...options, sinceId: cursor })).toBe(true);
    expect(cursor).toBe('1100');
  });

  it('增量乱序、跨会话、重复游标与取消不推进当前批次', async () => {
    for (const incoming of [[{ id: '100', conversationId: 'c' }], [{ id: '101', conversationId: 'other' }],
      [{ id: '102', conversationId: 'c' }, { id: '101', conversationId: 'c' }]]) {
      let accepted = false;
      await expect(syncMessageGap({ conversationId: 'c', sinceId: '100', signal: new AbortController().signal,
        request: async () => incoming, accept: () => { accepted = true; } })).rejects.toThrow();
      expect(accepted).toBe(false);
    }
    const controller = new AbortController();
    let accepted = false;
    await expect(syncMessageGap({ conversationId: 'c', sinceId: '100', signal: controller.signal,
      request: async () => { controller.abort(); return [{ id: '101', conversationId: 'c' }]; },
      accept: () => { accepted = true; } })).rejects.toThrow();
    expect(accepted).toBe(false);
  });

  it('读取历史时不自动跳底，接近底部或首次进入才跟随消息', () => {
    expect(isNearMessageBottom()).toBe(true);
    expect(isNearMessageBottom({ scrollHeight: 2000, scrollTop: 0, clientHeight: 500 })).toBe(false);
    expect(isNearMessageBottom({ scrollHeight: 2000, scrollTop: 1470, clientHeight: 500 })).toBe(true);
  });

  it('中文选词与换行不发送，普通 Enter 才发送', () => {
    const enter = { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 };
    expect(shouldSendOnEnter(enter)).toBe(true);
    expect(shouldSendOnEnter({ ...enter, isComposing: true })).toBe(false);
    expect(shouldSendOnEnter({ ...enter, keyCode: 229 })).toBe(false);
    expect(shouldSendOnEnter({ ...enter, shiftKey: true })).toBe(false);
    expect(shouldSendOnEnter({ ...enter, key: 'a' })).toBe(false);
  });
  it('仅推进当前会话的已读位置，不接受其他会话或乱序事件', () => {
    const previous = { reader: '2087164523669184512' };
    expect(applyReadEvent(previous, 'conversation-a', {
      conversationId: 'conversation-b', readerUserId: 'reader', lastReadMessageId: '2087164523669184599'
    })).toBe(previous);
    expect(applyReadEvent(previous, 'conversation-a', {
      conversationId: 'conversation-a', readerUserId: 'reader', lastReadMessageId: '2087164523669184511'
    })).toBe(previous);
    expect(applyReadEvent(previous, 'conversation-a', {
      conversationId: 'conversation-a', userId: 'reader', lastReadMessageId: '2087164523669184513'
    })).toEqual({ reader: '2087164523669184513' });
    expect(previous.reader).toBe('2087164523669184512');
  });
  it('按数值而不是字典序比较不同长度的 Long ID', () => {
    expect(compareBusinessId('9', '10')).toBeLessThan(0);
    expect(compareBusinessId('2087164523669184512', '2087164523669184513')).toBeLessThan(0);
    expect(compareBusinessId('0009', '9')).toBe(0);
  });

  it('以 clientMsgId 替换乐观消息且不重复渲染', () => {
    const optimistic = createOptimisticMessage(
      { conversationId: '2087164523669184512', msgType: 'TEXT', content: '你好', clientMsgId: 'qa-client-msg' },
      { id: '2086359209189400577', name: 'mamba' }
    );
    const result = mergeMessages([optimistic], {
      id: '2087164523669184599',
      conversationId: '2087164523669184512',
      msgType: 'TEXT',
      content: '你好',
      clientMsgId: 'qa-client-msg',
      createdAt: '1786500000000'
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2087164523669184599');
    expect(result[0].pending).toBe(false);
    expect(latestServerMessageId(result)).toBe('2087164523669184599');
  });

  it('失败消息复用原标识重试后，首次响应和重试响应合并为一条', () => {
    const params: Api.RealNotify.ImSendMessageParams = {
      conversationId: '2087164523669184512', msgType: 'TEXT', content: '重试', clientMsgId: 'same-attempt'
    };
    const failed = { ...createOptimisticMessage(params, { id: '3' }), pending: false, failed: true };
    const retry = { ...failed, pending: true, failed: false };
    const response: Api.RealNotify.ImMessageVO = { ...params, id: '2087164523669184599' };
    const merged = mergeMessages(mergeMessages([retry], response), response);
    expect(merged).toHaveLength(1);
    expect(merged[0].clientMsgId).toBe('same-attempt');
    expect(merged[0].failed).toBe(false);
  });

  it('只允许两分钟内的本人非系统消息撤回', () => {
    const now = Date.now();
    expect(isRecallAvailable({ id: '1', conversationId: '2', senderId: '3', msgType: 'TEXT', createdAt: String(now - 60_000) }, '3')).toBe(true);
    expect(isRecallAvailable({ id: '1', conversationId: '2', senderId: '3', msgType: 'SYSTEM', createdAt: String(now - 60_000) }, '3')).toBe(false);
    expect(isRecallAvailable({ id: '1', conversationId: '2', senderId: '3', msgType: 'TEXT', createdAt: String(now - 121_000) }, '3')).toBe(false);
  });

  it('按会话历史顺序收集可预览图片，并定位当前图片', () => {
    const images = conversationImageUrls([
      { id: '1', conversationId: '2', msgType: 'IMAGE', mediaUrl: 'https://cdn.example/1.jpg' },
      { id: '2', conversationId: '2', msgType: 'TEXT', mediaUrl: 'https://cdn.example/text.jpg' },
      { id: '3', conversationId: '2', msgType: 'IMAGE', mediaUrl: 'https://cdn.example/2.jpg' },
      { id: '4', conversationId: '2', msgType: 'IMAGE', mediaUrl: 'https://cdn.example/1.jpg' },
      { id: '5', conversationId: '2', msgType: 'IMAGE', mediaUrl: 'https://cdn.example/recalled.jpg', recalled: true }
    ]);

    expect(images).toEqual(['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg']);
    expect(imagePreviewIndex(images, 'https://cdn.example/2.jpg')).toBe(1);
    expect(imagePreviewIndex(images, 'https://cdn.example/missing.jpg')).toBe(-1);
  });
});
