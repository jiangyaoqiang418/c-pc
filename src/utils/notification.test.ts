import { describe, expect, it } from 'vitest';
import { conversationListQuery, notificationOrderId, notificationRoute } from './notification';

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

  it('为后端明确提供的业务对象创建跳转目标', () => {
    expect(notificationRoute({ bizType: 'ORDER', bizId: '2087164523669184512', templateCode: 'order_created' })).toEqual({
      name: 'order-detail',
      params: { id: '2087164523669184512' }
    });
    expect(notificationRoute({ bizType: 'FINANCE', bizId: '2087164523669184512', templateCode: 'finance_subscribed' })).toEqual({
      name: 'finance-lockup-detail',
      params: { id: '2087164523669184512' }
    });
    expect(notificationRoute({ bizType: 'RECHARGE', bizId: '1', templateCode: 'recharge_confirmed' })).toEqual({ name: 'wallet-deposit', query: { id: '1' } });
    expect(notificationRoute({ bizType: 'REFUND', bizId: '2087164523669184512' })).toBeUndefined();
  });
});
