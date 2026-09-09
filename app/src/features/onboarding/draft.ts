import { MEMBER_COLORS, formatMoneyAuto, type MemberColor } from '@budget-app/ui';
import { isRecord } from '../../data/persist';
import { MAX_AMOUNT, fromCents, resolveDefaultWeights, roundMoney } from '../../data/split';
import type { HouseholdState } from '../../data/store';
import type { Category, Goal, Household, HouseholdMember, MemberRole } from '../../data/types';
import { daysFromNow, firstOfNextMonth, todayIso } from '../../lib/dates';
import { OCCURRENCES_PER_MONTH, dayOfMonth, type Frequency } from '../../lib/frequency';
import { newId } from '../../lib/ids';
import { selectAccountBalances } from '../accounts/selectors';
import { applyAccountPatch } from '../accounts/store';
import { KIND_LABEL, type Account, type AccountKind, type AccountTransfer } from '../accounts/types';
import type { Bill, BillKind } from '../bills/types';
import type { IncomeSchedule } from '../paydays/types';
import { DEFAULT_CATEGORIES } from '../setup/defaults';
import type { AccountDraft, BillDraft, CategoryDraft, Draft, PaydayDraft, PersonDraft, Step } from './types';

export const STEP_ORDER: readonly Step[] = ['start', 'household', 'people', 'paydays', 'sharing', 'bills', 'accounts', 'budgets', 'goal', 'preferences', 'done'];

export const newPerson = (role: MemberRole, color: MemberColor, id = newId('m')): PersonDraft => ({ id, name: '', role, color, limit: null });

export const newPayday = (memberId: string, enabled = true): PaydayDraft => ({ memberId, enabled, name: 'Salary', amount: null, frequency: 'monthly', nextDate: firstOfNextMonth(), variable: false });

export interface BillSuggestion {
  name: string;
  icon: string;
  kind: BillKind;
  categoryId: string;
  frequency: Frequency;
  shared: boolean;
}

/** Common bills offered as one-tap chips. Category ids match DEFAULT_CATEGORIES. */
export const BILL_SUGGESTIONS: readonly BillSuggestion[] = [
  { name: 'Rent', icon: '🏠', kind: 'bill', categoryId: 'c_home', frequency: 'monthly', shared: true },
  { name: 'Electricity', icon: '💡', kind: 'bill', categoryId: 'c_home', frequency: 'monthly', shared: true },
  { name: 'Water', icon: '🚰', kind: 'bill', categoryId: 'c_home', frequency: 'monthly', shared: true },
  { name: 'Gas', icon: '🔥', kind: 'bill', categoryId: 'c_home', frequency: 'monthly', shared: true },
  { name: 'Internet', icon: '📶', kind: 'bill', categoryId: 'c_home', frequency: 'monthly', shared: true },
  { name: 'Phone plan', icon: '📱', kind: 'bill', categoryId: 'c_subs', frequency: 'monthly', shared: false },
  { name: 'Car insurance', icon: '🚗', kind: 'bill', categoryId: 'c_transport', frequency: 'monthly', shared: true },
  { name: 'Gym', icon: '🏋️', kind: 'subscription', categoryId: 'c_health', frequency: 'monthly', shared: false },
  { name: 'Netflix', icon: '📺', kind: 'subscription', categoryId: 'c_subs', frequency: 'monthly', shared: true },
  { name: 'Spotify', icon: '🎵', kind: 'subscription', categoryId: 'c_subs', frequency: 'monthly', shared: true },
  { name: 'Cloud storage', icon: '☁️', kind: 'subscription', categoryId: 'c_subs', frequency: 'monthly', shared: false },
];

export const GOAL_ICONS = ['✈️', '🏡', '🚗', '💍', '🎓', '💻', '🛋️', '🎁', '🐶', '🏝️'] as const;

/** Accounts offered as one-tap chips on the Accounts step. */
export const ACCOUNT_SUGGESTIONS: readonly { name: string; icon: string; kind: AccountKind }[] = [
  { name: 'Joint everyday', icon: '🏦', kind: 'everyday' },
  { name: 'Savings', icon: '💰', kind: 'savings' },
  { name: 'Credit card', icon: '💳', kind: 'credit' },
];

export function newAccountDraft(kind: AccountKind, name = ''): AccountDraft {
  // 25 days is the commonest grace period; prefilled so a card added here gets
  // due-date maths out of the box, and blank for banks (it means nothing there).
  return { key: newId('row'), kind, name, balance: null, apr: '', creditLimit: null, statementDay: '', dueDays: kind === 'credit' ? '25' : '', minPercent: '', minFloor: null };
}

