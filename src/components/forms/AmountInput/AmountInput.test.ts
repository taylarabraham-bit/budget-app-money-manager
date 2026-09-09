import { describe, expect, it } from 'vitest';
import { hasMixedSeparators, parseAmountText, sanitizeAmountText } from './AmountInput';

// The comma decision (product decision, 2026-08-29): commas never enter the amount field.
// The old behaviour KEPT the comma visible but stripped it before parsing, so a
// European-style "1,50" silently read as 150 - a hundredfold error.

describe('sanitizeAmountText', () => {
  it('never lets a comma into the field', () => {
    expect(sanitizeAmountText('1,50')).toBe('150');
    expect(sanitizeAmountText('1,500')).toBe('1500');
    expect(sanitizeAmountText('12.50')).toBe('12.50');
    expect(sanitizeAmountText('$1,234.56')).toBe('1234.56');
  });

  it('keeps digits, dots and the minus, drops everything else', () => {
    expect(sanitizeAmountText('abc12x.5')).toBe('12.5');
    expect(sanitizeAmountText('-42')).toBe('-42');
    expect(sanitizeAmountText(' ')).toBe('');
  });
});

describe('parseAmountText', () => {
  it('reads exactly what the field shows', () => {
    expect(parseAmountText('12.50')).toBe(12.5);
    expect(parseAmountText('150')).toBe(150);
    expect(parseAmountText('0.01')).toBe(0.01);
  });

  it('is null while empty or unfinished', () => {
    expect(parseAmountText('')).toBeNull();
    expect(parseAmountText('-')).toBeNull();
  });

  it('is null for something that is not one number', () => {
    expect(parseAmountText('1.2.3')).toBeNull();
    expect(parseAmountText('1-2')).toBeNull();
  });
});

// A paste is the one way two separators can arrive at once. "1.234,56" used to
// sanitise to 1.23456 and save as $1.23 (audit DS-13).
describe('hasMixedSeparators', () => {
  it('refuses a European decimal comma or a jumble of separators', () => {
    expect(hasMixedSeparators('1.234,56')).toBe(true);
    expect(hasMixedSeparators('1.234,56 €')).toBe(true);
    expect(hasMixedSeparators('12,34.5')).toBe(true);
    expect(hasMixedSeparators('1,2,3')).toBe(true);
  });

  it('accepts plain thousands grouping, which sanitises to the right number', () => {
    expect(hasMixedSeparators('1,234.56')).toBe(false);
    expect(hasMixedSeparators('$1,234.56')).toBe(false);
    expect(hasMixedSeparators('1,234,567')).toBe(false);
    expect(hasMixedSeparators('-1,234.5')).toBe(false);
  });

  it('leaves a lone comma to the pinned strip rule and ignores plain text', () => {
    expect(hasMixedSeparators('1,50')).toBe(false);
    expect(hasMixedSeparators('1,')).toBe(false);
    expect(hasMixedSeparators('12.50')).toBe(false);
    expect(hasMixedSeparators('')).toBe(false);
  });
});
