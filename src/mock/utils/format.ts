/**
 * R-UI-7 / R-MOD-8：平台统一展示格式化工具。
 *
 * - formatAmount：金额（USDT / CNY）展示，保留指定小数位 + 可选后缀 + 千分位
 * - formatPoints：积分整数 + 千分位
 * - formatRate：小数转百分比展示（0.1 → "10.00%"）
 */
import { sumPaymentAmounts } from '@/utils/checkout';

export interface FormatAmountOpts {
  /** 小数位数，默认 2 */
  decimals?: number;
  /** 单位后缀，默认 '' */
  suffix?: string;
  /** 是否千分位，默认 true */
  thousands?: boolean;
  /** 占位符（输入为 undefined / null / 空 时），默认 '—' */
  fallback?: string;
}

/**
 * 金额展示
 * @param value 字符串或数字（R-DATA-1：内部存储 string）
 */
export function formatAmount(value: string | number | null | undefined, opts: FormatAmountOpts = {}): string {
  const { decimals = 2, suffix = '', thousands = true, fallback = '—' } = opts;
  if (value === undefined || value === null || value === '') return fallback;
  let fixed: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback;
    // A numeric input already carries JavaScript's floating-point semantics.
    fixed = value.toFixed(decimals);
  } else {
    const match = value.trim().match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/);
    if (!match) return fallback;
    // Only the decimal-point offset becomes a Number; the amount stays exact.
    const power = match[3] === undefined ? 0 : Number(match[3]);
    if (!Number.isSafeInteger(power) || Math.abs(power) > 10_000) return fallback;
    const coefficient = match[2].replace(/^\./, '0.').replace(/\.$/, '.0');
    const [integer, fraction = ''] = sumPaymentAmounts([coefficient]).split('.');
    const units = BigInt(integer + fraction);
    // Reuse toFixed's precision validation and integer coercion, without converting the amount.
    const precision = (0).toFixed(decimals).split('.')[1]?.length ?? 0;
    const shift = power + precision - fraction.length;
    const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
    const rounded = shift < 0 ? (units * 2n + divisor) / (divisor * 2n) : units * 10n ** BigInt(shift);
    const digits = rounded.toString().padStart(precision + 1, '0');
    const sign = match[1] === '-' && units !== 0n ? '-' : '';
    fixed = sign + (precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits);
  }
  let out = fixed;
  if (thousands) {
    const [intPart, decPart] = fixed.split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    out = decPart ? `${grouped}.${decPart}` : grouped;
  }
  return suffix ? `${out} ${suffix}` : out;
}

/**
 * 积分整数 + 千分位
 */
export function formatPoints(value: number | null | undefined, fallback = '0'): string {
  if (value === undefined || value === null) return fallback;
  return Math.floor(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 小数 → 百分比展示
 * @example formatRate(0.1)         // "10.00%"
 * @example formatRate(0.125, 1)    // "12.5%"
 * @example formatRate(0)           // "0.00%"
 */
export function formatRate(value: number | null | undefined, decimals = 2, fallback = '—'): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return fallback;
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * 短地址：'TXxxxxxx...AB' 中间省略
 */
export function shortAddress(addr: string | null | undefined, head = 6, tail = 4): string {
  if (!addr) return '—';
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
