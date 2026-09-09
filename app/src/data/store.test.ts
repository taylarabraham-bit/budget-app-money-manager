import { describe, expect, it } from 'vitest';
import { HOUSEHOLD_ROW_GUARDS, readPersistedHousehold } from './store';
import { toCents } from './split';
import { PRIYA, SAM, category, contribution, goal, household, member, purchase } from '../test/fixtures';

// `readPersistedHousehold` is the door every untrusted blob comes through -
// localStorage on start-up, a backup file, and (via HOUSEHOLD_ROW_GUARDS) rows
// pulled from the server. It also enforces the goal invariant:
//
//  - QA SY-3: `goal.saved` as a stored last-write-wins scalar lost a whole
//    contribution when two phones deposited while one was offline. It is now
//    DERIVED from the append-only contributions ledger.
//  - QA DR-3: derived in floats, an exact-cent completion left
//    saved = 983.3499999999999 and the goal never read as reached.

const blob = (over: Record<string, unknown> = {}) => ({
  version: 1,
  savedAt: '2026-08-20T10:00:00.000Z',
  household: household(),
  members: [member(PRIYA), member(SAM)],
  categories: [category('groceries')],
  transactions: [purchase('t1', 30)],
  goals: [goal('g1')],
  goalContributions: [],
  ...over,
});

describe('readPersistedHousehold rejects what it cannot use', () => {
  it('rejects a non-object, the wrong version and a missing savedAt', () => {
    expect(readPersistedHousehold(null)).toBeNull();
    expect(readPersistedHousehold('{}')).toBeNull();
    expect(readPersistedHousehold(blob({ version: 2 }))).toBeNull();
    expect(readPersistedHousehold(blob({ savedAt: undefined }))).toBeNull();
  });

  it('rejects a damaged household record', () => {
    expect(readPersistedHousehold(blob({ household: { id: 'h', name: 'x' } }))).toBeNull();
    expect(readPersistedHousehold(blob({ household: { ...household(), dailyEarningTarget: 'lots' } }))).toBeNull();
  });

  it('rejects a household with no usable members', () => {
    expect(readPersistedHousehold(blob({ members: [] }))).toBeNull();
    expect(readPersistedHousehold(blob({ members: [{ id: 'm' }] }))).toBeNull();
  });
});

describe('readPersistedHousehold keeps what it can', () => {
  it('drops only the bad rows, never the whole store', () => {
    const parsed = readPersistedHousehold(blob({ transactions: [purchase('good', 10), { id: 'bad' }, null], categories: [category('c1'), 'nope'] }));
    expect(parsed!.transactions.map((t) => t.id)).toEqual(['good']);
    expect(parsed!.categories.map((c) => c.id)).toEqual(['c1']);
  });

  it('treats a non-array collection as empty rather than throwing', () => {
    const parsed = readPersistedHousehold(blob({ transactions: 'nope', goals: undefined }));
    expect(parsed!.transactions).toEqual([]);
    expect(parsed!.goals).toEqual([]);
  });
});

describe('goal.saved is derived from the contributions ledger', () => {
  it('overrides a stored total that disagrees with the ledger - QA SY-3', () => {
    // The stored scalar lost a contribution; the ledger has both.
    const parsed = readPersistedHousehold(
      blob({
        goals: [goal('g1', { target: 1000, saved: 200 })],
        goalContributions: [contribution('c1', 'g1', 200), contribution('c2', 'g1', 150, { memberId: SAM })],
      }),
    );
    expect(parsed!.goals[0]!.saved).toBe(350);
  });

  it('completes a goal reached to the exact cent - QA DR-3', () => {
    // 983.35 as a float sum of these three is 983.3499999999999.
    const parsed = readPersistedHousehold(
      blob({
        goals: [goal('g1', { target: 983.35, saved: 0 })],
        goalContributions: [contribution('c1', 'g1', 300.15), contribution('c2', 'g1', 341.6), contribution('c3', 'g1', 341.6)],
      }),
    );
    expect(toCents(parsed!.goals[0]!.saved)).toBe(98335);
    expect(parsed!.goals[0]!.status).toBe('completed');
  });

  it('leaves a goal short of its target active', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { target: 1000 })], goalContributions: [contribution('c1', 'g1', 999.99)] }));
    expect(parsed!.goals[0]!.status).toBe('active');
  });

  it('does not resurrect a paused goal that has passed its target', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { target: 100, status: 'paused' })], goalContributions: [contribution('c1', 'g1', 500)] }));
    expect(parsed!.goals[0]!.status).toBe('paused');
    expect(parsed!.goals[0]!.saved).toBe(500);
  });

  it('keeps the stored figure for a goal with no ledger rows - older data', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 425 })], goalContributions: [] }));
    expect(parsed!.goals[0]!.saved).toBe(425);
  });

  it('ignores contributions belonging to other goals', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 0 })], goalContributions: [contribution('c1', 'g_other', 500)] }));
    expect(parsed!.goals[0]!.saved).toBe(0);
  });

  it('drops a malformed contribution before it can distort the total', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 0 })], goalContributions: [contribution('c1', 'g1', 100), { id: 'c2', goalId: 'g1', amount: 'lots' }] }));
    expect(parsed!.goals[0]!.saved).toBe(100);
  });
});

