import type { MemberColor } from '@budget-app/ui';

// Shapes mirror the planned Supabase tables (households, members, categories,
// transactions, goals) so the mock store can be swapped for real queries
// without touching the screens.

/**
 * How a shared purchase is divided when the transaction has no custom split.
 * `ratio` shares are fractions per member id (e.g. 0.6 / 0.4 for income-proportional);
 * they are normalised over the current members when used, so they need not sum to 1.
 */
export type DefaultSplit = { mode: 'equal' } | { mode: 'ratio'; shares: Record<string, number> };

export interface Household {
  id: string;
  name: string;
  currency: string;
  /** Household-wide daily earning target, shown as the reference line on the trend chart. */
  dailyEarningTarget: number;
  /** Missing = split shared purchases equally between everyone. */
  defaultSplit?: DefaultSplit;
  /** Partner must confirm ad-hoc shared purchases before they count towards what they owe. Default off. */
  requireApproval?: boolean;
}

/** Roles are labels, not permissions (see docs/guides/household-and-members.md). */
export type MemberRole = 'Owner' | 'Parent' | 'Partner' | 'Teen' | 'Child';

export const MEMBER_ROLES: readonly MemberRole[] = ['Owner', 'Parent', 'Partner', 'Teen', 'Child'];

export interface HouseholdMember {
  id: string;
  name: string;
  color: MemberColor;
  role: MemberRole;
  /** Personal monthly budget ceiling across all categories. */
  monthlyLimit: number;
}

/** What the add/edit member form collects. */
export interface NewMemberInput {
  name: string;
  color: MemberColor;
  role: MemberRole;
  monthlyLimit: number;
}

/** Editable household settings (everything but the id). */
export type HouseholdPatch = Partial<Omit<Household, 'id'>>;

/** What the category form collects; new categories are always `expense`. */
export interface CategoryInput {
  name: string;
  icon: string;
  /** Monthly household limit; 0 means no limit. */
  limit: number;
  color?: 'primary' | MemberColor;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: 'primary' | MemberColor;
  /** Monthly household limit. */
  limit: number;
  kind: 'expense' | 'income';
  /** Pre-ticks "Split with …" when logging a purchase in this category (groceries, rent). */
  defaultShared?: boolean;
}

/** One member's part of a shared purchase, as a positive amount. Entries sum to the purchase total. */
export interface SplitShare {
  memberId: string;
  amount: number;
}

export interface TransactionRecord {
  id: string;
  title: string;
  /** Signed: negative for purchases, positive for income. */
  amount: number;
  /** ISO datetime, local. */
  date: string;
  categoryId: string;
  /** Who paid (purchases) or earned (income). */
  memberId: string;
  note?: string;
  /** Shared household expense, divided by the household's default split unless `split` is set. */
  shared?: boolean;
  /** Custom division of a shared purchase; implies `shared`. */
  split?: SplitShare[];
  /** Who created the record (defaults to `memberId` for older rows). */
  loggedBy?: string;
  recurring?: boolean;
  pending?: boolean;
  /** Members who still have to confirm this shared purchase (household approval on). Absent/empty = confirmed. */
  needsApprovalFrom?: string[];
  /** A member questioned this purchase; it stays in the log but is left out of the settle-up balance until resolved. */
  disputed?: { byMemberId: string; reason?: string; at: string };
  /** A receipt photo is stored for this entry (in the device's IndexedDB, keyed by transaction id). */
  hasReceipt?: boolean;
  /** Account the money moved through (accounts feature): paid with, for purchases; paid into, for income. Absent = not tracked. */
  accountId?: string;
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  target: number;
  saved: number;
  /** ISO date ("2026-12-20") the goal should be reached by. */
  deadlineDate?: string;
  contributorIds: string[];
  status: 'active' | 'completed' | 'paused';
  /** ISO datetime of the last contribution, for sorting and the detail view. */
  lastContributionAt?: string;
}

export interface NewGoalInput {
  name: string;
  icon: string;
  target: number;
  saved?: number;
  deadlineDate?: string;
  contributorIds: string[];
}

/** One deposit into a goal - the ledger behind goal.saved (which is the running total). */
export interface GoalContribution {
  id: string;
  goalId: string;
  memberId: string;
  amount: number;
  /** ISO datetime, local. */
  date: string;
}

export interface GoalContributionInput {
  goalId: string;
  amount: number;
  memberId: string;
}

export interface NewTransactionInput {
  title: string;
  amount: number;
  kind: 'expense' | 'income';
  categoryId: string;
  memberId: string;
  note?: string;
  shared?: boolean;
  /** Custom split (amounts per member, summing to `amount`); sets `shared` too. */
  split?: SplitShare[];
  /** Marks the row as a recurring payment (bills, subscriptions). */
  recurring?: boolean;
  /** Local ISO datetime ("2026-08-21T19:30:00") for a backdated entry; omitted = now. Never in the future. */
  date?: string;
  /** Account it was paid with (purchases) or into (income); empty/omitted = not tracked. */
  accountId?: string;
}
