import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, backupFilename, buildBackup, parseBackup, transactionsToCsv } from './backup';
import type { HouseholdData } from './store';
import { PRIYA, SAM, bill, category, contribution, goal, household, income, member, purchase } from '../test/fixtures';

// Import is the app's only "trust a whole file" path, and it produced two of
// the worst bugs found:
//
//  - QA H3: only top-level scalars were validated, so a malformed optional
//    field passed the confirm dialog and then white-screened a render.
//  - QA H4: a backup from an older build (same format number, missing feature
//    keys) imported cleanly and wiped bills, settlements, paydays and lists.
//
// CSV had its own: QA M2, formula injection through user-entered text.

const data = (): HouseholdData => ({
  household: household(),
  members: [member(PRIYA), member(SAM)],
  categories: [category('groceries', { name: 'Groceries', icon: '🛒' })],
  transactions: [purchase('t1', 30, { title: 'Milk' })],
  goals: [goal('g1')],
  goalContributions: [contribution('c1', 'g1', 100)],
});

const roundTrip = (over: Record<string, unknown> = {}) => JSON.stringify({ ...buildBackup(data(), { bills: [bill('b1')] }), ...over });

describe('buildBackup', () => {
  it('writes the app marker, format and every feature key', () => {
    const file = buildBackup(data(), {}, new Date('2026-08-20T10:00:00Z'));
    expect(file.app).toBe('budget-app');
    expect(file.format).toBe(1);
    expect(file.exportedAt).toBe('2026-08-20T10:00:00.000Z');
    for (const key of FEATURE_KEYS) expect(Array.isArray(file[key])).toBe(true);
  });

  it('nests the household as the persisted blob, so import can reuse the store guard', () => {
    const file = buildBackup(data());
    expect(file.household.version).toBe(1);
    expect(file.household.members).toHaveLength(2);
  });
});

describe('parseBackup rejects what it cannot use', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('not json at all')).toMatchObject({ ok: false });
  });

  it('rejects a JSON file from something else', () => {
    expect(parseBackup(JSON.stringify({ hello: 'world' }))).toMatchObject({ ok: false, reason: expect.stringContaining("isn't a Budget App backup") });
  });

  it('rejects a newer format and says so', () => {
    expect(parseBackup(roundTrip({ format: 2 }))).toMatchObject({ ok: false, reason: expect.stringContaining('newer format') });
  });

  it('rejects a file whose household is missing or damaged', () => {
    expect(parseBackup(roundTrip({ household: undefined }))).toMatchObject({ ok: false });
    expect(parseBackup(roundTrip({ household: { version: 1, savedAt: 'x', household: { id: 'h' } } }))).toMatchObject({ ok: false });
  });

  it('rejects a household with no members - nobody could log a purchase', () => {
    const file = JSON.parse(roundTrip());
    file.household.members = [];
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false });
  });
});

describe('parseBackup hardens the rows it accepts', () => {
  it('drops a transaction with a malformed optional field, keeping the rest - QA H3', () => {
    const file = JSON.parse(roundTrip());
    // `needsApprovalFrom: {}` used to pass validation and then crash `.includes`.
    file.household.transactions = [{ ...purchase('t1', 10), needsApprovalFrom: {} }, purchase('t2', 20)];
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.household.transactions.map((t) => t.id)).toEqual(['t2']);
  });

  it('drops a transaction with a malformed disputed block', () => {
    const file = JSON.parse(roundTrip());
    file.household.transactions = [{ ...purchase('t1', 10), disputed: { byMemberId: 5 } }];
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok && result.backup.household.transactions).toEqual([]);
  });

  it('drops a bill that is not a bill, keeping the valid ones', () => {
    const file = JSON.parse(roundTrip());
    file.bills = [bill('b1'), { id: 'b2' }, null, 'nope'];
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok && result.backup.bills.map((b) => b.id)).toEqual(['b1']);
  });

  it('reports feature stores the file does not carry rather than importing them empty - QA H4', () => {
    const file = JSON.parse(roundTrip());
    delete file.settlements;
    delete file.paydays;
    file.lists = 'not an array';
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.missing.sort()).toEqual(['lists', 'paydays', 'settlements']);
    // `bills` was present, so it is not reported missing.
    expect(result.summary.missing).not.toContain('bills');
  });

  it('summarises what the caller is about to replace', () => {
    const result = parseBackup(roundTrip());
    expect(result.ok && result.summary).toMatchObject({ householdName: 'Test household', members: 2, transactions: 1, goals: 1, bills: 1, missing: [] });
  });

  it('falls back to the household savedAt when exportedAt is missing', () => {
    const file = JSON.parse(roundTrip());
    delete file.exportedAt;
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok && result.backup.exportedAt).toBe(file.household.savedAt);
  });

  it('round-trips a backup it built itself', () => {
    const result = parseBackup(roundTrip());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.household.transactions).toHaveLength(1);
    expect(result.backup.bills).toHaveLength(1);
  });
});

