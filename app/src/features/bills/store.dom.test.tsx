// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { bill } from '../../test/fixtures';
import { BillsProvider, useBills, type BillsStore, type PaidResult } from './store';

// The multi-tap catch-up chain through the REAL provider: three payments on a
// month-end monthly bill settle three distinct occurrences with the anchor
// preserved through the clamped months. Also pins QA7 B-4: two markPaid calls
// in one React batch must settle two occurrences, not the same one twice
// (the ref used to advance only after the batch flushed).

afterEach(cleanup);

function mount() {
  const box: { store?: BillsStore } = {};
  function Capture() {
    box.store = useBills();
    return null;
  }
  render(
    <BillsProvider persist={false}>
      <Capture />
    </BillsProvider>,
  );
  const store = () => box.store!;
  act(() => {
    store().replaceAll([bill('b1', { name: 'Rent', amount: 100, frequency: 'monthly', nextDue: '2026-05-31', anchorDay: 31 })]);
  });
  return store;
}

describe('markPaid, one occurrence per tap', () => {
  it('three taps settle May 31, Jun 30, Jul 31 and keep the 31st anchor', () => {
    const store = mount();
    const dues: string[] = [];
    for (let i = 0; i < 3; i++) {
      act(() => {
        dues.push(store().markPaid('b1')!.paidDue);
      });
    }
    expect(dues).toEqual(['2026-05-31', '2026-06-30', '2026-07-31']);
    const b = store().bills.find((x) => x.id === 'b1')!;
    expect(b.nextDue).toBe('2026-08-31');
    expect(b.anchorDay).toBe(31);
  });

  it('two calls in ONE batch settle two different occurrences (QA7 B-4)', () => {
    const store = mount();
    let first: PaidResult | null = null;
    let second: PaidResult | null = null;
    act(() => {
      first = store().markPaid('b1');
      second = store().markPaid('b1');
    });
    expect(first!.paidDue).toBe('2026-05-31');
    expect(second!.paidDue).toBe('2026-06-30');
    expect(store().bills.find((x) => x.id === 'b1')!.nextDue).toBe('2026-07-31');
  });
});
