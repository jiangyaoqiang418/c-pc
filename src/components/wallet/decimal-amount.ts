function decimalIdentity(token: string) {
  const match = token.trim().match(/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) return undefined;
  const fraction = match[2] || '';
  const coefficient = (match[1] + fraction).replace(/^0+/, '');
  if (!coefficient) return { digits: '0', shift: 0n };
  const digits = coefficient.replace(/0+$/, '');
  return { digits, shift: BigInt(match[3] || '0') - BigInt(fraction.length) + BigInt(coefficient.length - digits.length) };
}

/** Validate the actual JSON number token against the original decimal, without an invented amount ceiling. */
export function exactDecimalNumber(raw: string | number, allowZero = false) {
  const text = String(raw).trim().replace(/^\./, '0.').replace(/\.$/, '.0');
  const value = Number(text);
  if (!/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(value) || value < 0 || !allowZero && value === 0) {
    return { error: '请输入有效金额' };
  }
  try {
    const original = decimalIdentity(text)!;
    const serialized = decimalIdentity(JSON.stringify(value))!;
    if (original.digits !== serialized.digits || original.shift !== serialized.shift) return { error: '该金额无法准确提交，请调整金额后重试' };
  } catch { return { error: '该金额无法准确提交，请调整金额后重试' }; }
  return { value, error: '' };
}

/** Preserve decimal input before entering the existing numeric wallet DTO. */
function canonicalDecimal(value: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  const [integer, fraction = ''] = value.split('.');
  const digits = integer.replace(/^0+(?=\d)/, '');
  const tail = fraction.replace(/0+$/, '');
  return tail ? `${digits}.${tail}` : digits;
}

export function exactNumericAmount(raw: string | number, decimals: number) {
  const text = String(raw).trim();
  const canonical = canonicalDecimal(text);
  if (text.length > 96 || canonical === undefined || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    return { error: '请输入有效金额' };
  }
  if ((text.split('.')[1] || '').length > decimals) return { error: `最多支持 ${decimals} 位小数` };
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return { error: '金额必须大于 0' };
  if (canonicalDecimal(String(value)) !== canonical) return { error: '该金额无法准确提交，请调整金额' };
  return { value, error: '' };
}

export function compareDecimalAmount(left: string | number, right: string | number) {
  const values = [decimalIdentity(String(left)), decimalIdentity(String(right))];
  if (values.some(value => value === undefined)) return undefined;
  const [a, b] = values as NonNullable<ReturnType<typeof decimalIdentity>>[];
  if (a.digits === '0' || b.digits === '0') return a.digits === b.digits ? 0 : a.digits === '0' ? -1 : 1;
  const powers = [BigInt(a.digits.length) + a.shift, BigInt(b.digits.length) + b.shift];
  if (powers[0] !== powers[1]) return powers[0] < powers[1] ? -1 : 1;
  const length = Math.max(a.digits.length, b.digits.length);
  const units = [BigInt(a.digits.padEnd(length, '0')), BigInt(b.digits.padEnd(length, '0'))];
  return units[0] < units[1] ? -1 : units[0] > units[1] ? 1 : 0;
}

export function floorDecimalAmount(value: string, decimals: number) {
  if (canonicalDecimal(value) === undefined) return '';
  const [integer, fraction = ''] = value.split('.');
  return decimals ? `${integer}.${fraction.padEnd(decimals, '0').slice(0, decimals)}` : integer;
}