describe('transactionsToCsv', () => {
  const csv = (over: Partial<HouseholdData> = {}, opts?: Parameters<typeof transactionsToCsv>[1]) => transactionsToCsv({ ...data(), ...over }, opts);
  const lines = (text: string) => text.replace(/^﻿/, '').trimEnd().split('\r\n');

  it('starts with a BOM and CRLF rows, so Excel on Windows reads the emoji', () => {
    const text = csv();
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('\r\n');
  });

  it('writes the documented header', () => {
    expect(lines(csv())[0]).toBe('date,title,amount,kind,category,member,account,shared,recurring,pending,note');
  });

  it('resolves the account column from the given accounts; unknown or untracked stays blank', () => {
    const rows = lines(
      csv(
        { transactions: [purchase('t1', 30, { title: 'Milk', accountId: 'a1' }), purchase('t2', 5, { title: 'Gum', accountId: 'a_gone' }), purchase('t3', 7, { title: 'Tape' })] },
        { accounts: [{ id: 'a1', name: 'Joint Everyday Account' }] },
      ),
    );
    expect(rows[1]).toContain('Joint Everyday Account');
    expect(rows[2]).not.toContain('a_gone'); // a removed account's id never leaks into the sheet
  });

  it('adds a share column only when scoped to a member', () => {
    expect(lines(csv({}, { shareFor: PRIYA }))[0]).toContain('date,title,amount,share,kind');
  });

  it('signs amounts as stored and labels the kind', () => {
    const rows = lines(csv({ transactions: [purchase('t1', 30, { title: 'Milk' }), income('t2', 500, { title: 'Pay', date: '2026-08-16T12:00:00' })] }));
    expect(rows[1]).toContain('Pay,500.00,income'); // newest first
    expect(rows[2]).toContain('Milk,-30.00,expense');
  });

  it('sorts newest first', () => {
    const rows = lines(csv({ transactions: [purchase('old', 1, { title: 'Old', date: '2026-08-01T12:00:00' }), purchase('new', 1, { title: 'New', date: '2026-08-20T12:00:00' })] }));
    expect(rows[1]).toContain('New');
    expect(rows[2]).toContain('Old');
  });

  it('quotes and escapes commas, quotes and newlines - RFC 4180', () => {
    const rows = lines(csv({ transactions: [purchase('t1', 5, { title: 'Milk, bread', note: 'said "cheap"' })] }));
    expect(rows[1]).toContain('"Milk, bread"');
    expect(rows[1]).toContain('"said ""cheap"""');
  });

  it('neutralises a formula in user text - QA M2', () => {
    const rows = lines(csv({ transactions: [purchase('t1', 5, { title: '=HYPERLINK("http://evil","click")', note: '+1+1' })] }));
    expect(rows[1]).toContain("'=HYPERLINK");
    expect(rows[1]).toContain("'+1+1");
  });

  it('leaves our own negative numbers signed, not quoted as text', () => {
    const rows = lines(csv({ transactions: [purchase('t1', 30)] }));
    expect(rows[1]).toContain(',-30.00,');
    expect(rows[1]).not.toContain("'-30.00");
  });

  it('writes the member share of a shared purchase in the share column - QA L10', () => {
    const rows = lines(csv({ transactions: [purchase('t1', 30, { shared: true, memberId: SAM })] }, { shareFor: PRIYA }));
    expect(rows[1]).toContain('-30.00,-15.00');
  });

  it('leaves the share blank-safe at 0.00 for a purchase the member has no part in', () => {
    const rows = lines(csv({ transactions: [purchase('t1', 30, { memberId: SAM })] }, { shareFor: PRIYA }));
    expect(rows[1]).toContain('-30.00,0.00');
  });

  it('emits a header-only document when nothing was logged', () => {
    expect(lines(csv({ transactions: [] }))).toHaveLength(1);
  });
});

describe('backupFilename', () => {
  it('names the file by kind and local date', () => {
    const now = new Date(2026, 7, 20, 9, 0);
    expect(backupFilename('backup', now)).toBe('budget-app-backup-2026-08-20.json');
    expect(backupFilename('transactions', now)).toBe('budget-app-transactions-2026-08-20.csv');
  });
});