describe('HOUSEHOLD_ROW_GUARDS', () => {
  it('covers every household collection sync can pull', () => {
    expect(Object.keys(HOUSEHOLD_ROW_GUARDS).sort()).toEqual(['categories', 'goalContributions', 'goals', 'household', 'members', 'transactions']);
  });

  it('accepts a good row and rejects a malformed one per collection - QA SY-5/SY-11', () => {
    expect(HOUSEHOLD_ROW_GUARDS.members(member(PRIYA))).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.members({ id: 'm', name: 'x' })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.transactions(purchase('t1', 10))).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.transactions({ ...purchase('t1', 10), needsApprovalFrom: {} })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.goals(goal('g1'))).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.goals({ ...goal('g1'), status: 'weird' })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.household(household())).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.household({ id: 'h' })).toBe(false);
  });

  it('rejects a transaction whose split is not a list of shares', () => {
    expect(HOUSEHOLD_ROW_GUARDS.transactions({ ...purchase('t1', 10), split: [{ memberId: PRIYA }] })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.transactions({ ...purchase('t1', 10), split: [{ memberId: PRIYA, amount: 5 }] })).toBe(true);
  });
});

describe('a pre-ledger goal gets an opening contribution at adoption', () => {
  it('synthesises a deterministic opening row so the total can never be wiped', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 425 })], goalContributions: [] }))!;
    expect(parsed.goalContributions).toHaveLength(1);
    expect(parsed.goalContributions[0]).toMatchObject({ id: 'gc_opening_g1', goalId: 'g1', amount: 425 });
    expect(parsed.goals[0]!.saved).toBe(425);
  });

  it('the first real contribution now ADDS instead of replacing the remembered total', () => {
    const first = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 425 })], goalContributions: [] }))!;
    const again = readPersistedHousehold(blob({ goals: first.goals, goalContributions: [...first.goalContributions, contribution('c_new', 'g1', 10)] }))!;
    expect(again.goals[0]!.saved).toBe(435);
  });

  it('is idempotent - reading its own output adds nothing', () => {
    const once = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 425 })], goalContributions: [] }))!;
    const twice = readPersistedHousehold(blob({ goals: once.goals, goalContributions: once.goalContributions }))!;
    expect(twice.goalContributions).toHaveLength(1);
  });

  it('a goal with nothing saved gets no opening row', () => {
    const parsed = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 0 })], goalContributions: [] }))!;
    expect(parsed.goalContributions).toHaveLength(0);
  });
});

describe('the opening rows a read synthesised are reported to sync (audit SY-8)', () => {
  it('names the synthesised ids, and none when the ledger already had them', () => {
    const first = readPersistedHousehold(blob({ goals: [goal('g1', { saved: 425 })], goalContributions: [] }))!;
    expect(first.syntheticContributionIds).toEqual(['gc_opening_g1']);
    const again = readPersistedHousehold(blob({ goals: first.goals, goalContributions: first.goalContributions }))!;
    expect(again.syntheticContributionIds).toBeUndefined();
  });
});

describe('one row per id at the door (audit SEC-4)', () => {
  it('keeps the first of two rows sharing an id in every collection', () => {
    const parsed = readPersistedHousehold(
      blob({
        members: [member(PRIYA), member(PRIYA, { name: 'Twin' }), member(SAM)],
        transactions: [purchase('t1', 10), purchase('t1', 99)],
        goals: [goal('g1'), goal('g1', { name: 'Again' })],
        categories: [category('c1'), category('c1', { name: 'Again' })],
      }),
    )!;
    expect(parsed.members.map((m) => m.id)).toEqual([PRIYA, SAM]);
    expect(parsed.transactions.map((t) => t.amount)).toEqual([-10]);
    expect(parsed.goals).toHaveLength(1);
    expect(parsed.categories).toHaveLength(1);
  });
});

describe('ids follow one rule everywhere (audit SEC-5)', () => {
  it('drops a row whose own id or foreign key could not have come from newId()', () => {
    expect(HOUSEHOLD_ROW_GUARDS.transactions(purchase('../etc/passwd', 10))).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.transactions(purchase('t"1', 10))).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.transactions({ ...purchase('t1', 10), memberId: 'm 1' })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.transactions({ ...purchase('t1', 10), accountId: '' })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.members({ ...member(PRIYA), id: 'x'.repeat(65) })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.goals({ ...goal('g1'), contributorIds: ['ok', 'not ok'] })).toBe(false);
    // What newId emits, the sample's ids and uuid-shaped ids all pass.
    expect(HOUSEHOLD_ROW_GUARDS.transactions(purchase('t_mf0a1b2c_x9y8z7', 10))).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.transactions(purchase('t_3f2504e0-4f89-11d3-9a0c-0305e82c3301', 10))).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.members(member('m_priya'))).toBe(true);
  });
});

describe('isHousehold validates defaultSplit at the sync door', () => {
  it('rejects an Infinity ratio share before it can NaN the allocator', () => {
    expect(HOUSEHOLD_ROW_GUARDS.household({ ...household(), defaultSplit: { mode: 'ratio', shares: { m_priya: Infinity, m_sam: 1 } } })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.household({ ...household(), defaultSplit: { mode: 'ratio', shares: { m_priya: 2, m_sam: 1 } } })).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.household({ ...household(), defaultSplit: { mode: 'equal' } })).toBe(true);
    expect(HOUSEHOLD_ROW_GUARDS.household({ ...household(), defaultSplit: { mode: 'weird' } })).toBe(false);
    expect(HOUSEHOLD_ROW_GUARDS.household({ ...household(), defaultSplit: { mode: 'ratio', shares: { m_priya: 'lots' } } })).toBe(false);
  });
});
