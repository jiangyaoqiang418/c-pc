import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, markRaw, ssrContextKey, type Component } from 'vue';
import MessageInput from '@/components/im/message-input.vue';
import MessageBubble from '@/components/im/message-bubble.vue';
import * as notifyApi from '@/service/api/notify';
import { closeConfirmation, confirmations, Message } from '@/lib/feedback';
import {
  applyReadEvent,
  messageReadCount,
  refreshMessageReadCounts,
  orderConversationMetadata,
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

describe('IM 媒体播放节点生命周期', () => {
  interface BubbleState {
    senderInitial:string;
    mediaElement:HTMLMediaElement | undefined;
    mediaFailed:boolean;
    mediaAttempt:number;
    onMediaError:(event: Event) => void;
    retryMedia:() => void;
  }

  function mountBubble() {
    const subject = { ...MessageBubble, render:() => null } as Component;
    const renderer = createRenderer<object, object>({
      insert:() => undefined, remove:() => undefined, createElement:() => ({}), createText:() => ({}), createComment:() => ({}),
      setText:() => undefined, setElementText:() => undefined, parentNode:() => null, nextSibling:() => null, patchProp:() => undefined
    });
    const app = renderer.createApp(subject, { msg:{ id:'m', conversationId:'c', msgType:'VOICE', mediaUrl:'https://example.test/a.ogg' }, side:'left' });
    app.provide(ssrContextKey, {});
    app.mount({});
    const instance = (app as unknown as { _instance:{ setupState:BubbleState; props:{ msg:Api.RealNotify.ImMessageVO } } })._instance;
    return { app, state:instance.setupState, properties:instance.props };
  }

  function playingMedia() {
    return markRaw({ pause:vi.fn(), removeAttribute:vi.fn(), load:vi.fn() }) as unknown as HTMLMediaElement;
  }

  it.each(['recalled', 'mediaUrl', 'unmount'] as const)('%s 时停止旧播放并释放媒体源', reason => {
    const { app, state, properties } = mountBubble();
    const media = playingMedia();
    state.mediaElement = media;
    try {
      if (reason === 'unmount') app.unmount();
      else properties.msg = { ...properties.msg, [reason]:reason === 'recalled' ? true : 'https://example.test/b.ogg' };
      expect(media.pause).toHaveBeenCalledOnce();
      expect(media.removeAttribute).toHaveBeenCalledExactlyOnceWith('src');
      expect(media.load).toHaveBeenCalledOnce();
    } finally { if (reason !== 'unmount') app.unmount(); }
  });

  it('普通消息元数据更新不打断当前播放', () => {
    const { app, state, properties } = mountBubble();
    const media = playingMedia();
    state.mediaElement = media;
    try {
      properties.msg = { ...properties.msg, duration:5, createdAt:'1792162800000' };
      properties.msg = { ...properties.msg, recalled:false };
      properties.msg = { ...properties.msg, recalled:undefined };
      expect(media.pause).not.toHaveBeenCalled();
      expect(media.removeAttribute).not.toHaveBeenCalled();
      expect(media.load).not.toHaveBeenCalled();
      expect(state.mediaElement).toBe(media);
    } finally { app.unmount(); }
  });

  it('消息头像保留完整首码点，名称变化不打断播放', () => {
    const { app, state, properties } = mountBubble();
    const media = playingMedia();
    state.mediaElement = media;
    try {
      for (const [senderName, initial] of [['😀成员','😀'], ['𠮷野','𠮷'], ['普通成员','普'], ['Alice','A'], ['','成']]) {
        properties.msg = { ...properties.msg, senderName };
        expect(state.senderInitial).toBe(initial);
      }
      expect(media.pause).not.toHaveBeenCalled();
    } finally { app.unmount(); }
  });

  it('切换媒体后忽略旧节点的迟到错误，当前节点错误仍显示失败并释放', () => {
    const { app, state, properties } = mountBubble();
    const oldMedia = playingMedia();
    const currentMedia = playingMedia();
    state.mediaElement = oldMedia;
    try {
      properties.msg = { ...properties.msg, mediaUrl:'https://example.test/b.ogg' };
      state.mediaElement = currentMedia;
      state.onMediaError({ currentTarget:oldMedia } as unknown as Event);
      expect(state.mediaFailed).toBe(false);
      expect(currentMedia.pause).not.toHaveBeenCalled();
      state.onMediaError({ currentTarget:currentMedia } as unknown as Event);
      expect(state.mediaFailed).toBe(true);
      expect(currentMedia.pause).toHaveBeenCalledOnce();
      expect(currentMedia.removeAttribute).toHaveBeenCalledExactlyOnceWith('src');
      expect(currentMedia.load).toHaveBeenCalledOnce();
      state.onMediaError({ currentTarget:currentMedia } as unknown as Event);
      expect(currentMedia.pause).toHaveBeenCalledOnce();
      state.retryMedia();
      const retry = playingMedia();
      state.mediaElement = retry;
      state.onMediaError({ currentTarget:currentMedia } as unknown as Event);
      expect(state.mediaFailed).toBe(false);
      expect(state.mediaAttempt).toBe(1);
      expect(retry.pause).not.toHaveBeenCalled();
    } finally { app.unmount(); }
  });
});

describe('IM 媒体操作生命周期', () => {
  interface InputState {
    onImageSelected:(event: Event) => Promise<void>;
    onVideoSelected:(event: Event) => Promise<void>;
    uploading:boolean;
    preparingVideo:boolean;
  }

  function mountInput() {
    const send = vi.fn();
    const subject = { ...MessageInput, render:() => null } as Component;
    const renderer = createRenderer<object, object>({
      insert:() => undefined, remove:() => undefined, createElement:() => ({}), createText:() => ({}), createComment:() => ({}),
      setText:() => undefined, setElementText:() => undefined, parentNode:() => null, nextSibling:() => null, patchProp:() => undefined
    });
    const app = renderer.createApp(subject, { contextKey:'conversation-a', onSend:send });
    app.provide(ssrContextKey, {});
    app.mount({});
    const instance = (app as unknown as { _instance:{ setupState:InputState; props:Record<string, unknown> } })._instance;
    return { app, state:instance.setupState, properties:instance.props, send };
  }

  function selectedFile(type: string) {
    return { target:{ files:[new File(['local-only'], type.startsWith('image/') ? 'local.png' : 'local.mp4', { type })], value:'selected' } } as unknown as Event;
  }

  function stubVideo() {
    const video = {
      duration:3, videoWidth:640, videoHeight:360, currentTime:0, src:'', preload:'', muted:false,
      onloadedmetadata:null as (() => void) | null, onseeked:null as (() => void) | null, onerror:null as (() => void) | null,
      removeAttribute:vi.fn(), load:vi.fn()
    };
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-video');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('document', { createElement:(tag: string) => tag === 'video' ? video : {
      width:0, height:0, getContext:() => ({ drawImage:vi.fn() }), toBlob:(callback: BlobCallback) => callback(null)
    } });
    return { video, createObjectURL, revokeObjectURL };
  }

  afterEach(() => {
    [...confirmations].forEach(item => closeConfirmation(item.key));
    Message.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['disabled', 'contextKey'] as const)('短暂改变 %s 并恢复后，旧图片上传不能发送', async key => {
    let finish!: (value: Api.RealNotify.ImFileUploadResult) => void;
    vi.spyOn(notifyApi, 'uploadImFile').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { app, state, properties, send } = mountInput();
    try {
      const pending = state.onImageSelected(selectedFile('image/png'));
      const previous = properties[key];
      properties[key] = key === 'disabled' ? true : 'conversation-b';
      properties[key] = previous;
      finish({ id:'local-upload', url:'https://example.test/local.png' } as Api.RealNotify.ImFileUploadResult);
      await pending;
      expect(send).not.toHaveBeenCalled();
      expect(state.uploading).toBe(false);
    } finally { app.unmount(); }
  });

  it('禁用再恢复会关闭视频确认，旧确认回调不能上传或发送', async () => {
    const upload = vi.spyOn(notifyApi, 'uploadImFile').mockResolvedValue({ id:'local-upload', url:'https://example.test/local.mp4' } as Api.RealNotify.ImFileUploadResult);
    const { video } = stubVideo();
    const { app, state, properties, send } = mountInput();
    try {
      const pending = state.onVideoSelected(selectedFile('video/mp4'));
      video.onloadedmetadata?.();
      video.onseeked?.();
      await pending;
      const confirmation = confirmations[0];
      expect(confirmation).toBeDefined();
      properties.disabled = true;
      properties.disabled = false;
      expect(confirmations).toHaveLength(0);
      await confirmation.onOk?.();
      expect(upload).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally { app.unmount(); }
  });

  it.each(['disabled', 'unmount'] as const)('%s 立即释放未完成的视频读取资源并结束等待', async reason => {
    vi.useFakeTimers();
    const { video, revokeObjectURL } = stubVideo();
    const { app, state, properties, send } = mountInput();
    const pending = state.onVideoSelected(selectedFile('video/mp4'));
    let settled = false;
    void pending.then(() => { settled = true; });
    try {
      expect(vi.getTimerCount()).toBe(1);
      if (reason === 'disabled') properties.disabled = true;
      else app.unmount();
      expect(video.removeAttribute).toHaveBeenCalledWith('src');
      expect(video.load).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:local-video');
      expect(video.onloadedmetadata).toBeNull();
      expect(video.onseeked).toBeNull();
      expect(video.onerror).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      await pending;
      await Promise.resolve();
      expect(settled).toBe(true);
      expect(state.preparingVideo).toBe(false);
      expect(confirmations).toHaveLength(0);
      expect(send).not.toHaveBeenCalled();
    } finally {
      video.onerror?.();
      await pending;
      if (reason !== 'unmount') app.unmount();
    }
  });
});

