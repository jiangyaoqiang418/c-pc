import { describe, expect, it } from 'vitest';
import {
  compareBusinessId,
  conversationImageUrls,
  createOptimisticMessage,
  imagePreviewIndex,
  isRecallAvailable,
  latestServerMessageId,
  mergeMessages
} from './im';

describe('IM Long ID 与乐观消息', () => {
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
