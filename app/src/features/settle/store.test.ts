import { describe, expect, it } from 'vitest';
import { newId } from '../../lib/ids';
import { PRIYA, SAM, settlement } from '../../test/fixtures';
import { sampleSettlements } from './mock';
import { isSettlement } from './store';

// The settle-up guard is a sync and backup door: its own id and both member
// ids follow the one shared rule (audit SEC-5).

describe('isSettlement applies the shared id rule', () => {
  it('accepts fixture, generated and sample rows', () => {
    expect(isSettlement(settlement('s1', PRIYA, SAM, 40))).toBe(true);
    expect(isSettlement(settlement(newId('s'), PRIYA, SAM, 40))).toBe(true);
    for (const row of sampleSettlements()) expect(isSettlement(row)).toBe(true);
  });

  const cases: Array<[string, unknown]> = [
    ['id', 's/../1'],
    ['id', ''],
    ['id', 'x'.repeat(65)],
    ['id', 's"1'],
    ['fromMemberId', 'm priya'],
    ['toMemberId', 3],
    ['toMemberId', undefined],
  ];
  it.each(cases)('drops a row whose %s is %j', (field, value) => {
    expect(isSettlement({ ...settlement('s1', PRIYA, SAM, 40), [field]: value })).toBe(false);
  });
});
