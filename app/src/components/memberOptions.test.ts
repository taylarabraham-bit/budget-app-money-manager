import { describe, expect, it } from 'vitest';
import { PRIYA, SAM, member } from '../test/fixtures';
import { memberOptionsFor } from './memberOptions';

// A native <select> whose value matches no option shows its FIRST option while
// the form keeps (and re-saves) the ghost id - so a removed member must stay a
// visible, labelled option (audit UX-5).

const members = [member(PRIYA), member(SAM)];

describe('memberOptionsFor', () => {
  it('lists the members as they are when the current id is one of them', () => {
    expect(memberOptionsFor(members, SAM)).toEqual([
      { value: PRIYA, label: 'Priya Natarajan' },
      { value: SAM, label: 'Sam Okafor' },
    ]);
  });

  it('appends a "since removed" entry for an id no member has any more', () => {
    const options = memberOptionsFor(members, 'm_gone');
    expect(options).toHaveLength(3);
    expect(options[2]).toEqual({ value: 'm_gone', label: 'A member since removed' });
  });

  it('adds nothing for an empty or absent id (a new form, or "Joint")', () => {
    expect(memberOptionsFor(members, '')).toHaveLength(2);
    expect(memberOptionsFor(members, undefined)).toHaveLength(2);
    expect(memberOptionsFor(members, null)).toHaveLength(2);
  });
});