// -- amount rules shared by every step --------------------------------------

/** Every wizard amount shares the app's write-boundary ceiling (audit UX-6/MON-8). */
export const withinMax = (v: number | null): boolean => v === null || Math.abs(v) <= MAX_AMOUNT;

/** Worded as the app's other dialogs word it, with the cap in the household's currency. */
export const tooBigMessage = (currency: string): string => `That looks too big - amounts up to ${formatMoneyAuto(MAX_AMOUNT, { currency })} are supported`;

/** The field error for a required positive amount: `empty` when missing, the cap message when over it. */
export const amountError = (v: number | null, currency: string, empty: string): string | undefined => (!(v && v > 0) ? empty : !withinMax(v) ? tooBigMessage(currency) : undefined);

/** A positive limit within the cap - or none at all for a member who already had no personal cap (audit OB-13). */
export const personLimitValid = (p: PersonDraft): boolean => (p.limit !== null && p.limit > 0 && p.limit <= MAX_AMOUNT) || (!!p.noCap && (p.limit === null || p.limit === 0));

/** Empty means 0 (no limit) on Finish; otherwise 0 up to the cap (audit DS-4, UX-6). */
export const categoryLimitValid = (limit: number | null): boolean => limit === null || (limit >= 0 && limit <= MAX_AMOUNT);

const draftNumber = (text: string): number | undefined => {
  const v = Number(text.trim());
  return text.trim() === '' || !Number.isFinite(v) ? undefined : v;
};

/**
 * The drafted accounts as real rows, through the same write boundary the
 * Accounts screen uses (whole cents, 2 dp rates, out-of-range terms dropped,
 * credit terms scrubbed off banks). Nameless rows are silently dropped - an
 * added-then-abandoned card should not land as "Credit card".
 */
export function buildAccounts(drafts: AccountDraft[], createdAt: string): Account[] {
  return drafts
    .filter((a) => a.name.trim())
    .map((a) =>
      applyAccountPatch(
        { id: newId('a'), name: KIND_LABEL[a.kind], kind: a.kind, openingBalance: 0, createdAt },
        {
          name: a.name,
          kind: a.kind,
          openingBalance: a.balance ?? 0,
          memberId: a.memberId,
          note: a.note,
          apr: draftNumber(a.apr),
          creditLimit: a.creditLimit ?? undefined,
          statementDay: draftNumber(a.statementDay),
          dueDaysAfterStatement: draftNumber(a.dueDays),
          minPaymentPercent: draftNumber(a.minPercent),
          minPaymentFloor: a.minFloor ?? undefined,
        },
      ),
    );
}

/**
 * Finish-time build: the rows plus a map from each prefetched account's
 * ORIGINAL id to its freshly minted one, so bills and paydays can follow
 * their account through the rebuild instead of all landing on the first
 * bank (QA7 O-2). Order-coupled to buildAccounts' name filter on purpose -
 * both live here so they cannot drift apart.
 */
export function buildAccountsWithOrigins(drafts: AccountDraft[], createdAt: string): { accounts: Account[]; idByOrigin: Map<string, string> } {
  const named = drafts.filter((a) => a.name.trim());
  const accounts = buildAccounts(drafts, createdAt);
  const idByOrigin = new Map<string, string>();
  named.forEach((d, i) => {
    if (d.originId) idByOrigin.set(d.originId, accounts[i]!.id);
  });
  return { accounts, idByOrigin };
}

export function newBill(s: Partial<BillSuggestion> & { name: string }, memberId: string, categories: Pick<Category, 'id' | 'kind'>[]): BillDraft {
  const expense = categories.filter((c) => c.kind === 'expense');
  const categoryId = s.categoryId && expense.some((c) => c.id === s.categoryId) ? s.categoryId : expense.find((c) => c.id === 'c_home')?.id ?? expense[0]?.id ?? '';
  return { key: newId('row'), name: s.name, amount: null, frequency: s.frequency ?? 'monthly', nextDue: firstOfNextMonth(), kind: s.kind ?? 'bill', categoryId, memberId, shared: s.shared ?? true };
}

