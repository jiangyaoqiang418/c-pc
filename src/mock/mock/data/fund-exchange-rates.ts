/**
 * 汇率快照池（R-DATA-38）：USDT 兑 4 法币 × 3 source。
 */
type RateRecord = Api.Fund.RateRecord;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function iso(daysAgo: number, h = 9): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
}

interface Seed {
  quote: Api.Fund.RateQuote;
  rate: string;
  source: Api.Fund.RateSource;
  daysAgo: number;
  enabled: boolean;
}

const SEEDS: Seed[] = [
  { quote: 'CNY', rate: '7.18', source: 'OKX', daysAgo: 0, enabled: true },
  { quote: 'CNY', rate: '7.17', source: 'Binance', daysAgo: 0, enabled: true },
  { quote: 'CNY', rate: '7.20', source: 'manual', daysAgo: 7, enabled: false },
  { quote: 'USD', rate: '1.00', source: 'OKX', daysAgo: 0, enabled: true },
  { quote: 'USD', rate: '1.00', source: 'Binance', daysAgo: 0, enabled: true },
  { quote: 'JPY', rate: '157.20', source: 'OKX', daysAgo: 0, enabled: true },
  { quote: 'JPY', rate: '157.00', source: 'Binance', daysAgo: 0, enabled: true },
  { quote: 'EUR', rate: '0.93', source: 'OKX', daysAgo: 0, enabled: true }
];

export const EXCHANGE_RATES: RateRecord[] = SEEDS.map(s => ({
  id: nextId(),
  base: 'USDT',
  quote: s.quote,
  rate: s.rate,
  source: s.source,
  fetchedAt: iso(s.daysAgo),
  enabled: s.enabled
}));

export function findRateById(id: number): RateRecord | undefined {
  return EXCHANGE_RATES.find(r => r.id === id);
}

export function upsertRate(p: Api.Fund.RateSaveParams): RateRecord {
  if (p.id) {
    const existing = findRateById(p.id);
    if (!existing) throw new Error('汇率不存在');
    existing.quote = p.quote;
    existing.rate = p.rate;
    existing.source = p.source;
    existing.enabled = p.enabled;
    existing.fetchedAt = new Date().toISOString();
    return existing;
  }
  const created: RateRecord = {
    id: nextId(),
    base: 'USDT',
    quote: p.quote,
    rate: p.rate,
    source: p.source,
    fetchedAt: new Date().toISOString(),
    enabled: p.enabled
  };
  EXCHANGE_RATES.push(created);
  return created;
}

export function toggleRate(rateId: number, enabled: boolean): RateRecord | undefined {
  const r = findRateById(rateId);
  if (!r) return undefined;
  r.enabled = enabled;
  return r;
}

/** 模拟从 OKX 刷新（mock） */
export function refreshFromOkx(): RateRecord[] {
  EXCHANGE_RATES.forEach(r => {
    if (r.source === 'OKX' && r.enabled) {
      // 微调 ±0.5%
      const old = Number(r.rate);
      const newRate = old * (1 + (Math.random() - 0.5) * 0.01);
      r.rate = newRate.toFixed(2);
      r.fetchedAt = new Date().toISOString();
    }
  });
  return EXCHANGE_RATES.filter(r => r.source === 'OKX');
}
