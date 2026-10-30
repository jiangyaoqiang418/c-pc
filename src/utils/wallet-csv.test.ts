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
    expect(prepared.params.amount).toBe('20');
    expect(prepared.params.toAddress).toBe(params.toAddress.trim());
  });
  it('空白地址、空金额和不足最低金额不能提交', () => {
    expect(prepareWithdrawal({ ...params, toAddress: ' '.repeat(30) }, 100).error).toBe('请输入目标地址');
    expect(prepareWithdrawal({ ...params, amount: undefined as unknown as number }, 100).error).not.toBe('');
    expect(prepareWithdrawal({ ...params, amount: 0 }, 100).error).not.toBe('');
    expect(prepareWithdrawal({ ...params, amount: 19 }, 100).error).toBe('单笔最小转出 20 U');
  });
  it('钱包未就绪或确认期间余额减少时阻止提交', () => {
    expect(prepareWithdrawal(params).error).toBe('请先成功读取钱包余额');
    expect(prepareWithdrawal(params, 'invalid').error).toBe('请先成功读取钱包余额');
    const prepared = prepareWithdrawal(params, 100);
    expect(prepareWithdrawal(prepared.params, 10).error).toBe('可用余额不足');
  });
  it('以资产链配置校验精度和限额，完整保留大额及小额字符串', () => {
    const config: Api.RealWallet.WithdrawChainVO = { asset: 'USDC', chain: 'BSC', label: '币安智能链', decimals: 6, enabled: true, minAmount: '0.000001', maxAmount: null };
    const params = { asset: 'USDC' as const, chain: 'BSC' as const, amount: '99999999999999999999999999.123456', toAddress: '0x1111111111111111111111111111111111111111' };
    const prepared = prepareWithdrawal(params, params.amount, config);
    expect(prepared.error).toBe('');
    expect(prepared.params.amount).toBe(params.amount);
    expect(prepared.params.asset).toBe('USDC');
    expect(prepareWithdrawal({ ...params, amount: '0.000001' }, '1', config).error).toBe('');
    expect(prepareWithdrawal({ ...params, amount: '0.0000001' }, '1', config).error).not.toBe('');
    expect(prepareWithdrawal({ ...params, amount: '1.12345600' }, '2', config).params.amount).toBe('1.123456');
    expect(prepareWithdrawal(params, params.amount, { ...config, enabled: false }).error).toContain('暂不可转出');
    expect(prepareWithdrawal(params, params.amount, { ...config, asset: 'USDT' }).error).toContain('暂不可转出');
    expect(prepareWithdrawal(params, params.amount, { ...config, maxAmount: '10' }).error).toContain('最大转出');
  });
});

describe('walletLedgerCsv', () => {
  it('导出币种与完整金额，旧开发夹具仍标为 USDT', () => {
    const base: Api.RealWallet.Ledger = {
      id: '90071992547409931', userId: '90071992547409932', userName: '', type: 'DEPOSIT_IN',
      direction: 'in', amount: '99999999999999999999999999.123456', balanceAfter: '99999999999999999999999999.123456', createdAt: ''
    };
    const csv = walletLedgerCsv([base, { ...base, currency: 'USDC' }]);
    expect(csv).toContain('"币种","金额"');
    expect(csv).toContain('"USDC","99999999999999999999999999.123456"');
    expect(csv).toContain('"USDT","99999999999999999999999999.123456"');
  });
  it('exports backend business labels without collapsing different refund types', () => {
    const base: Api.RealWallet.Ledger = {
      id: '90071992547409931', userId: '90071992547409932', userName: '', type: 'DEPOSIT_IN',
      direction: 'in', amount: '100', balanceAfter: '100', createdAt: '2026-09-05T00:00:00.000Z'
    };
    const csv = walletLedgerCsv([
      { ...base, bizType: 'ORDER_REFUND', bizTypeText: '订单退款' },
      { ...base, bizType: 'CHAIN_WITHDRAW_REFUND' }
    ]);
    expect(csv).toContain('"订单退款"');
    expect(csv).toContain('"CHAIN_WITHDRAW_REFUND"');
    expect(csv).toContain('"90071992547409931"');
  });

  it('保留真实流水类型与原始备注，不按备注覆盖类型，继续正确转义CSV', () => {
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
      createdAt: '2026-08-15T00:00:00.000Z'
    }]);

    expect(csv).toContain('"链上入金"');
    expect(csv).not.toContain('"测试模拟到账"');
    expect(csv).not.toContain('"测试数据"');
    expect(csv).toContain('"测试,""到账"""');
    expect(csv).toContain('"DEV-TEST-1"');
  });
});