/** A fresh draft: two people, a payday each, the default categories. */
export function emptyDraft(currency: string): Draft {
  const you = newPerson('Owner', 'coral');
  const partner = newPerson('Partner', 'violet');
  return {
    name: '',
    currency,
    youId: you.id,
    people: [you, partner],
    paydays: [newPayday(you.id), newPayday(partner.id)],
    trackDaily: false,
    dailyTarget: null,
    split: 'equal',
    customPct: { [you.id]: 50, [partner.id]: 50 },
    requireApproval: false,
    bills: [],
    accounts: [],
    categories: DEFAULT_CATEGORIES().map((c) => ({ ...c, enabled: true })),
    goalEnabled: false,
    goal: { name: '', icon: GOAL_ICONS[0], target: null, deadline: daysFromNow(180) },
  };
}

/** Which stores hold the user's own data (vs the untouched sample). A mixed state - real
 * bills under a still-sample household - must prefill the real rows and only them:
 * seeding sample names/limits as if they were the user's would be wrong, and dropping
 * the real rows would let Finish silently delete them (QA UX-2). */
export interface ExistingReal {
  household: boolean;
  bills: boolean;
  paydays: boolean;
  accounts: boolean;
}

/** Re-running setup over real data: keep the people, categories, bills, paydays and accounts as the starting point. */
export function draftFromExisting(
  state: HouseholdState,
  bills: Bill[],
  schedules: IncomeSchedule[],
  accounts: Account[],
  transfers: AccountTransfer[],
  real: ExistingReal = { household: true, bills: true, paydays: true, accounts: true },
): Draft {
  const base = emptyDraft(state.household.currency || 'USD');
  const today = todayIso();
  // Members are kept by id even when the household is still sample - real bills and
  // paydays reference those ids ("Paid by ..."), so keeping the ids (with blanked
  // names to rename) keeps them attached. Sample names/limits never prefill.
  const people: PersonDraft[] = state.members.map((m) => ({
    id: m.id,
    name: real.household ? m.name : '',
    role: m.role,
    color: m.color,
    limit: real.household && m.monthlyLimit > 0 ? m.monthlyLimit : null,
    // 0 is "no personal cap" everywhere else in the app; the People step must not force one on them (audit OB-13).
    noCap: (real.household && m.monthlyLimit <= 0) || undefined,
  }));
  // THIS device's member is "You" - not members[0], which on the partner's phone is the other person (audit OB-4).
  const youId = people.some((p) => p.id === state.currentMemberId) ? state.currentMemberId : people[0]?.id ?? base.youId;
  const weights = resolveDefaultWeights(state.household, state.members);
  const totalWeight = weights.reduce((acc, w) => acc + w.weight, 0) || 1;
  const customPct: Record<string, number> = {};
  for (const w of weights) customPct[w.memberId] = Math.round((w.weight / totalWeight) * 100);
  const existingCategories = state.categories.filter((c) => c.kind === 'expense');
  const categories: CategoryDraft[] = real.household
    ? [
        ...existingCategories.map((c) => ({ ...c, enabled: true })),
        ...base.categories.filter((c) => c.kind === 'expense' && !existingCategories.some((e) => e.id === c.id)).map((c) => ({ ...c, enabled: false })),
        ...state.categories.filter((c) => c.kind === 'income').map((c) => ({ ...c, enabled: true })),
      ]
    : base.categories;
  if (!categories.some((c) => c.kind === 'income')) categories.push(...base.categories.filter((c) => c.kind === 'income'));
  const personIds = new Set(people.map((p) => p.id));
  return {
    ...base,
    name: real.household ? state.household.name : '',
    youId,
    people,
    paydays: people.map((p) => {
      const s = real.paydays ? schedules.find((x) => x.memberId === p.id && !x.paused) : undefined;
      return s
        ? { memberId: p.id, enabled: true, name: s.name, amount: s.amount, frequency: s.frequency, nextDate: s.nextDate, variable: !!s.variable, accountId: s.accountId, originId: s.id, anchorDay: s.anchorDay ?? dayOfMonth(s.nextDate), originDate: s.nextDate }
        : newPayday(p.id, !real.paydays);
    }),
    trackDaily: real.household && state.household.dailyEarningTarget > 0,
    dailyTarget: real.household && state.household.dailyEarningTarget > 0 ? state.household.dailyEarningTarget : null,
    split: real.household && state.household.defaultSplit?.mode === 'ratio' ? 'custom' : 'equal',
    customPct,
    requireApproval: real.household && !!state.household.requireApproval,
    bills: real.bills
      ? bills
          .filter((b) => !b.paused)
          .map((b) => {
            // An overdue bill starts again from today but keeps the anchor of its ORIGINAL
            // date: rent due on the 1st, re-run on the 4th, is still a 1st-of-the-month bill;
            // a month-end bill sitting on a clamped Sep 30 keeps its 31 (audit MON-1/MF-2).
            const nextDue = b.nextDue < today ? today : b.nextDue;
            return {
              key: newId('row'),
              name: b.name,
              amount: b.amount,
              frequency: b.frequency,
              nextDue,
              kind: b.kind,
              categoryId: b.categoryId,
              // A bill can reference a member who is gone (or a category the draft dropped);
              // the Paid by / Category selects repair against the draft's own lists.
              memberId: personIds.has(b.memberId) ? b.memberId : youId,
              shared: !!b.shared,
              accountId: b.accountId,
              originId: b.id,
              anchorDay: b.anchorDay ?? dayOfMonth(b.nextDue),
              originDue: nextDue,
            };
          })
      : [],
    // Prefill with today's DERIVED balances, not the stored openings: Finish
    // wipes the transaction ledger, so the drafted balance becomes the new
    // opening - carrying the old opening would time-travel every balance back.
    accounts: real.accounts
      ? (() => {
          const balances = selectAccountBalances(accounts, transfers, state.transactions);
          return accounts
            .filter((a) => !a.archived)
            .map((a): AccountDraft => {
              const cents = balances.get(a.id) ?? 0;
              return {
                key: newId('row'),
                kind: a.kind,
                name: a.name,
                // An overpaid card's derived balance is negative - the bank
                // owes YOU. The draft's "owing today" can't say that, and
                // Finish's abs() would flip the credit into debt (QA7 A-3):
                // clamp to nothing-owing instead.
                balance: cents === 0 || (a.kind === 'credit' && cents < 0) ? null : fromCents(cents),
                originId: a.id,
                memberId: a.memberId,
                note: a.note,
                apr: a.apr !== undefined ? String(a.apr) : '',
                creditLimit: a.creditLimit ?? null,
                statementDay: a.statementDay !== undefined ? String(a.statementDay) : '',
                dueDays: a.dueDaysAfterStatement !== undefined ? String(a.dueDaysAfterStatement) : a.kind === 'credit' ? '25' : '',
                minPercent: a.minPaymentPercent !== undefined ? String(a.minPaymentPercent) : '',
                minFloor: a.minPaymentFloor ?? null,
              };
            });
        })()
      : [],
    categories,
  };
}

