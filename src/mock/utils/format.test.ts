import { describe, expect, it, vi } from 'vitest';
import { formatAmount } from './format';
import { priceSet, formatCny, RATE_SOURCE_TEXT } from './currency';
import { referenceRates, retainReferenceRates } from '@/composables/use-reference-rates';
import { compareDecimalAmount, exactDecimalNumber } from '@/components/wallet/decimal-amount';
import AmountInput from '@/components/common/amount-input.vue';
import DepositMeter from '@/components/buyer/deposit-meter.vue';
import { createSSRApp, h, nextTick, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';

describe('金额展示', () => {
  it('参考折算不冒充实时汇率，不改变 USDT 结算金额', () => {
    const value = priceSet('10');
    expect(value.usdtRaw).toBe('10');
    expect(value.cny).toBe('—');
    expect(value.rate).toBeUndefined();
    expect(value.rateLabel).toContain('暂不可用');
    expect(value.rateLabel).toContain('以 USDT 结算');
    expect(RATE_SOURCE_TEXT).not.toContain('每 5 分钟');
  });
  it('顶部和金额折算共用实际参考快照，失败保留历史标识，不回退固定汇率', () => {
    const before = { ...referenceRates.USDT };
    try {
      referenceRates.USDT = { value: 6.6641, fetchedAt: Date.now(), failed: false };
      expect(formatCny('10')).toBe('¥66.64');
      expect(priceSet('10').rate).toBe(6.6641);
      expect(priceSet('10').rateLabel).toContain('6.6641');
      referenceRates.USDT.failed = true;
      expect(priceSet('10').rateLabel).toContain('历史');
      expect(formatCny('10')).toBe('¥66.64');
    } finally { referenceRates.USDT = before; }
  });
  it('参考行情在切入聊天取消后立即返回能重取，旧请求不得覆盖新报价', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const pending: { resolve: (value: unknown) => void; asset: string }[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise(resolve => pending.push({ resolve, asset: new URL(url).searchParams.get('currency')! }))));
    const before = { USDT: { ...referenceRates.USDT }, USDC: { ...referenceRates.USDC } };
    let release: (() => void) | undefined;
    try {
      release = retainReferenceRates();
      expect(pending).toHaveLength(2);
      release();
      release = retainReferenceRates();
      expect(pending).toHaveLength(4);
      for (const item of pending.slice(2)) item.resolve({ ok: true, json: async () => ({ data: { currency: item.asset, rates: { CNY: '6.5' } } }) });
      await vi.advanceTimersByTimeAsync(1);
      for (const item of pending.slice(0, 2)) item.resolve({ ok: true, json: async () => ({ data: { currency: item.asset, rates: { CNY: '7.18' } } }) });
      await vi.advanceTimersByTimeAsync(1);
      expect(referenceRates.USDT.value).toBe(6.5);
      expect(referenceRates.USDC.value).toBe(6.5);
      expect(referenceRates.USDT.failed).toBe(false);
    } finally {
      release?.();
      referenceRates.USDT = before.USDT; referenceRates.USDC = before.USDC;
      vi.unstubAllGlobals(); vi.useRealTimers();
    }
  });
  it('统一保留两位小数并添加千分位', () => {
    expect(formatAmount('1234567.8')).toBe('1,234,567.80');
    expect(formatAmount(-20)).toBe('-20.00');
  });

  it('保留十进制字符串和 JSON 金额 token 的原始精度', () => {
    expect(formatAmount('9007199254740993.01')).toBe('9,007,199,254,740,993.01');
    expect(formatAmount('9007199254740993.995')).toBe('9,007,199,254,740,994.00');
    expect(formatAmount('1.005')).toBe('1.01');
    expect(formatAmount('-1.005')).toBe('-1.01');
    expect(formatAmount('0.999999999999999999999')).toBe('1.00');
  });

  it('准确格式化科学记法、负数和可选展示参数', () => {
    expect(formatAmount('9.00719925474099301e15')).toBe('9,007,199,254,740,993.01');
    expect(formatAmount('-1.005E+3')).toBe('-1,005.00');
    expect(formatAmount('1e-8', { decimals: 8, suffix: 'USDT' })).toBe('0.00000001 USDT');
    expect(formatAmount('1e101', { thousands: false })).toBe('1' + '0'.repeat(101) + '.00');
    expect(formatAmount('+.5', { decimals: 0 })).toBe('1');
    expect(formatAmount('  -1234.567  ', { thousands: false, suffix: 'USDT' })).toBe('-1234.57 USDT');
    expect(formatAmount('-0.001')).toBe('-0.00');
    expect(formatAmount('-0')).toBe('0.00');
  });

  it('number 输入继续采用原生 toFixed 舍入与科学记法语义', () => {
    expect(formatAmount(1.005)).toBe('1.00');
    expect(formatAmount(-0)).toBe('0.00');
    expect(formatAmount(1e21)).toBe('1e+21');
    expect(formatAmount(1234.5, { decimals: 0, thousands: false })).toBe('1235');
    expect(formatAmount('1.234', { decimals: 1.9 })).toBe('1.2');
    expect(() => formatAmount('1', { decimals: 101 })).toThrow(RangeError);
  });

  it('对空值和非法金额使用占位符', () => {
    expect(formatAmount(undefined)).toBe('—');
    expect(formatAmount('not-a-number')).toBe('—');
    expect(formatAmount('   ')).toBe('—');
    expect(formatAmount('Infinity')).toBe('—');
    expect(formatAmount(NaN, { fallback: '待确认' })).toBe('待确认');
    expect(formatAmount('1e10001')).toBe('—');
  });

  it('押金占用率未知或非法时不显示为零，有效零值保留百分号', async () => {
    for (const rate of [undefined, null, '', 'NaN', 'Infinity', '-1', 'null']) {
      const html = await renderToString(createSSRApp({ render:() => h(DepositMeter, { usageRate:rate }) }));
      expect(html).toContain('<dt>占用率</dt><dd>—</dd>');
      expect(html).not.toContain('null%');
      expect(html).not.toContain('NaN%');
    }
    for (const rate of ['0', '0.00', '12.50']) {
      const html = await renderToString(createSSRApp({ render:() => h(DepositMeter, { usageRate:rate }) }));
      expect(html).toContain(`<dt>占用率</dt><dd>${rate}%</dd>`);
    }
  });
});

