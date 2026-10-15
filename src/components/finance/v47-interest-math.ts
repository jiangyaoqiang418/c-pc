import { sumPaymentAmounts } from '@/utils/checkout';

type DecimalValue = string | number | null | undefined;

// Reuse the transaction decimal parser; these values only drive theoretical previews.
function decimal(value: DecimalValue) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  try {
    const text = sumPaymentAmounts([typeof value === 'string' ? value.trim() : value]);
    const [integer, fraction = ''] = text.split('.');
    return { units: BigInt(integer + fraction), scale: fraction.length, text };
  } catch { return undefined; }
}

function fixedRatio(numerator: bigint, denominator: bigint, decimals: number) {
  const units = (numerator * 10n ** BigInt(decimals) * 2n + denominator) / (denominator * 2n);
  const digits = units.toString().padStart(decimals + 1, '0');
  return decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
}

/** annualRate is the base annual fraction: 0.1 means 10%, matching the API and v47. */
export function simpleFinanceInterest(principal: DecimalValue, annualRate: DecimalValue, days: number) {
  const amount = decimal(principal);
  const rate = decimal(annualRate);
  if (!amount || !rate || !Number.isSafeInteger(days) || days < 0) return undefined;
  return fixedRatio(amount.units * rate.units * BigInt(days), 365n * 10n ** BigInt(amount.scale + rate.scale), 8);
}

export function formatFinanceAmount(value: DecimalValue, options: { decimals?: number; thousands?: boolean; fallback?: string; suffix?: string } = {}) {
  const amount = decimal(value);
  const decimals = options.decimals ?? 2;
  if (!amount || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 20) return options.fallback ?? '—';
  const fixed = fixedRatio(amount.units, 10n ** BigInt(amount.scale), decimals);
  const [integer, fraction] = fixed.split('.');
  const grouped = options.thousands === false ? integer : integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return options.suffix ? `${text} ${options.suffix}` : text;
}

export function formatFinanceRate(value: DecimalValue, decimals = 2, fallback = '—') {
  const rate = decimal(value);
  return rate && Number.isSafeInteger(decimals) && decimals >= 0 && decimals <= 20
    ? fixedRatio(rate.units * 100n, 10n ** BigInt(rate.scale), decimals) + '%' : fallback;
}

export function knownFinanceDecimal(value: DecimalValue) { return decimal(value)?.text; }
