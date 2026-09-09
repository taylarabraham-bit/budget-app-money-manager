// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StatCard } from './StatCard';

// The change pill under a stat. A change of 0.04% rendered "+0%" with a green
// arrow, and an exact 0 was classed "good" because good = change >= 0 was
// tested before flat (audit MF-14). A change that prints as zero is flat.

afterEach(cleanup);

const pill = (change: number, direction: 'earn' | 'spend' = 'earn') => {
  const { container } = render(<StatCard label="Spent" value={100} change={change} direction={direction} />);
  const el = container.querySelector('.bdg-stat__change')!;
  const tone = [...el.classList].find((c) => /--(good|bad|flat)$/.test(c))!.replace('bdg-stat__change--', '');
  return { text: el.textContent, tone, arrow: el.querySelector('path')!.getAttribute('d') };
};

describe('the change pill', () => {
  it('is flat, unsigned and level-arrowed for a change that prints as zero', () => {
    expect(pill(0.0004)).toEqual({ text: '0%', tone: 'flat', arrow: 'M2.5 6h7' });
    cleanup();
    expect(pill(-0.0004)).toEqual({ text: '0%', tone: 'flat', arrow: 'M2.5 6h7' });
  });

  it('is flat for an exact zero rather than "good"', () => {
    expect(pill(0).tone).toBe('flat');
    expect(pill(0).text).toBe('0%');
  });

  it('signs and colours a real change', () => {
    expect(pill(0.12)).toMatchObject({ text: '+12%', tone: 'good' });
    cleanup();
    expect(pill(-0.125)).toMatchObject({ text: '-12.5%', tone: 'bad' });
  });

  it('inverts good and bad for spend', () => {
    expect(pill(0.12, 'spend').tone).toBe('bad');
    cleanup();
    expect(pill(-0.12, 'spend').tone).toBe('good');
  });
});