/**
 * What "Skip for now" leaves behind: only rows added in this run go. Prefilled
 * (origin) rows stay, so skipping a step over live data can never make Finish
 * delete every real bill or account behind it (audit OB-5).
 */
export function skipPatch(draft: Draft, step: Step): Partial<Draft> {
  switch (step) {
    case 'bills':
      return { bills: draft.bills.filter((b) => b.originId) };
    case 'accounts':
      return { accounts: draft.accounts.filter((a) => a.originId) };
    case 'goal':
      return { goalEnabled: false };
    default:
      return {};
  }
}

// -- the saved wizard (a reload resumes it) -----------------------------------

export interface SavedWizard {
  mode: 'first-run' | 'fresh';
  index: number;
  draft: Draft;
}

/**
 * A saved wizard is worth resuming for a week. Past that it is stale by
 * definition - dates already gone, names typed months ago - and it used to
 * resurface whenever the mode flipped back (first-run again after "Restore
 * sample"), so it is dropped instead (audit OB-14). The screen also clears a
 * draft saved by the OTHER mode as soon as it sees it.
 */
export const DRAFT_TTL_MS = 7 * 86_400_000;

/** The stored shape, or null when it is not one, has expired, or predates `savedAt`. */
export function parseSavedWizard(x: unknown, now = Date.now()): SavedWizard | null {
  if (!isRecord(x) || x.version !== 1 || (x.mode !== 'first-run' && x.mode !== 'fresh') || typeof x.index !== 'number' || !isRecord(x.draft)) return null;
  const savedAt = typeof x.savedAt === 'string' ? Date.parse(x.savedAt) : NaN;
  if (!Number.isFinite(savedAt) || now - savedAt > DRAFT_TTL_MS) return null;
  const draft = x.draft as unknown as Draft;
  if (!Array.isArray(draft.people) || draft.people.length === 0) return null;
  // Drafts saved before youId existed labelled the first person "You" (audit OB-4).
  const youId = typeof draft.youId === 'string' && draft.people.some((p) => p.id === draft.youId) ? draft.youId : draft.people[0]!.id;
  return { mode: x.mode, index: x.index, draft: { ...draft, youId } };
}