describe('金额输入的 number DTO 边界', () => {
  it('按真实 JSON token 回读比较，而不是把安全整数值当金额上限', () => {
    expect(exactDecimalNumber('9007199254740993.01').value).toBeUndefined();
    expect(exactDecimalNumber('10000000000000000.1').value).toBeUndefined();
    expect(exactDecimalNumber('9007199254740994').value).toBe(9007199254740994);
    expect(exactDecimalNumber('0.00000001').value).toBe(1e-8);
    expect(exactDecimalNumber('1e101').value).toBe(1e101);
    expect(exactDecimalNumber('1e309').value).toBeUndefined();
    expect(exactDecimalNumber('1e-99999999', true).value).toBeUndefined();
    expect(exactDecimalNumber('0e-99999999', true).value).toBe(0);
    expect(exactDecimalNumber('0', true).value).toBe(0);
    expect(exactDecimalNumber('0').value).toBeUndefined();
    expect(compareDecimalAmount('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareDecimalAmount('1e101', '1' + '0'.repeat(101))).toBe(0);
    expect(compareDecimalAmount('100.01', '100.0100000')).toBe(0);
  });

  it('opt-in 保留不准确原文并阻止金额输出，修正后恢复普通提交', async () => {
    const props = reactive({ modelValue:9007199254740994, rawValue:'9007199254740993.01', exactDecimal:true, precision:2 });
    let state: any;
    const Probe: any = { ...AmountInput, setup(props:any, context:any) { state = (AmountInput as any).setup(props, context); return state; } };
    const html = await renderToString(createSSRApp({ render:() => h(Probe, { ...props,
      'onUpdate:modelValue': (value:number) => { props.modelValue = value; },
      'onUpdate:rawValue': (value:string) => { props.rawValue = value; }
    }) }));
    expect(html).toContain('9007199254740993.01');
    expect(html).toContain('无法准确提交');
    await nextTick();
    expect(props.modelValue).toBeNaN();
    expect(state.draft.value).toBe('9007199254740993.01');
    expect(state.amountError.value).toContain('无法准确提交');
    state.commit();
    expect(props.modelValue).toBeNaN();
    state.input('12.34');
    await nextTick();
    state.commit();
    await nextTick();
    expect(props.modelValue).toBe(12.34);
    expect(state.draft.value).toBe('12.34');
    expect(state.amountError.value).toBe('');
    state.input('1.005');
    state.commit();
    expect(props.modelValue).toBe(1);
  });

  it('默认消费者保留原有 number 输入和 blur 舍入行为', async () => {
    const props = reactive({ modelValue:0, precision:2 });
    const values: number[] = [];
    let state: any;
    const Probe: any = { ...AmountInput, setup(props:any, context:any) { state = (AmountInput as any).setup(props, context); return state; } };
    await renderToString(createSSRApp({ render:() => h(Probe, { ...props, 'onUpdate:modelValue': (value:number) => values.push(value) }) }));
    state.input('1.005');
    state.commit();
    expect(values).toEqual([1.005, 1]);
  });

  it('求购原文模式不在失焦时抬高预算或舍入小数', async () => {
    const props = reactive({ rawValue:'500', preserveInput:true, precision:2, min:10 });
    const values: string[] = [];
    let state: any;
    const Probe: any = { ...AmountInput, setup(props:any, context:any) { state = (AmountInput as any).setup(props, context); return state; } };
    await renderToString(createSSRApp({ render:() => h(Probe, { ...props, 'onUpdate:rawValue': (value:string) => { props.rawValue = value; values.push(value); } }) }));
    for (const text of ['1', '1.005', '9007199254740993.01', '0010.00', '']) {
      state.input(text);
      state.commit();
      await nextTick();
      expect(state.draft.value).toBe(text);
      expect(props.rawValue).toBe(text);
    }
    expect(values).toEqual(['1', '1.005', '9007199254740993.01', '0010.00', '']);
  });
});
