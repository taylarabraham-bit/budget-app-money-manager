import { transactionsToCsv } from '../../data/backup';
import { touches } from '../../data/split';
import type { HouseholdState } from '../../data/store';
import type { HouseholdMember } from '../../data/types';
import type { Account } from '../accounts';
import { monthBounds } from './months';

/** The month's transactions as CSV (same columns as the full export), optionally narrowed to one member's budget. */
export function buildMonthCsv(state: HouseholdState, month: string, memberId: string | null, now: Date = new Date(), accounts: Array<Pick<Account, 'id' | 'name'>> = []): string {
  const bounds = monthBounds(month, now);
  const transactions = state.transactions.filter((t) => bounds.inMonth(t) && (!memberId || touches(t, memberId, state.household, state.members)));
  return transactionsToCsv({ household: state.household, members: state.members, categories: state.categories, transactions, goals: state.goals, goalContributions: state.goalContributions }, { shareFor: memberId ?? undefined, accounts });
}

/** "budget-2026-08.csv" / "budget-2026-08-sam.csv". */
export function csvFilename(month: string, scope?: HouseholdMember | null): string {
  const who = scope ? `-${scope.name.trim().split(/\s+/)[0]!.toLowerCase().replace(/[^a-z0-9]+/g, '')}` : '';
  return `budget-${month}${who}.csv`;
}
