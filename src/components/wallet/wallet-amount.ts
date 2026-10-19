import { knownFinanceDecimal } from '@/components/finance/v47-interest-math';

/** Preserve every returned decimal so a small transfer is never displayed as zero. */
export function displayWalletAmount(value: string | number | null | undefined, fallback = '暂不可用') {
  const decimal = knownFinanceDecimal(value);
  if (decimal === undefined) return fallback;
  const [integer, fraction = ''] = decimal.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}
