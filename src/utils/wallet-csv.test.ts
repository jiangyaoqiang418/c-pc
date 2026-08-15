import { describe, expect, it } from 'vitest';
import { walletLedgerCsv } from './wallet-csv';

describe('walletLedgerCsv', () => {
  it('keeps test recharge semantics and escapes CSV content', () => {
    const csv = walletLedgerCsv([{
      id: 1,
      userId: 1,
      userName: '',
      type: 'DEPOSIT_IN',
      direction: 'in',
      amount: '100',
      balanceAfter: '100',
      chainTxHash: 'DEV-TEST-1',
      remark: '测试,"到账"',
      testData: true,
      createdAt: '2026-08-15T00:00:00.000Z'
    }]);

    expect(csv).toContain('"测试模拟到账"');
    expect(csv).toContain('"是"');
    expect(csv).toContain('"测试,""到账"""');
    expect(csv).toContain('"DEV-TEST-1"');
  });
});
