import type { MemberColor } from '@budget-app/ui';
import type { Category, MemberRole } from '../../data/types';
import type { Frequency } from '../../lib/frequency';
import type { AccountKind } from '../accounts/types';
import type { BillKind } from '../bills/types';

// The onboarding draft: everything the steps collect, applied in one go on
// Finish so backing out at any point changes nothing.

export type Step = 'start' | 'household' | 'people' | 'paydays' | 'sharing' | 'bills' | 'accounts' | 'budgets' | 'goal' | 'preferences' | 'done' | 'join';

export interface PersonDraft {
  /** Real member id, minted up front so paydays and bills can point at it. */
  id: string;
  name: string;
  role: MemberRole;
  color: MemberColor;
  limit: number | null;
  /** The live member had no personal cap (limit 0): the People step accepts an empty limit for them instead of forcing one (audit OB-13). */
  noCap?: boolean;
}

export interface PaydayDraft {
  memberId: string;
  /** "X doesn't have regular pay" unticks this. */
  enabled: boolean;
  name: string;
  amount: number | null;
  frequency: Frequency;
  nextDate: string;
  variable: boolean;
  /** ORIGINAL account id this pay lands in (re-run prefill) - Finish follows it to the rebuilt account (QA7 O-2). */
  accountId?: string;
  /** The live schedule this row was prefilled from (re-run); rows without one were added in this run (audit LV-2). */
  originId?: string;
  /** The live schedule's anchor day; Finish keeps it while `nextDate` is still `originDate` and re-anchors on a re-picked date, as the payday form does (audit MON-1/MF-2). */
  anchorDay?: number;
  /** `nextDate` as prefilled (an overdue date is clamped to today), so Finish can tell a re-picked date from an untouched one. */
  originDate?: string;
}

export interface BillDraft {
  key: string;
  name: string;
  amount: number | null;
  frequency: Frequency;
  nextDue: string;
  kind: BillKind;
  categoryId: string;
  memberId: string;
  shared: boolean;
  /** ORIGINAL account id it was paid from (re-run prefill) - Finish follows it to the rebuilt account (QA7 O-2). */
  accountId?: string;
  /** The live bill this row was prefilled from (re-run); rows without one were added in this run, which is all "Skip for now" discards (audit OB-5). */
  originId?: string;
  /** The live bill's anchor day; Finish keeps it while `nextDue` is still `originDue` and re-anchors on a re-picked date, as the bill form does (audit MON-1/MF-2). */
  anchorDay?: number;
  /** `nextDue` as prefilled (an overdue date is clamped to today), so Finish can tell a re-picked date from an untouched one. */
  originDue?: string;
}

/** The limit stays null while the field is cleared - coerced to 0 on Finish, never mid-keystroke (audit DS-4). */
export interface CategoryDraft extends Omit<Category, 'limit'> {
  limit: number | null;
  enabled: boolean;
}

/** Credit terms live as the fields hold them (strings for rates and days); parsed on Finish. */
export interface AccountDraft {
  key: string;
  kind: AccountKind;
  name: string;
  /** Balance today (banks) or owing today (credit). */
  balance: number | null;
  apr: string;
  creditLimit: number | null;
  statementDay: string;
  dueDays: string;
  minPercent: string;
  minFloor: number | null;
  /** The live account this row was prefilled from (re-run), so bill/payday links can follow it (QA7 O-2). */
  originId?: string;
  /** Owner and note ride the draft invisibly so a re-run stops dropping them (QA7 A-7/O-3). */
  memberId?: string;
  note?: string;
}

export interface GoalDraft {
  name: string;
  icon: string;
  target: number | null;
  deadline: string;
}

export type SplitChoice = 'equal' | 'income' | 'custom';

export interface Draft {
  name: string;
  currency: string;
  /** Which person is THIS device: labelled "You", cannot be removed, and becomes the device's member on Finish - not whoever is listed first (audit OB-4). */
  youId: string;
  people: PersonDraft[];
  paydays: PaydayDraft[];
  trackDaily: boolean;
  dailyTarget: number | null;
  split: SplitChoice;
  /** Whole percents per member id (custom split). */
  customPct: Record<string, number>;
  requireApproval: boolean;
  bills: BillDraft[];
  accounts: AccountDraft[];
  categories: CategoryDraft[];
  goalEnabled: boolean;
  goal: GoalDraft;
}
