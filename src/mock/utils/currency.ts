/**
 * 汇率与人民币显示 helper —— 全站价格双币显示 (CNY 主 · USDT 副)
 *
 * 用法：
 *   import { formatCny, formatUsdt, priceSet, getUsdtCnyRate, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
 *
 *   formatCny(3199) → '¥22,955.82'
 *   formatUsdt(3199) → 'U 3,199.00'
 *   priceSet(3199) → { cny, cnyRaw, usdt, usdtRaw, rate, rateLabel }
 */
import { EXCHANGE_RATES } from '../mock/data/fund-exchange-rates';
import { formatAmount } from './format';

/**
 * 从 mock 汇率池取 USDT/CNY 有效汇率
 * 优先级：OKX (enabled) → Binance (enabled) → 回退 7.18
 */
export function getUsdtCnyRate(): number {
  const okx = EXCHANGE_RATES.find(
    r => r.base === 'USDT' && r.quote === 'CNY' && r.source === 'OKX' && r.enabled
  );
  if (okx) return Number(okx.rate);
  const bin = EXCHANGE_RATES.find(
    r => r.base === 'USDT' && r.quote === 'CNY' && r.source === 'Binance' && r.enabled
  );
  if (bin) return Number(bin.rate);
  return 7.18;
}

/** ¥ 前缀 + 千位分隔 + 2 位小数 */
export function formatCny(usdt: string | number | null | undefined): string {
  if (usdt == null || usdt === '') return '—';
  const n = Number(usdt);
  if (!Number.isFinite(n)) return '—';
  const cny = n * getUsdtCnyRate();
  return '¥' + formatAmount(cny.toFixed(2));
}

/** U 前缀 + 千位分隔 */
export function formatUsdt(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  return 'U ' + formatAmount(v);
}

/** ¥ 前缀（仅数字部分带千位分隔）—— 用于已知 CNY 数值直接显示 */
export function formatCnyRaw(cny: string | number | null | undefined): string {
  if (cny == null || cny === '') return '—';
  return '¥' + formatAmount(cny);
}

/**
 * 从 USDT 值一次性生成完整双币显示所需的字段
 *
 * @example
 * priceSet(3199) → {
 *   cny: '¥22,955.82',
 *   cnyRaw: '22955.82',
 *   usdt: 'U 3,199.00',
 *   usdtRaw: '3199',
 *   rate: 7.18,
 *   rateLabel: '1 USDT = ¥7.18'
 * }
 */
export function priceSet(usdt: string | number | null | undefined) {
  const rate = getUsdtCnyRate();
  const n = usdt == null || usdt === '' ? 0 : Number(usdt);
  const cnyRaw = Number.isFinite(n) ? (n * rate).toFixed(2) : '0';
  return {
    cny: formatCny(usdt),
    cnyRaw,
    usdt: formatUsdt(usdt),
    usdtRaw: String(usdt ?? ''),
    rate,
    rateLabel: `1 USDT = ¥${rate.toFixed(2)}`
  };
}

/** 税费问号 tooltip 统一文案 —— 供 InfoTooltip 复用 */
export const TAX_TOOLTIP_TEXT =
  '税费按发货地 → 收货地距离计算。中国大陆收货：多数商品无额外税费；非中国大陆收货（港澳台/海外）：可能产生清关税费，请以实际清关为准。';

/** 汇率来源提示（可选显示） */
export const RATE_SOURCE_TEXT = '汇率来源 OKX · 每 5 分钟刷新';
