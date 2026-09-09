import { describe, expect, it, vi } from 'vitest';
import { currencyFractionDigits, currencySymbol, formatDayLabel, formatMoney, formatMoneyAuto, formatPercent, initialsOf, memberColorFor, moneyDisplayValue, parseIsoDate, splitMoney } from './format';

// Every money-displaying component goes through these, so a change here moves
// every amount in the app at once. `parseIsoDate` is the load-bearing one: a
// date-only string is a LOCAL calendar day, never UTC midnight - reading it as
// UTC shifts a bill's due date by a day for most of the world.
//
// Assertions use the en-US locale explicitly, so a CI runner's own locale
// cannot change the result. Non-breaking spaces in Intl output are normalised.

const flat = (s: string) => s.replace(/ | /g, ' ');

describe('formatMoney', () => {
  it('formats to two decimals with the currency symbol', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('signs negatives and leaves positives bare by default', () => {
    expect(formatMoney(-42)).toBe('-$42.00');
    expect(formatMoney(42)).toBe('$42.00');
  });

  it('honours signDisplay', () => {
    expect(formatMoney(42, { signDisplay: 'always' })).toBe('+$42.00');
    expect(formatMoney(-42, { signDisplay: 'never' })).toBe('$42.00');
    expect(formatMoney(0, { signDisplay: 'exceptZero' })).toBe('$0.00');
  });

  it('drops the cents on request', () => {
    expect(formatMoney(1234.56, { wholeOnly: true })).toBe('$1,235');
  });

  it('abbreviates large values when compact', () => {
    expect(formatMoney(12400, { compact: true })).toBe('$12.4K');
  });

  it('uses the given currency and locale', () => {
    expect(flat(formatMoney(1234.5, { currency: 'AUD' }))).toBe('A$1,234.50');
    expect(flat(formatMoney(1234.5, { currency: 'EUR', locale: 'de-DE' }))).toBe('1.234,50 €');
  });

  it('treats a non-finite amount as zero rather than printing NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('$0.00');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });

  it('falls back to a plain string for an invalid currency code', () => {
    expect(formatMoney(-42, { currency: 'not a code' })).toBe('-$42.00');
  });
});

describe('formatMoneyAuto', () => {
  it('shows cents only when they matter', () => {
    expect(formatMoneyAuto(450)).toBe('$450');
    expect(formatMoneyAuto(64.2)).toBe('$64.20');
  });

  it('lets an explicit wholeOnly win', () => {
    expect(formatMoneyAuto(64.2, { wholeOnly: true })).toBe('$64');
  });
});

describe('splitMoney', () => {
  it('separates sign, whole part and fraction', () => {
    expect(splitMoney(1234.5)).toEqual({ sign: '', whole: '$1,234', fraction: '.50' });
    expect(splitMoney(-9.05)).toEqual({ sign: '-', whole: '$9', fraction: '.05' });
  });

  it('leaves no fraction when whole-only', () => {
    expect(splitMoney(1234.5, { wholeOnly: true })).toEqual({ sign: '', whole: '$1,235', fraction: '' });
  });

  it('recombines into the same string formatMoney produces', () => {
    for (const value of [0, 1, -1, 0.05, 1234.56, -98765.43]) {
      const { sign, whole, fraction } = splitMoney(value);
      expect(sign + whole + fraction).toBe(formatMoney(value));
    }
  });

  it('keeps a trailing symbol on the fraction side for a suffix locale', () => {
    const parts = splitMoney(1234.5, { currency: 'EUR', locale: 'de-DE' });
    expect(flat(parts.whole + parts.fraction)).toBe('1.234,50 €');
  });
});

describe('currencySymbol', () => {
  it('narrows to the familiar symbol', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('AUD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('GBP')).toBe('£');
  });

  it('falls back to the code it was given', () => {
    expect(currencySymbol('not a code')).toBe('not a code');
  });
});

describe('formatPercent', () => {
  it('renders a 0..1 fraction as a percentage', () => {
    expect(formatPercent(0.42)).toBe('42%');
    expect(formatPercent(0.4267, 1)).toBe('42.7%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('treats a non-finite fraction as zero', () => {
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});

describe('initialsOf', () => {
  it('takes the first and last initial', () => {
    expect(initialsOf('Priya Natarajan')).toBe('PN');
    expect(initialsOf('sam')).toBe('S');
    expect(initialsOf('Ada B. Lovelace')).toBe('AL');
  });

  it('copes with extra whitespace and an empty name', () => {
    expect(initialsOf('  Priya   Natarajan  ')).toBe('PN');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('')).toBe('?');
  });
});

describe('memberColorFor', () => {
  it('is deterministic, so a person keeps their colour', () => {
    expect(memberColorFor('Priya')).toBe(memberColorFor('Priya'));
  });

  it('always returns a colour from the palette', () => {
    for (const name of ['Priya', 'Sam', 'Alex', '', 'Ω']) {
      expect(['coral', 'violet', 'sky', 'lime', 'rose', 'amber']).toContain(memberColorFor(name));
    }
  });
});

describe('parseIsoDate', () => {
  it('reads a date-only string as a LOCAL calendar day, not UTC midnight', () => {
    const d = parseIsoDate('2026-08-20');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseIsoDate(' 2026-08-20 ').getDate()).toBe(20);
  });

  it('passes a full datetime through to the Date constructor', () => {
    const d = parseIsoDate('2026-08-20T17:05:00');
    expect(d.getHours()).toBe(17);
    expect(d.getMinutes()).toBe(5);
  });

  it('returns an invalid date for nonsense rather than throwing', () => {
    expect(Number.isNaN(parseIsoDate('nope').getTime())).toBe(true);
  });
});

describe('formatDayLabel', () => {
  const now = new Date(2026, 7, 20, 12, 0);

  it('names today and yesterday', () => {
    expect(formatDayLabel('2026-08-20', now)).toBe('Today');
    expect(formatDayLabel('2026-08-19', now)).toBe('Yesterday');
  });

  it('falls back to a weekday and date', () => {
    expect(formatDayLabel('2026-08-17', now)).toBe('Mon, Aug 17');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatDayLabel('not a date', now)).toBe('not a date');
  });
});

describe('display zero is honest', () => {
  it('sub-half-cent dust never prints as a signed zero', () => {
    expect(formatMoney(-4.547e-13)).toBe('$0.00');
    expect(formatMoney(-0)).toBe('$0.00');
    expect(splitMoney(-4.547e-13).sign).toBe('');
    expect(formatMoneyAuto(-4.547e-13)).toBe('$0.00');
  });

  it('a real half-cent still shows', () => {
    expect(formatMoney(-0.005)).toBe('-$0.01');
    expect(formatMoney(0.005)).toBe('$0.01');
  });

  it('a negative percent that rounds to zero shows as plain zero', () => {
    expect(formatPercent(-0.001, 0, { clamp: false })).toBe('0%');
    expect(formatPercent(-0.0004, 1, { clamp: false })).toBe('0.0%');
    expect(formatPercent(-0.006, 0, { clamp: false })).toBe('-1%');
    expect(formatPercent(0.42)).toBe('42%');
  });

  it('a whole-only figure treats anything under half a unit as zero - MON-6', () => {
    // Overspent by 40 cents, the Overview hero must not read "Safe to spend -A$0".
    expect(formatMoney(-0.4, { currency: 'AUD', wholeOnly: true })).toBe('A$0');
    expect(formatMoney(0.4, { wholeOnly: true })).toBe('$0');
    expect(formatMoney(-0.6, { wholeOnly: true })).toBe('-$1');
    expect(splitMoney(-0.4, { wholeOnly: true }).sign).toBe('');
    // At two decimals the old half-cent rule is unchanged.
    expect(formatMoney(-0.4)).toBe('-$0.40');
  });

  it('exposes the printed value so tone and sign can follow the text - DS-6', () => {
    expect(moneyDisplayValue(-4.547e-13)).toBe(0);
    expect(moneyDisplayValue(-0.004)).toBe(0);
    expect(moneyDisplayValue(-0.006)).toBe(-0.006);
    expect(moneyDisplayValue(-0.4, { wholeOnly: true })).toBe(0);
    expect(moneyDisplayValue(0.4, { currency: 'JPY' })).toBe(0);
    expect(moneyDisplayValue(Number.NaN)).toBe(0);
    expect(moneyDisplayValue(12.5)).toBe(12.5);
  });
});

describe('currency precision follows the currency - MF-13', () => {
  it('knows how many fraction digits a currency is written with', () => {
    expect(currencyFractionDigits('USD')).toBe(2);
    expect(currencyFractionDigits('JPY')).toBe(0);
    expect(currencyFractionDigits('KWD')).toBe(3);
    expect(currencyFractionDigits('not a code')).toBe(2);
  });

  it('never gives yen a ".00"', () => {
    expect(formatMoney(1500, { currency: 'JPY' })).toBe('¥1,500');
    expect(formatMoney(1500.4, { currency: 'JPY' })).toBe('¥1,500');
    expect(formatMoneyAuto(1500.4, { currency: 'JPY' })).toBe('¥1,500');
    expect(splitMoney(1500, { currency: 'JPY' })).toEqual({ sign: '', whole: '¥1,500', fraction: '' });
  });

  it('keeps three places for a three-decimal currency', () => {
    expect(flat(formatMoney(1.5, { currency: 'KWD' }))).toBe('KWD 1.500');
  });
});

describe('formatPercent clamps and can floor - MON-14', () => {
  it('clamps to 0..100 by default, with an opt-out', () => {
    expect(formatPercent(1.5)).toBe('100%');
    expect(formatPercent(-0.2)).toBe('0%');
    expect(formatPercent(1.5, 0, { clamp: false })).toBe('150%');
    expect(formatPercent(-0.2, 0, { clamp: false })).toBe('-20%');
  });

  it('floors for progress so a goal is never "100%" before it is reached', () => {
    expect(formatPercent(0.995, 0, { rounding: 'floor' })).toBe('99%');
    expect(formatPercent(0.9999, 0, { rounding: 'floor' })).toBe('99%');
    expect(formatPercent(1, 0, { rounding: 'floor' })).toBe('100%');
    expect(formatPercent(0.4267, 1, { rounding: 'floor' })).toBe('42.6%');
    // Float dust must not floor a clean value down: 0.29 * 100 is 28.999999999999996.
    expect(formatPercent(0.29, 0, { rounding: 'floor' })).toBe('29%');
    expect(formatPercent(0.07, 0, { rounding: 'floor' })).toBe('7%');
  });
});

describe('initials keep an emoji whole - DS-7', () => {
  it('takes the first grapheme, not the first UTF-16 unit', () => {
    expect(initialsOf('👶 Baby')).toBe('👶B');
    expect(initialsOf('Ærin')).toBe('Æ');
    expect(initialsOf('👨‍👩‍👧 Family')).toBe('👨‍👩‍👧F');
  });
});

describe('formatters are cached - UI-11', () => {
  it('builds one Intl.NumberFormat per option set, not one per call', () => {
    const ctor = vi.spyOn(Intl, 'NumberFormat');
    formatMoney(1, { currency: 'CHF', locale: 'de-CH' });
    const afterFirst = ctor.mock.calls.length;
    formatMoney(2, { currency: 'CHF', locale: 'de-CH' });
    formatMoney(3, { currency: 'CHF', locale: 'de-CH' });
    expect(ctor.mock.calls.length).toBe(afterFirst);
  });
});
