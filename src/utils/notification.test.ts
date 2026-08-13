import { describe, expect, it } from 'vitest';
import { conversationListQuery, notificationOrderId } from './notification';

describe('通知与会话跳转', () => {
  it('仅在订单通知具有业务 ID 时跳转订单详情', () => {
    expect(notificationOrderId({ bizType: 'ORDER', bizId: '2087164523669184512' })).toBe('2087164523669184512');
    expect(notificationOrderId({ bizType: 'ORDER' })).toBeUndefined();
    expect(notificationOrderId({ bizType: 'ORDER', bizId: '' })).toBeUndefined();
    expect(notificationOrderId({ bizType: 'REFUND', bizId: '2087164523669184512' })).toBeUndefined();
  });

  it('从独立会话返回列表时保留当前会话标识', () => {
    expect(conversationListQuery('2087164523669184512')).toEqual({ conversationId: '2087164523669184512' });
    expect(conversationListQuery()).toBeUndefined();
  });
});
