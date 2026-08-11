import { describe, expect, it } from 'vitest';
import { toOrderRecord } from './order-mapper';
import { cartStorageKey } from '@/stores/cart';

describe('toOrderRecord', () => {
  it('保留退款完成状态、长 ID 与资金凭证', () => {
    const record = toOrderRecord({
      orderId: '2087045217757257730',
      orderNo: '2087045217635622912',
      status: 'REFUNDED',
      customerId: '2086359209189400577',
      sellerId: '2082303088212398081',
      productId: '2086331622220189697',
      totalAmount: '300.00',
      paymentBizNo: 'ORD-PAY-2087045217635622912',
      refundId: '2087052706519277569',
      refundStatus: 'AGREED',
      refundAmount: '300.00',
      createdAt: '1786454129000',
      completedAt: '1786454200000'
    });

    expect(record.id).toBe('2087045217757257730');
    expect(record.productId).toBe('2086331622220189697');
    expect(record.status).toBe('REFUNDED');
    expect(record.paymentBizNo).toBe('ORD-PAY-2087045217635622912');
    expect(record.refundId).toBe('2087052706519277569');
    expect(record.refundAmount).toBe('300.00');
    expect(record.archivedAt).toBe(new Date(1786454200000).toISOString());
  });

  it('组合收货地址并映射后端发货凭证字段', () => {
    const record = toOrderRecord({
      orderId: '1',
      status: 'SHIPPED',
      country: '中国',
      province: '测试省',
      city: '测试市',
      district: '测试区',
      detailAddress: 'QA 地址',
      trackingNo: 'QA-SF-20260810-201500',
      logisticsCompany: '顺丰国际',
      logisticsCompanyCode: 'SF_INTL',
      shipVouchers: ['https://example.com/ship-proof.png'],
      shippedRemark: '已完成出库',
      createdAt: '1786454129000'
    });

    expect(record.shippingAddress).toBe('中国测试省测试市测试区QA 地址');
    expect(record.trackingNumber).toBe('QA-SF-20260810-201500');
    expect(record.shippingCarrier).toBe('SF_INTL');
    expect(record.shippingScreenshotUrl).toBe('https://example.com/ship-proof.png');
    expect(record.shippingVoucherUrls).toEqual(['https://example.com/ship-proof.png']);
    expect(record.shippedRemark).toBe('已完成出库');
  });

  it('缺失履约字段时只降级，不伪造地址或凭证', () => {
    const record = toOrderRecord({ orderId: '1', status: 'PAID', createdAt: '1786454129000' });

    expect(record.shippingAddress).toBe('后端暂未返回收货地址');
    expect(record.trackingNumber).toBeUndefined();
    expect(record.purchaseScreenshotUrl).toBeUndefined();
    expect(record.shippingScreenshotUrl).toBeUndefined();
    expect(record.shippingVoucherUrls).toBeUndefined();
  });
});

describe('cartStorageKey', () => {
  it('按用户 ID 隔离本地购物车，匿名态不复用登录用户数据', () => {
    expect(cartStorageKey('2086359209189400577')).toBe('bw-shop-cart:2086359209189400577');
    expect(cartStorageKey('2082303088212398081')).toBe('bw-shop-cart:2082303088212398081');
    expect(cartStorageKey()).toBe('bw-shop-cart:anonymous');
  });
});
