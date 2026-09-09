import { describe, expect, it } from 'vitest';
import { OCCURRENCES_PER_MONTH, addFrequency, dayOfMonth, isMonthBased, occurrencesBetween, occurrencesWithin } from './frequency';

// Recurrence is where two real bugs lived, and both are cheap to reintroduce:
//
//  - QA H5: a monthly schedule stored the CLAMPED date as its new anchor, so
//    rent due on the 31st walked to the 30th, then the 28th, permanently.
//  - QA MF-2: an amount-only edit re-derived the anchor from the clamped date,
//    undoing the H5 fix on every routine edit.
//
// The anchor rule is the fix: month-based steps aim at `anchorDay`, clamp only
// for the month they land in, and never let the clamp become the new anchor.

describe('addFrequency', () => {
  it('steps weekly and fortnightly by days, across a month boundary', () => {
    expect(addFrequency('2026-08-28', 'weekly')).toBe('2026-09-04');
    expect(addFrequency('2026-08-28', 'fortnightly')).toBe('2026-09-11');
  });

  it('steps monthly, quarterly and yearly', () => {
    expect(addFrequency('2026-08-15', 'monthly')).toBe('2026-09-15');
    expect(addFrequency('2026-08-15', 'quarterly')).toBe('2026-11-15');
    expect(addFrequency('2026-08-15', 'yearly')).toBe('2027-08-15');
  });

  it('clamps into a shorter month', () => {
    expect(addFrequency('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addFrequency('2026-08-31', 'monthly')).toBe('2026-09-30');
  });

  it('comes back to the anchor after a clamp - the H5 rule', () => {
    // Feb 28 with an anchor of 31 must return to Mar 31, not stay on the 28th.
    expect(addFrequency('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(addFrequency('2026-09-30', 'monthly', 31)).toBe('2026-10-31');
  });

  it('drifts without an anchor - which is exactly why callers must pass one', () => {
    expect(addFrequency('2026-02-28', 'monthly')).toBe('2026-03-28');
  });

  it('handles a leap February', () => {
    expect(addFrequency('2028-01-31', 'monthly', 31)).toBe('2028-02-29');
    expect(addFrequency('2028-02-29', 'monthly', 31)).toBe('2028-03-31');
  });

  it('keeps a 31st schedule on the 31st across a whole year', () => {
    const anchor = 31;
    let date = '2026-01-31';
    const days: number[] = [];
    for (let i = 0; i < 12; i++) {
      date = addFrequency(date, 'monthly', anchor);
      days.push(dayOfMonth(date));
    }
    // Every month gets its own last day; the long months are back on the 31st.
    expect(days).toEqual([28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31]);
  });
});

// nextOccurrenceAfter (catch-up past every missed period in one call) was
// removed with its last callers - markPaid/markReceived advance ONE
// addFrequency step per tap (product decision: option B, 2026-08-29), which makes the
// old M5 boundary ("paying late must never skip a charge") hold by
// construction: the progression no longer looks at the payment date at all.

describe('occurrencesBetween', () => {
  it('lists every occurrence inside the window, inclusive at both ends', () => {
    expect(occurrencesBetween('2026-08-03', 'weekly', '2026-08-01', '2026-08-31')).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('counts a weekly bill twice in a fortnight - the MF-1 case', () => {
    // Cash flow used to count each bill once per window; a weekly bill due
    // twice before payday must be paid twice.
    expect(occurrencesBetween('2026-08-20', 'weekly', '2026-08-18', '2026-08-31')).toHaveLength(2);
  });

  it('skips occurrences before the window but keeps stepping', () => {
    expect(occurrencesBetween('2026-08-01', 'weekly', '2026-08-15', '2026-08-31')).toEqual(['2026-08-15', '2026-08-22', '2026-08-29']);
  });

  it('is empty when the first occurrence is past the window', () => {
    expect(occurrencesBetween('2026-09-10', 'monthly', '2026-08-01', '2026-08-31')).toEqual([]);
  });

  it('respects the anchor when expanding across a short month', () => {
    expect(occurrencesBetween('2026-01-31', 'monthly', '2026-01-01', '2026-04-30', { anchorDay: 31 })).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('stops at the cap rather than looping forever', () => {
    expect(occurrencesBetween('2026-01-01', 'weekly', '2026-01-01', '2030-01-01', { cap: 5 })).toHaveLength(5);
  });
});

describe('OCCURRENCES_PER_MONTH', () => {
  it('averages a year over twelve months', () => {
    expect(OCCURRENCES_PER_MONTH.weekly * 12).toBeCloseTo(52, 10);
    expect(OCCURRENCES_PER_MONTH.fortnightly * 12).toBeCloseTo(26, 10);
    expect(OCCURRENCES_PER_MONTH.monthly).toBe(1);
    expect(OCCURRENCES_PER_MONTH.quarterly * 12).toBeCloseTo(4, 10);
    expect(OCCURRENCES_PER_MONTH.yearly * 12).toBeCloseTo(1, 10);
  });
});

describe('dayOfMonth', () => {
  it('reads a local calendar day, never shifted by a timezone', () => {
    expect(dayOfMonth('2026-01-31')).toBe(31);
    expect(dayOfMonth('2026-01-01')).toBe(1);
  });
});

describe('occurrencesBetween reaches a late window', () => {
  it('a long-stale weekly schedule still yields the occurrences inside the window', () => {
    // 65 weeks stale: the skipped pre-window steps must not eat the emit cap.
    expect(occurrencesBetween('2025-05-22', 'weekly', '2026-08-20', '2026-08-27')).toEqual(['2026-08-20', '2026-08-27']);
  });

  it('still caps what it emits', () => {
    expect(occurrencesBetween('2026-01-01', 'weekly', '2026-01-01', '2036-01-01')).toHaveLength(60);
  });
});

describe('occurrencesWithin says when the cap bit (audit MON-7)', () => {
  it('a weekly bill 66 periods behind: 60 dates and truncated, so surfaces can say 60+', () => {
    const o = occurrencesWithin('2025-05-22', 'weekly', '2025-05-22', '2026-08-20');
    expect(o.dates).toHaveLength(60);
    expect(o.truncated).toBe(true);
  });

  it('is not truncated when the window runs out first', () => {
    const o = occurrencesWithin('2026-08-03', 'weekly', '2026-08-01', '2026-08-31');
    expect(o.dates).toHaveLength(5);
    expect(o.truncated).toBe(false);
  });

  it('exactly at the cap with nothing left in the window is not truncated', () => {
    // The 60th weekly date from Jan 1 2026 is Feb 18 2027; the window ends there.
    const o = occurrencesWithin('2026-01-01', 'weekly', '2026-01-01', '2027-02-18');
    expect(o.dates).toHaveLength(60);
    expect(o.truncated).toBe(false);
  });

  it('occurrencesBetween is the same expansion without the flag', () => {
    expect(occurrencesBetween('2025-05-22', 'weekly', '2025-05-22', '2026-08-20')).toEqual(occurrencesWithin('2025-05-22', 'weekly', '2025-05-22', '2026-08-20').dates);
  });
});

describe('a malformed start yields nothing (audit MON-2)', () => {
  it('empty, unpadded and nonsense dates emit no occurrences instead of the whole cap', () => {
    expect(occurrencesBetween('', 'monthly', '2026-08-01', '2026-08-31')).toEqual([]);
    expect(occurrencesBetween('', 'weekly', '', '2026-08-31')).toEqual([]);
    expect(occurrencesBetween('2026-8-25', 'monthly', '2026-08-01', '2026-08-31')).toEqual([]);
    expect(occurrencesWithin('nonsense', 'weekly', '2026-08-01', '2026-08-31')).toEqual({ dates: [], truncated: false });
  });
});

describe('isMonthBased', () => {
  it('is true for the calendar-month steps only', () => {
    expect(isMonthBased('monthly')).toBe(true);
    expect(isMonthBased('quarterly')).toBe(true);
    expect(isMonthBased('yearly')).toBe(true);
    expect(isMonthBased('weekly')).toBe(false);
    expect(isMonthBased('fortnightly')).toBe(false);
  });
});

describe('addFrequency survives a malformed anchor', () => {
  it('anchor 0 clamps to day 1 and the step always advances', () => {
    expect(addFrequency('2026-08-15', 'monthly', 0)).toBe('2026-09-01');
    // Unclamped, day 0 resolved to the last day of the SAME month - a fixed point.
    expect(addFrequency('2026-08-31', 'monthly', 0) > '2026-08-31').toBe(true);
  });
});
