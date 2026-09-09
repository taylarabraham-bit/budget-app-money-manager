import { MEMBER_COLORS, type MemberColor } from './types';

export interface FormatMoneyOptions {
  /** ISO 4217 currency code. Default "USD". */
  currency?: string;
  /** BCP 47 locale. Default "en-US". */
  locale?: string;
  /** How to show the sign. Default "auto" (only negatives get a sign). */
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
  /** Drop the fraction digits (e.g. for large round totals). */
  wholeOnly?: boolean;
  /** Abbreviate large values ("$12.4K"). */
  compact?: boolean;
}

// Building an Intl.NumberFormat is the slow part of formatting money, and
// Amount built two per render - thousands per keystroke on a long Activity
// list. One formatter per distinct option set, kept for the session (audit UI-11).
const formatters = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, options);
    formatters.set(key, nf);
  }
  return nf;
}

const fractionDigitsByCurrency = new Map<string, number>();

/**
 * Fraction digits a currency is written with: 2 for USD or EUR, 0 for JPY and
 * KRW, 3 for KWD. Money figures and fields take their precision from here, so
 * yen never grow a ".00" (audit MF-13 / DS-14). Unknown codes read as 2.
 */
export function currencyFractionDigits(currency = 'USD'): number {
  let digits = fractionDigitsByCurrency.get(currency);
  if (digits === undefined) {
    try {
      digits = numberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
    fractionDigitsByCurrency.set(currency, digits);
  }
  return digits;
}

function fractionRange({ currency = 'USD', wholeOnly = false, compact = false }: FormatMoneyOptions): { minimumFractionDigits: number; maximumFractionDigits: number } {
  const digits = currencyFractionDigits(currency);
  return {
    minimumFractionDigits: wholeOnly || compact ? 0 : digits,
    maximumFractionDigits: wholeOnly ? 0 : compact ? 1 : digits,
  };
}

/**
 * The number a money string actually shows. Non-finite input reads as zero,
 * and anything under half of the smallest printed unit - float dust at two
 * decimals, a 40-cent overspend shown whole - is display-zero. Callers that
 * colour or sign by value go through this so they can never disagree with
 * the text: no "-$0.00", no red "$0.00", no "-A$0" (audit DS-6, MON-6).
 */
export function moneyDisplayValue(value: number, options: FormatMoneyOptions = {}): number {
  const finite = Number.isFinite(value) ? value : 0;
  const threshold = 0.5 / 10 ** fractionRange(options).maximumFractionDigits;
  return Math.abs(finite) < threshold ? 0 : finite;
}

/**
 * Format a number as money using Intl. Used by every money-displaying
 * component so all amounts in the app agree on format.
 */
export function formatMoney(value: number, options: FormatMoneyOptions = {}): string {
  const { currency = 'USD', locale = 'en-US', signDisplay = 'auto', wholeOnly = false, compact = false } = options;
  const safe = moneyDisplayValue(value, options);
  try {
    return numberFormat(locale, {
      style: 'currency',
      currency,
      signDisplay,
      notation: compact ? 'compact' : 'standard',
      ...fractionRange(options),
    }).format(safe);
  } catch {
    return `${safe < 0 ? '-' : ''}$${Math.abs(safe).toFixed(wholeOnly ? 0 : 2)}`;
  }
}

/**
 * Split a formatted money string into its parts so components can render the
 * fraction smaller than the integer part. Falls back to {whole: text}.
 */
export function splitMoney(value: number, options: FormatMoneyOptions = {}): { sign: string; whole: string; fraction: string } {
  const { currency = 'USD', locale = 'en-US', signDisplay = 'auto', wholeOnly = false } = options;
  // Same display-zero rule as formatMoney, so the two can never disagree about zero.
  const safe = moneyDisplayValue(value, { currency, wholeOnly });
  try {
    const parts = numberFormat(locale, {
      style: 'currency',
      currency,
      signDisplay,
      ...fractionRange({ currency, wholeOnly }),
    }).formatToParts(safe);
    let sign = '';
    let whole = '';
    let fraction = '';
    let inFraction = false;
    for (const p of parts) {
      if (p.type === 'minusSign' || p.type === 'plusSign') { sign += p.value; continue; }
      if (p.type === 'decimal') { inFraction = true; fraction += p.value; continue; }
      if (inFraction && p.type === 'fraction') { fraction += p.value; continue; }
      if (inFraction) { fraction += p.value; continue; }
      whole += p.value;
    }
    return { sign, whole, fraction };
  } catch {
    return { sign: safe < 0 ? '-' : '', whole: `$${Math.floor(Math.abs(safe))}`, fraction: wholeOnly ? '' : `.${Math.round((Math.abs(safe) % 1) * 100).toString().padStart(2, '0')}` };
  }
}

/** Currency symbol for a code, e.g. "USD" -> "$". */
export function currencySymbol(currency = 'USD', locale = 'en-US'): string {
  try {
    const part = numberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

export interface FormatPercentOptions {
  /** Keep the result within 0..100. Default true; pass false for a change that can be negative or above 100. */
  clamp?: boolean;
  /**
   * `floor` never rounds up to a milestone the value has not reached: 99.6% of
   * a goal stays "99%" instead of reading "100%" beside "Still to go $0.50"
   * (audit MON-14). Default `nearest`.
   */
  rounding?: 'nearest' | 'floor';
}

/** Percentage like "42%" from a 0..1 fraction: clamped to 0..100 and rounded unless told otherwise. */
export function formatPercent(fraction: number, digits = 0, options: FormatPercentOptions = {}): string {
  const { clamp = true, rounding = 'nearest' } = options;
  let v = Number.isFinite(fraction) ? fraction : 0;
  if (clamp) v = Math.max(0, Math.min(1, v));
  const scaled = v * 100;
  // The epsilon keeps a float like 0.29 * 100 = 28.999999999999996 at 29 when flooring.
  const shown = rounding === 'floor' ? Math.floor(scaled * 10 ** digits + 1e-9) / 10 ** digits : scaled;
  const text = shown.toFixed(digits);
  // A negative that rounds to zero is just zero - never show "-0%".
  return `${/^-0(\.0+)?$/.test(text) ? text.slice(1) : text}%`;
}

// Intl.Segmenter is not in the ES2020 lib but is in every WebView the app
// runs on; the fallback splits by code point, which still keeps an emoji whole.
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
let graphemes: GraphemeSegmenter | null | undefined;
function firstGrapheme(word: string): string {
  if (graphemes === undefined) {
    const Segmenter = (Intl as unknown as { Segmenter?: new (locales?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter }).Segmenter;
    graphemes = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  if (graphemes) {
    for (const { segment } of graphemes.segment(word)) return segment;
    return '';
  }
  return Array.from(word)[0] ?? '';
}

/** Initials for an avatar: "Priya Natarajan" -> "PN", "sam" -> "S". An emoji-led name keeps its emoji whole (audit DS-7). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = firstGrapheme(words[0] ?? '');
  const last = words.length > 1 ? firstGrapheme(words[words.length - 1] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Deterministic member colour for a name, so the same person always gets the same colour. */
export function memberColorFor(name: string): MemberColor {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length] ?? 'coral';
}

/** Parse an ISO date; a date-only string ("2026-08-23") is a LOCAL calendar day, not UTC midnight. */
export function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(iso);
}

/** Money with cents only when they matter: $450 / $64.20. */
export function formatMoneyAuto(value: number, options: FormatMoneyOptions = {}): string {
  return formatMoney(value, { ...options, wholeOnly: options.wholeOnly ?? Number.isInteger(value) });
}

/** Short, friendly date label: "Today", "Yesterday", else "Mon 12 May". */
export function formatDayLabel(isoDate: string, now: Date = new Date()): string {
  const d = parseIsoDate(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}