describe('IM Long ID 与乐观消息', () => {
  it('历史人数与实时成员水位不直接相加，重复回执和自己的回执不多计', () => {
    const message = { id:'2093370220769533954', conversationId:'c', senderId:'self', readCount:2 };
    let watermarks = applyReadEvent({}, 'c', { conversationId:'c', readerUserId:'peer', lastReadMessageId:message.id });
    watermarks = applyReadEvent(watermarks, 'c', { conversationId:'c', readerUserId:'peer', lastReadMessageId:message.id });
    watermarks = applyReadEvent(watermarks, 'c', { conversationId:'c', readerUserId:'self', lastReadMessageId:message.id });
    expect(messageReadCount(message, watermarks)).toBe(2);
    expect(messageReadCount({ ...message, readCount:0 }, watermarks)).toBe(1);
    expect(messageReadCount({ ...message, readCount:undefined }, { early:'2093370220769533953' })).toBe(0);
  });

  it('迟到历史、重复发送回执及缺省人数不能回退已确认人数', () => {
    const message = { id:'100', conversationId:'c', readCount:2 };
    expect(mergeMessages([message], { ...message, readCount:0 })[0].readCount).toBe(2);
    expect(mergeMessages([message], { ...message, readCount:undefined })[0].readCount).toBe(2);
    expect(mergeMessages([{ ...message, readCount:0 }], message)[0].readCount).toBe(2);
    expect(mergeMessages([message], { ...message, readCount:3 })[0].readCount).toBe(3);
  });

  it('重连回读已加载旧消息的人数，不把分页中的新消息跳过增量游标直接加入', async () => {
    const oldMessage = { id:'100', conversationId:'c', readCount:0 };
    const requests: number[] = [];
    let messages = [oldMessage];
    await refreshMessageReadCounts({ messages, conversationId:'c', signal:new AbortController().signal,
      request:async page => { requests.push(page); return { total:2, records:[{ id:'101', conversationId:'c', readCount:1 }, { ...oldMessage, readCount:2 }] }; },
      accept:incoming => { messages = mergeMessages(messages, incoming) as typeof messages; }
    });
    expect(requests).toEqual([1]);
    expect(messages).toEqual([{ ...oldMessage, readCount:2, pending:false, failed:false }]);
  });

  it('已读分页读取取消后不接受迟到结果，其他会话人数不能写回', async () => {
    const accept = vi.fn();
    const controller = new AbortController();
    await expect(refreshMessageReadCounts({ messages:[{ id:'100', conversationId:'c' }], conversationId:'c', signal:controller.signal,
      request:async () => { controller.abort(); return { total:1, records:[{ id:'100', conversationId:'c', readCount:2 }] }; }, accept
    })).rejects.toThrow();
    expect(accept).not.toHaveBeenCalled();
    await expect(refreshMessageReadCounts({ messages:[{ id:'100', conversationId:'c' }], conversationId:'c', signal:new AbortController().signal,
      request:async () => ({ total:1, records:[{ id:'100', conversationId:'other', readCount:2 }] }), accept
    })).rejects.toThrow('其他会话');
    expect(accept).not.toHaveBeenCalled();
  });

  it('同一群多订单的独立页按路由目标取状态，不能使用群最近一单冒充', () => {
    const conversation = { id:'c', orderId:'2093370220769533955', orderNo:'new-order', orderStatusText:'待付款', productTitle:'new' };
    const order = { orderId:'2093370220769533954', orderNo:'old-order', orderStatusText:'已完成', productTitle:'old' };
    expect(orderConversationMetadata(conversation, order.orderId, [order])).toMatchObject({ id:'c', orderId:order.orderId, orderNo:'old-order', orderStatusText:'已完成', productTitle:'old' });
    expect(orderConversationMetadata(conversation, order.orderId, [])).toMatchObject({ orderId:order.orderId, orderNo:undefined, orderStatusText:undefined, productTitle:undefined });
    expect(orderConversationMetadata(conversation, conversation.orderId, [])).toBe(conversation);
  });

  it('撤回清理内容和媒体，迟到原消息不能复活', () => {
    const original = { id: '1', conversationId: 'c', content: 'qa', mediaUrl: 'qa.png', mediaFileId: 'f', duration: 3, params: { content: 'qa', mediaUrl: 'qa.png' } };
    const recalled = mergeMessages([original], { id: '1', conversationId: 'c', recalled: true });
    const late = mergeMessages(recalled, { ...original, recalled: false });
    expect(late[0]).toMatchObject({ recalled: true, content: undefined, mediaUrl: undefined, mediaFileId: undefined, duration: undefined, params: undefined });
    expect(mergeMessages([{ ...original, recalled: true }], [])[0].params).toBeUndefined();
    expect(conversationImageUrls(late)).toEqual([]);
  });
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