// -- Finish -------------------------------------------------------------------

export interface FinishContext {
  createdAt: string;
  /** Archived accounts are not shown in the wizard; a fresh re-run keeps them (QA7 A-7/O-3). */
  keptArchived: Account[];
  /** Paused bills and paydays are not shown either; a fresh re-run carries them through unchanged (audit LV-2). Never rows of a still-sample store. */
  pausedBills: Bill[];
  pausedSchedules: IncomeSchedule[];
}

export interface FinishRows {
  household: Omit<Household, 'id'>;
  members: HouseholdMember[];
  categories: Category[];
  goal: Goal | null;
  bills: Bill[];
  schedules: IncomeSchedule[];
  accounts: Account[];
  /** The device's member: the draft's "You" while still in the household, else the first (audit OB-4). */
  currentMemberId: string;
}

/**
 * Everything Finish writes, built from the draft in one place. Every drafted
 * amount is a raw AmountInput number (three decimals get through), and the
 * wizard bypasses the providers' add methods - so this is its write boundary:
 * roundMoney on every amount, like the stores' own paths (audit MON-3).
 */
export function buildFinish(draft: Draft, ctx: FinishContext): FinishRows {
  const members: HouseholdMember[] = draft.people.map((p) => ({ id: p.id, name: p.name.trim(), color: p.color, role: p.role, monthlyLimit: roundMoney(Math.max(0, p.limit ?? 0)) }));
  const ids = members.map((m) => m.id);
  const youId = ids.includes(draft.youId) ? draft.youId : ids[0]!;
  // Drafted bills can point at a category unticked on the Budgets step, or at a
  // person removed on the People step - repair here so nothing lands dangling (QA UX-8).
  const categories: Category[] = draft.categories.filter((c) => c.enabled || c.kind === 'income').map(({ enabled: _enabled, ...c }) => ({ ...c, limit: roundMoney(Math.max(0, c.limit ?? 0)) }));
  const fallbackCategoryId = categories.find((c) => c.kind === 'expense')?.id ?? categories[0]?.id ?? '';
  const categoryIdOf = (id: string) => (categories.some((c) => c.id === id) ? id : fallbackCategoryId);
  const incomeCategoryId = categories.find((c) => c.kind === 'income')?.id ?? 'c_income';
  const memberIdOf = (id: string) => (ids.includes(id) ? id : youId);
  const ratio = draft.split === 'income' ? percentsFrom(monthlyIncomeByMember(draft.paydays), ids) : draft.customPct;
  const goal: Goal | null =
    draft.goalEnabled && draft.goal.name.trim() && draft.goal.target
      ? { id: newId('g'), name: draft.goal.name.trim(), icon: draft.goal.icon, target: Math.max(1, roundMoney(draft.goal.target)), saved: 0, deadlineDate: draft.goal.deadline || undefined, contributorIds: ids, status: 'active' }
      : null;
  // Accounts first: wizard-added bills and paydays default onto the first
  // bank account (the step says so), so pay/receive flows move a balance
  // from day one - but one that already pointed at an account FOLLOWS it
  // through the rebuild via its origin id (QA7 O-2). Credit cards are never
  // a default.
  const { accounts, idByOrigin } = buildAccountsWithOrigins(draft.accounts, ctx.createdAt);
  const defaultBankId = accounts.find((a) => a.kind !== 'credit')?.id;
  const accountIdOf = (originalId?: string) => (originalId && (idByOrigin.get(originalId) ?? ctx.keptArchived.find((a) => a.id === originalId)?.id)) || defaultBankId;
  // A prefilled row keeps its anchor while its date is untouched; a re-picked date
  // re-anchors to its day, exactly as the bill and payday forms do (audit MON-1/MF-2).
  const anchorOf = (anchorDay: number | undefined, date: string, originDate: string | undefined) => (anchorDay !== undefined && date === originDate ? anchorDay : dayOfMonth(date));
  const bills: Bill[] = draft.bills.map((b) => ({
    id: newId('b'),
    name: b.name.trim(),
    amount: roundMoney(b.amount ?? 0),
    frequency: b.frequency,
    nextDue: b.nextDue,
    anchorDay: anchorOf(b.anchorDay, b.nextDue, b.originDue),
    kind: b.kind,
    categoryId: categoryIdOf(b.categoryId),
    memberId: memberIdOf(b.memberId),
    shared: b.shared || undefined,
    accountId: accountIdOf(b.accountId),
    createdAt: ctx.createdAt,
  }));
  const schedules: IncomeSchedule[] = draft.paydays
    .filter((p) => p.enabled)
    .map((p) => ({
      id: newId('p'),
      memberId: memberIdOf(p.memberId),
      name: p.name.trim(),
      amount: roundMoney(p.amount ?? 0),
      frequency: p.frequency,
      nextDate: p.nextDate,
      anchorDay: anchorOf(p.anchorDay, p.nextDate, p.originDate),
      categoryId: incomeCategoryId,
      accountId: accountIdOf(p.accountId),
      variable: p.variable || undefined,
      createdAt: ctx.createdAt,
    }));
  // Paused rows were never shown, so they ride through as they are - ids, dates,
  // anchors, payment history - with only their links repaired against the rebuilt
  // household (audit LV-2). One the draft DID prefill (paused since, on a resumed
  // draft) is rebuilt from the draft rather than doubled; a paused pay of a member
  // removed on the People step goes with them, as their drafted pay does.
  const drafted = new Set([...draft.bills.map((b) => b.originId), ...draft.paydays.map((p) => p.originId)].filter((id): id is string => !!id));
  const carriedBills: Bill[] = ctx.pausedBills.filter((b) => !drafted.has(b.id)).map((b) => ({ ...b, categoryId: categoryIdOf(b.categoryId), memberId: memberIdOf(b.memberId), accountId: b.accountId ? accountIdOf(b.accountId) : undefined }));
  const carriedSchedules: IncomeSchedule[] = ctx.pausedSchedules
    .filter((s) => !drafted.has(s.id) && ids.includes(s.memberId))
    .map((s) => ({ ...s, categoryId: categories.some((c) => c.id === s.categoryId) ? s.categoryId : incomeCategoryId, accountId: s.accountId ? accountIdOf(s.accountId) : undefined }));
  return {
    household: {
      name: draft.name.trim(),
      currency: draft.currency,
      dailyEarningTarget: draft.trackDaily ? roundMoney(Math.max(0, draft.dailyTarget ?? 0)) : 0,
      defaultSplit: draft.split === 'equal' ? { mode: 'equal' } : { mode: 'ratio', shares: Object.fromEntries(ids.map((id) => [id, (ratio[id] ?? 0) / 100])) },
      requireApproval: draft.requireApproval,
    },
    members,
    categories,
    goal,
    bills: [...bills, ...carriedBills],
    schedules: [...schedules, ...carriedSchedules],
    accounts: [...accounts, ...ctx.keptArchived],
    currentMemberId: youId,
  };
}

