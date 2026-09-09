import { todayIso } from '../lib/dates';
import type { Account, AccountTransfer } from '../features/accounts/types';
import { isAccount, isAccountTransfer } from '../features/accounts/store';
import type { Bill } from '../features/bills/types';
import { isBill } from '../features/bills/store';
import { isListItem } from '../features/lists/store';
import type { ListItem } from '../features/lists/types';
import { isIncomeSchedule } from '../features/paydays/store';
import type { IncomeSchedule } from '../features/paydays/types';
import { isQuickAdd } from '../features/quickadd/store';
import type { QuickAdd } from '../features/quickadd/types';
import { isSettlement } from '../features/settle/store';
import type { Settlement } from '../features/settle/types';
import { isRecord, isString, validRows } from './persist';
import { attributedAmount } from './split';
import { readPersistedHousehold, type HouseholdData, type PersistedHousehold } from './store';

// Backup files: everything on this device in one JSON document, so a phone
// can be restored (or the data moved to the PC) before the online backend
// exists. The household part is exactly the persisted blob, so a backup can be
// validated with the same guard the store uses on start-up.

/** The feature stores that live beside the household data. */
export interface FeatureData {
  bills: Bill[];
  settlements: Settlement[];
  paydays: IncomeSchedule[];
  lists: ListItem[];
  quickAdds: QuickAdd[];
  accounts: Account[];
  accountTransfers: AccountTransfer[];
}

export interface BackupFile extends FeatureData {
  app: 'budget-app';
  format: 1;
  exportedAt: string;
  household: PersistedHousehold;
}

export type FeatureKey = keyof FeatureData;
export const FEATURE_KEYS: readonly FeatureKey[] = ['bills', 'settlements', 'paydays', 'lists', 'quickAdds', 'accounts', 'accountTransfers'];
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  bills: 'bills',
  settlements: 'settle-up history',
  paydays: 'paydays',
  lists: 'lists',
  quickAdds: 'favourites',
  accounts: 'accounts & cards',
  accountTransfers: 'account transfers',
};

export interface BackupSummary {
  householdName: string;
  members: number;
  transactions: number;
  goals: number;
  bills: number;
  exportedAt: string;
  /** Feature stores this file does not carry (an older build's export): they stay as they are on the device. */
  missing: FeatureKey[];
}

export type ParsedBackup = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; reason: string };

export function buildBackup(data: HouseholdData, features: Partial<FeatureData> = {}, now: Date = new Date()): BackupFile {
  const exportedAt = now.toISOString();
  return {
    app: 'budget-app',
    format: 1,
    exportedAt,
    household: { version: 1, savedAt: exportedAt, ...data },
    bills: features.bills ?? [],
    settlements: features.settlements ?? [],
    paydays: features.paydays ?? [],
    lists: features.lists ?? [],
    quickAdds: features.quickAdds ?? [],
    accounts: features.accounts ?? [],
    accountTransfers: features.accountTransfers ?? [],
  };
}

export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "This file isn't valid JSON." };
  }
  if (!isRecord(parsed) || parsed.app !== 'budget-app') return { ok: false, reason: "This isn't a Budget App backup." };
  if (parsed.format !== 1) return { ok: false, reason: `This backup uses a newer format (${String(parsed.format)}). Update the app to import it.` };
  const household = readPersistedHousehold(parsed.household);
  if (!household) return { ok: false, reason: 'The household data in this backup is missing or damaged.' };
  // A key that is absent (or not even an array - an older build's export, or a damaged file)
  // must leave that store untouched on import, never wipe it. Only a real array replaces.
  const missing = FEATURE_KEYS.filter((k) => !Array.isArray(parsed[k]));
  const backup: BackupFile = {
    app: 'budget-app',
    format: 1,
    exportedAt: isString(parsed.exportedAt) ? parsed.exportedAt : household.savedAt,
    household,
    bills: validRows(parsed.bills, isBill),
    settlements: validRows(parsed.settlements, isSettlement),
    paydays: validRows(parsed.paydays, isIncomeSchedule),
    lists: validRows(parsed.lists, isListItem),
    quickAdds: validRows(parsed.quickAdds, isQuickAdd),
    accounts: validRows(parsed.accounts, isAccount),
    accountTransfers: validRows(parsed.accountTransfers, isAccountTransfer),
  };
  return {
    ok: true,
    backup,
    summary: {
      householdName: household.household.name,
      members: household.members.length,
      transactions: household.transactions.length,
      goals: household.goals.length,
      bills: backup.bills.length,
      exportedAt: backup.exportedAt,
      missing,
    },
  };
}
// ---- CSV ----

/** RFC 4180: wrap in quotes when the value contains a quote, comma or line break; double inner quotes. */
function csvCell(value: string | number | boolean | undefined): string {
  if (value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * User-entered text gets a leading apostrophe when it starts with a formula
 * trigger (= + - @, or a stray tab/CR), so a note like `=HYPERLINK(...)` opens
 * in Excel/Sheets as text instead of executing. Our own numbers stay signed.
 */
function csvText(value: string | undefined): string {
  if (!value) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Every transaction as a spreadsheet: one row each, newest first, amounts
 * signed exactly as stored (purchases negative). Starts with a BOM so Excel on
 * Windows reads the UTF-8 category emoji correctly. A member-scoped export
 * (`shareFor`) adds a `share` column - that member's part of each row - since
 * the full stored amounts would sum to neither their budget nor what they paid.
 * `accounts` resolves the account column ("what was it paid with"); rows with
 * no account, or without the list, leave it blank.
 */
export function transactionsToCsv(data: HouseholdData, opts: { shareFor?: string; accounts?: Array<Pick<Account, 'id' | 'name'>> } = {}): string {
  const categoryOf = (id: string) => data.categories.find((c) => c.id === id);
  const memberOf = (id: string) => data.members.find((m) => m.id === id);
  const accountOf = (id: string | undefined) => (id ? opts.accounts?.find((a) => a.id === id) : undefined);
  const shareFor = opts.shareFor;
  const header = ['date', 'title', 'amount', ...(shareFor ? ['share'] : []), 'kind', 'category', 'member', 'account', 'shared', 'recurring', 'pending', 'note'];
  const rows = [...data.transactions]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((t) =>
      [
        t.date,
        csvText(t.title),
        t.amount.toFixed(2),
        ...(shareFor ? [attributedAmount(t, shareFor, data.household, data.members).toFixed(2)] : []),
        t.amount < 0 ? 'expense' : 'income',
        csvText(categoryOf(t.categoryId)?.name),
        csvText(memberOf(t.memberId)?.name),
        csvText(accountOf(t.accountId)?.name),
        t.shared ? 'yes' : 'no',
        t.recurring ? 'yes' : 'no',
        t.pending ? 'yes' : 'no',
        csvText(t.note),
      ]
        .map(csvCell)
        .join(','),
    );
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}

export function backupFilename(kind: 'backup' | 'transactions', now: Date = new Date()): string {
  return `budget-app-${kind}-${todayIso(now)}.${kind === 'backup' ? 'json' : 'csv'}`;
}
