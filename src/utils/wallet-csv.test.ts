import { describe, expect, it } from 'vitest';
import { walletLedgerCsv } from './wallet-csv';
import { prepareWithdrawal } from '@/service/api/wallet';

describe('提现提交校验', () => {
  const params = { chain: 'TRON' as const, amount: 20, toAddress: '  T111111111111111111111111111111111  ' };
  it('规范化地址后校验，确认快照不受原表单后续修改影响', () => {
    const draft = { ...params };
    const prepared = prepareWithdrawal(draft, '100');
    draft.amount = 50;
    expect(prepared.error).toBe('');
    expect(prepared.params.amount).toBe(20);
    expect(prepared.params.toAddress).toBe(params.toAddress.trim());
  });
  it('空白地址、空金额和不足最低金额不能提交', () => {
    expect(prepareWithdrawal({ ...params, toAddress: ' '.repeat(30) }, 100).error).toBe('请输入目标地址');
    expect(prepareWithdrawal({ ...params, amount: undefined as unknown as number }, 100).error).toBe('请输入转出金额');
    expect(prepareWithdrawal({ ...params, amount: 0 }, 100).error).toBe('请输入转出金额');
    expect(prepareWithdrawal({ ...params, amount: 19 }, 100).error).toBe('单笔最小转出 20 U');
  });
  it('钱包未就绪或确认期间余额减少时阻止提交', () => {
    expect(prepareWithdrawal(params).error).toBe('请先成功读取钱包余额');
    expect(prepareWithdrawal(params, 'invalid').error).toBe('请先成功读取钱包余额');
    const prepared = prepareWithdrawal(params, 100);
    expect(prepareWithdrawal(prepared.params, 10).error).toBe('可用余额不足');
  });
});

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