/** What the drafted bills come to per month - the required money that comes off income before the budgets. */
export function monthlyBillsTotal(bills: BillDraft[]): number {
  return bills.reduce((acc, b) => acc + (b.amount && b.amount > 0 ? b.amount * OCCURRENCES_PER_MONTH[b.frequency] : 0), 0);
}

/** Expected monthly income per member from the payday rows (only enabled ones with an amount). */
export function monthlyIncomeByMember(paydays: PaydayDraft[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of paydays) if (p.enabled && p.amount && p.amount > 0) out[p.memberId] = (out[p.memberId] ?? 0) + p.amount * OCCURRENCES_PER_MONTH[p.frequency];
  return out;
}

/** Whole percents that add up to 100 from any positive weights (largest remainder). */
export function percentsFrom(weights: Record<string, number>, ids: string[]): Record<string, number> {
  const total = ids.reduce((acc, id) => acc + Math.max(0, weights[id] ?? 0), 0);
  if (total <= 0) return Object.fromEntries(ids.map((id) => [id, Math.floor(100 / ids.length)]));
  const raw = ids.map((id) => (Math.max(0, weights[id] ?? 0) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, rem: v - floors[i]! })).sort((a, b) => b.rem - a.rem);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i]! += 1;
    left -= 1;
  }
  return Object.fromEntries(ids.map((id, i) => [id, floors[i]!]));
}

export const nextFreeColor = (taken: MemberColor[]): MemberColor => MEMBER_COLORS.find((c) => !taken.includes(c)) ?? MEMBER_COLORS[taken.length % MEMBER_COLORS.length]!;
