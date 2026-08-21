import { enums } from '@shared';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function transactionLabel(txn: Api.RealWallet.DisplayLedger) {
  return txn.testData ? '测试模拟到账' : enums.TXN_TYPE_META[txn.type]?.label || txn.type;
}

export function walletLedgerCsv(records: Api.RealWallet.DisplayLedger[]) {
  const header = ['流水编号', '类型', '测试数据', '方向', '金额(USDT)', '出账桶', '入账桶', '余额变化后', '交易哈希', '备注', '时间'];
  const rows = records.map(txn => [
    txn.id,
    transactionLabel(txn),
    txn.testData ? '是' : '否',
    txn.direction === 'in' ? '收入' : '支出',
    txn.amount,
    txn.bucketFrom || '',
    txn.bucketTo || '',
    txn.balanceAfter,
    txn.chainTxHash || '',
    txn.remark || '',
    txn.createdAt
  ]);
  return `\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}`;
}
