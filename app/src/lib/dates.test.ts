import { describe, expect, it } from 'vitest';
import { clampToNow, combineDateTime, dateOnly, daysFromNow, daysLeftInMonth, daysUntil, firstOfNextMonth, isValidIsoDate, monthKeyOf, nowIsoDateTime, startOfDay, toHhmm, toIsoDate, toIsoDateTime, todayIso } from './dates';

// Dates the user picks are LOCAL calendar days stored as "YYYY-MM-DD". The
// whole app depends on that never drifting through UTC: a bill due on the 1st
// must not read as the 31st for anyone west of Greenwich.

const NOON = new Date(2026, 7, 20, 12, 0, 0); // Thu 20 Aug 2026

describe('toIsoDate', () => {
  it('formats local date components, zero-padded', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('does not shift near midnight in either direction', () => {
    expect(toIsoDate(new Date(2026, 7, 20, 0, 0, 0))).toBe('2026-08-20');
    expect(toIsoDate(new Date(2026, 7, 20, 23, 59, 59))).toBe('2026-08-20');
  });
});

describe('todayIso and daysFromNow', () => {
  it('reads today as a local calendar day', () => {
    expect(todayIso(NOON)).toBe('2026-08-20');
  });

  it('steps forward and back across month and year boundaries', () => {
    expect(daysFromNow(1, NOON)).toBe('2026-08-21');
    expect(daysFromNow(-1, NOON)).toBe('2026-08-19');
    expect(daysFromNow(12, NOON)).toBe('2026-09-01');
    expect(daysFromNow(134, NOON)).toBe('2027-01-01');
  });
});

describe('firstOfNextMonth', () => {
  it('is the 1st of the following month', () => {
    expect(firstOfNextMonth(NOON)).toBe('2026-09-01');
  });

  it('rolls December into January', () => {
    expect(firstOfNextMonth(new Date(2026, 11, 15))).toBe('2027-01-01');
  });

  it('is next month even from the 31st or from a 1st', () => {
    expect(firstOfNextMonth(new Date(2026, 0, 31))).toBe('2026-02-01');
    expect(firstOfNextMonth(new Date(2026, 8, 1))).toBe('2026-10-01');
  });
});

describe('isValidIsoDate', () => {
  it('accepts a real calendar day', () => {
    expect(isValidIsoDate('2026-08-20')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects the wrong shape', () => {
    expect(isValidIsoDate('20-08-2026')).toBe(false);
    expect(isValidIsoDate('2026-8-20')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('rejects a day that does not exist', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2027-02-29')).toBe(false); // not a leap year
  });
});

describe('daysUntil', () => {
  it('is zero today, positive ahead, negative behind', () => {
    expect(daysUntil('2026-08-20', NOON)).toBe(0);
    expect(daysUntil('2026-08-21', NOON)).toBe(1);
    expect(daysUntil('2026-08-17', NOON)).toBe(-3);
  });

  it('counts whole days regardless of the time of day', () => {
    expect(daysUntil('2026-08-21', new Date(2026, 7, 20, 23, 59))).toBe(1);
    expect(daysUntil('2026-08-21', new Date(2026, 7, 20, 0, 1))).toBe(1);
  });

  it('counts across a month boundary', () => {
    expect(daysUntil('2026-09-01', NOON)).toBe(12);
  });
});

describe('daysLeftInMonth', () => {
  it('counts today as one of them', () => {
    expect(daysLeftInMonth(new Date(2026, 7, 31, 12, 0))).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 7, 20, 12, 0))).toBe(12);
    expect(daysLeftInMonth(new Date(2026, 7, 1, 12, 0))).toBe(31);
  });

  it('never returns zero', () => {
    expect(daysLeftInMonth(new Date(2026, 1, 28, 23, 59))).toBeGreaterThanOrEqual(1);
  });
});

describe('startOfDay', () => {
  it('drops the time and keeps the local day', () => {
    expect(toIsoDateTime(startOfDay(NOON))).toBe('2026-08-20T00:00:00');
  });
});

describe('date-times', () => {
  it('formats to the minute, local', () => {
    expect(toIsoDateTime(new Date(2026, 7, 20, 17, 5))).toBe('2026-08-20T17:05:00');
    expect(nowIsoDateTime(new Date(2026, 7, 20, 9, 0))).toBe('2026-08-20T09:00:00');
  });

  it('combines a picked day with a time, defaulting to noon', () => {
    expect(combineDateTime('2026-08-21', '19:30')).toBe('2026-08-21T19:30:00');
    expect(combineDateTime('2026-08-21')).toBe('2026-08-21T12:00:00');
  });

  it('falls back to noon for a malformed time rather than writing a broken stamp', () => {
    expect(combineDateTime('2026-08-21', '7pm')).toBe('2026-08-21T12:00:00');
    expect(combineDateTime('2026-08-21', '')).toBe('2026-08-21T12:00:00');
  });

  it('reads a time back out of a Date', () => {
    expect(toHhmm(new Date(2026, 7, 20, 9, 5))).toBe('09:05');
  });
});

describe('clampToNow', () => {
  it('pulls a future stamp back to now', () => {
    expect(clampToNow('2026-12-25T10:00:00', NOON)).toBe('2026-08-20T12:00:00');
  });

  it('leaves a past or present stamp alone', () => {
    expect(clampToNow('2026-08-01T08:00:00', NOON)).toBe('2026-08-01T08:00:00');
    expect(clampToNow('2026-08-20T12:00:00', NOON)).toBe('2026-08-20T12:00:00');
  });
});

describe('monthKeyOf and dateOnly', () => {
  it('slices a month key and a day out of either shape', () => {
    expect(monthKeyOf('2026-08-20T17:05:00')).toBe('2026-08');
    expect(monthKeyOf('2026-08-20')).toBe('2026-08');
    expect(dateOnly('2026-08-20T17:05:00')).toBe('2026-08-20');
    expect(dateOnly('2026-08-20')).toBe('2026-08-20');
  });
});
