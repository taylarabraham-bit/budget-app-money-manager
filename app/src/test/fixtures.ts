import type { Account, AccountTransfer } from '../features/accounts/types';
import type { Bill } from '../features/bills/types';
import type { IncomeSchedule } from '../features/paydays/types';
import type { Settlement } from '../features/settle/types';
import type { HouseholdState } from '../data/store';
import type { Category, Goal, GoalContribution, Household, HouseholdMember, TransactionRecord } from '../data/types';

// Builders for the test suites. Every field has a boring default so a test
// states only what it is actually about - a purchase test should not have to
// invent a household currency.
//
// Test-only: nothing outside `*.test.ts` imports this, so it never ships.

export const PRIYA = 'm_priya';
export const SAM = 'm_sam';
export const ALEX = 'm_alex';

export function member(id: string, over: Partial<HouseholdMember> = {}): HouseholdMember {
  return { id, name: id === PRIYA ? 'Priya Natarajan' : id === SAM ? 'Sam Okafor' : 'Alex Reid', color: 'coral', role: 'Partner', monthlyLimit: 2000, ...over };
}

export function household(over: Partial<Household> = {}): Household {
  return { id: 'hh_test', name: 'Test household', currency: 'AUD', dailyEarningTarget: 150, ...over };
}

export function category(id: string, over: Partial<Category> = {}): Category {
  return { id, name: id, icon: '🧾', color: 'primary', limit: 500, kind: 'expense', ...over };
}

/** A purchase. `amount` is given positive and stored negative, the way the app does it. */
export function purchase(id: string, amount: number, over: Partial<TransactionRecord> = {}): TransactionRecord {
  return { id, title: id, amount: -Math.abs(amount), date: '2026-08-15T12:00:00', categoryId: 'groceries', memberId: PRIYA, ...over };
}

export function income(id: string, amount: number, over: Partial<TransactionRecord> = {}): TransactionRecord {
  return { id, title: id, amount: Math.abs(amount), date: '2026-08-15T12:00:00', categoryId: 'pay', memberId: PRIYA, ...over };
}

export function goal(id: string, over: Partial<Goal> = {}): Goal {
  return { id, name: id, icon: '🎯', target: 1000, saved: 0, contributorIds: [PRIYA, SAM], status: 'active', ...over };
}

export function contribution(id: string, goalId: string, amount: number, over: Partial<GoalContribution> = {}): GoalContribution {
  return { id, goalId, memberId: PRIYA, amount, date: '2026-08-15T12:00:00', ...over };
}

export function bill(id: string, over: Partial<Bill> = {}): Bill {
  return { id, name: id, amount: 100, frequency: 'monthly', nextDue: '2026-08-20', kind: 'bill', categoryId: 'groceries', memberId: PRIYA, createdAt: '2026-08-01T09:00:00', ...over };
}

export function payday(id: string, over: Partial<IncomeSchedule> = {}): IncomeSchedule {
  return { id, memberId: PRIYA, name: id, amount: 2000, frequency: 'fortnightly', nextDate: '2026-08-20', categoryId: 'pay', createdAt: '2026-08-01T09:00:00', ...over };
}

export function settlement(id: string, fromMemberId: string, toMemberId: string, amount: number, over: Partial<Settlement> = {}): Settlement {
  return { id, fromMemberId, toMemberId, amount, date: '2026-08-16T12:00:00', createdAt: '2026-08-16T12:00:00', ...over };
}

export function account(id: string, over: Partial<Account> = {}): Account {
  return { id, name: id, kind: 'everyday', openingBalance: 0, createdAt: '2026-08-01T09:00:00', ...over };
}

export function creditCard(id: string, over: Partial<Account> = {}): Account {
  return account(id, { kind: 'credit', apr: 19.99, ...over });
}

/** A move between accounts; pass null for an end that is the outside world. */
export function accountTransfer(id: string, fromAccountId: string | null, toAccountId: string | null, amount: number, over: Partial<AccountTransfer> = {}): AccountTransfer {
  return { id, fromAccountId: fromAccountId ?? undefined, toAccountId: toAccountId ?? undefined, amount, date: '2026-08-16T12:00:00', createdAt: '2026-08-16T12:00:00', ...over };
}

/** A two-person household: Priya and Sam, one expense category, nothing logged. */
export function state(over: Partial<HouseholdState> = {}): HouseholdState {
  return {
    household: household(),
    members: [member(PRIYA), member(SAM, { color: 'sky' })],
    categories: [category('groceries'), category('pay', { kind: 'income', limit: 0 })],
    transactions: [],
    goals: [],
    goalContributions: [],
    currentMemberId: PRIYA,
    ...over,
  };
}
