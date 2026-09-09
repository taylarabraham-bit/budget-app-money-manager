import { formatMoneyAuto } from '@budget-app/ui';
import type { Household, HouseholdMember, SplitShare, TransactionRecord } from './types';

// How a shared purchase is divided between members, and what each member's
// budget is charged. Every calculation works in integer cents and uses
// largest-remainder allocation, so the shares of a purchase always add up to
// its total exactly - no lost or invented cents.

type MemberRef = Pick<HouseholdMember, 'id'>;
type HouseholdRef = Pick<Household, 'defaultSplit'>;

// Half-cents round away from zero in BOTH directions (bare Math.round pulls
// -0.5 towards +∞), and -0 normalises to 0. The epsilon settles a typed
// half-cent whose float lands a hair under the boundary (1.015 * 100 is
// 101.49999999999999, 2.675 * 100 is 267.49999999999994): the rule decides the
// direction, not the binary representation (audit MF-6).
export const toCents = (value: number): number => {
  const cents = Math.round(Math.abs(value) * 100 + 1e-7);
  return value < 0 ? -cents || 0 : cents;
};
export const fromCents = (cents: number): number => cents / 100;

/** Quantize to whole cents, preserving sign - the write boundary for every user-entered amount. */
export const roundMoney = (value: number): number => fromCents(toCents(value));

/** Sanity ceiling for a single entry - a typo like 999999999.99 breaks layouts and maths trust. */
export const MAX_AMOUNT = 1_000_000;

export interface Weight {
  memberId: string;
  weight: number;
}

export interface Allocation {
  memberId: string;
  cents: number;
}

/** A purchase divided between members, either by the household default or a custom split. */
export function isShared(t: Pick<TransactionRecord, 'shared' | 'split'>): boolean {
  return !!t.shared || (Array.isArray(t.split) && t.split.length > 0);
}

/**
 * The weights a purchase is split by when it has no custom split: equal by
 * default, or the household's ratio (members missing from the ratio get 0).
 * Falls back to equal when no current member has a positive share.
 */
export function resolveDefaultWeights(household: HouseholdRef, members: MemberRef[]): Weight[] {
  const split = household.defaultSplit;
  if (split?.mode === 'ratio') {
    const weights = members.map((m) => ({ memberId: m.id, weight: Math.max(0, Number(split.shares[m.id]) || 0) }));
    if (weights.some((w) => w.weight > 0)) return weights;
  }
  return members.map((m) => ({ memberId: m.id, weight: 1 }));
}

/**
 * Largest-remainder allocation of `totalCents` across positive weights. Each
 * member gets the floor of their exact share; the leftover cents go one each
 * to the largest remainders, ties broken in favour of `preferId` (the payer)
 * and then input order. Invariant: the returned cents sum to `totalCents`.
 */
export function allocateCents(totalCents: number, weights: Weight[], preferId?: string): Allocation[] {
  const active = weights.filter((w) => w.weight > 0);
  if (active.length === 0) return [];
  const totalWeight = active.reduce((acc, w) => acc + w.weight, 0);
  const exact = active.map((w) => (totalCents * w.weight) / totalWeight);
  const cents = exact.map((x) => Math.floor(x));
  let leftover = totalCents - cents.reduce((acc, c) => acc + c, 0);
  const order = active
    .map((w, i) => ({ i, remainder: exact[i]! - cents[i]!, preferred: w.memberId === preferId ? 0 : 1 }))
    .sort((a, b) => (Math.abs(b.remainder - a.remainder) > 1e-9 ? b.remainder - a.remainder : a.preferred - b.preferred || a.i - b.i));
  for (const o of order) {
    if (leftover <= 0) break;
    cents[o.i]! += 1;
    leftover -= 1;
  }
  return active.map((w, i) => ({ memberId: w.memberId, cents: cents[i]! }));
}

const isShareEntry = (s: unknown): s is SplitShare => !!s && typeof s === 'object' && typeof (s as SplitShare).memberId === 'string' && Number.isFinite((s as SplitShare).amount) && (s as SplitShare).amount > 0;

/** Custom split entries that belong to a current member and carry a positive amount (stored data may be stale). */
function validShares(split: unknown, members: MemberRef[]): SplitShare[] {
  if (!Array.isArray(split)) return [];
  const ids = new Set(members.map((m) => m.id));
  const rows = split.filter((s): s is SplitShare => isShareEntry(s) && ids.has(s.memberId));
  // Merge duplicate entries for one member (import/sync-only data): downstream
  // lookups take a member's single share, so a duplicate would silently drop money.
  const merged = new Map<string, number>();
  for (const s of rows) merged.set(s.memberId, (merged.get(s.memberId) ?? 0) + s.amount);
  return merged.size === rows.length ? rows : [...merged.entries()].map(([memberId, amount]) => ({ memberId, amount }));
}

/**
 * A stored custom split as READ: entries for current members plus the payer
 * (who may have left), duplicates merged. The share of a member who has since
 * been removed folds onto the payer - re-weighting it over the remaining
 * partners quietly raised what they owed on old purchases, with no ledger
 * event (audit MON-11). When the payer is gone too, that share sits with them
 * (nobody current), exactly as the pairwise ledger already treats it.
 */
function storedShares(split: unknown, members: MemberRef[], payerId: string): SplitShare[] {
  if (!Array.isArray(split)) return [];
  const ids = new Set(members.map((m) => m.id));
  const merged = new Map<string, number>();
  let orphaned = 0;
  for (const s of split) {
    if (!isShareEntry(s)) continue;
    if (ids.has(s.memberId) || s.memberId === payerId) merged.set(s.memberId, (merged.get(s.memberId) ?? 0) + s.amount);
    else orphaned += s.amount;
  }
  if (orphaned > 0) merged.set(payerId, (merged.get(payerId) ?? 0) + orphaned);
  return [...merged.entries()].map(([memberId, amount]) => ({ memberId, amount }));
}

const allocationsToShares = (allocations: Allocation[]): SplitShare[] => allocations.map((a) => ({ memberId: a.memberId, amount: fromCents(a.cents) }));

/**
 * Who is responsible for how much of a purchase. Not shared: all of it sits
 * with the payer. Custom split: as stored when it adds up (a removed member's
 * share moved onto the payer), otherwise re-allocated using the stored
 * amounts as weights (heals rounding or damaged data). Shared without a
 * custom split: the household default.
 */
export function splitShares(t: TransactionRecord, household: HouseholdRef, members: MemberRef[]): SplitShare[] {
  const total = Math.abs(t.amount);
  if (!isShared(t)) return [{ memberId: t.memberId, amount: total }];
  const totalCents = toCents(total);
  const custom = storedShares(t.split, members, t.memberId);
  if (custom.length > 0) {
    const sumCents = custom.reduce((acc, s) => acc + toCents(s.amount), 0);
    if (sumCents === totalCents) return custom.map((s) => ({ memberId: s.memberId, amount: fromCents(toCents(s.amount)) }));
    return allocationsToShares(
      allocateCents(
        totalCents,
        custom.map((s) => ({ memberId: s.memberId, weight: s.amount })),
        t.memberId,
      ),
    );
  }
  const allocations = allocateCents(totalCents, resolveDefaultWeights(household, members), t.memberId);
  return allocations.length > 0 ? allocationsToShares(allocations) : [{ memberId: t.memberId, amount: total }];
}

/** This member's part of a purchase (positive); 0 when they are not involved. */
export function shareOf(t: TransactionRecord, memberId: string, household: HouseholdRef, members: MemberRef[]): number {
  return splitShares(t, household, members).find((s) => s.memberId === memberId)?.amount ?? 0;
}

/**
 * What lands on this member's personal budget, signed like the transaction:
 * income counts only for the earner; a purchase counts as minus their share,
 * whoever paid.
 */
export function attributedAmount(t: TransactionRecord, memberId: string, household: HouseholdRef, members: MemberRef[]): number {
  if (t.amount > 0) return t.memberId === memberId ? t.amount : 0;
  return -shareOf(t, memberId, household, members);
}

/** True when the transaction is on this member's budget or they paid/earned it. */
export function touches(t: TransactionRecord, memberId: string, household: HouseholdRef, members: MemberRef[]): boolean {
  return t.memberId === memberId || attributedAmount(t, memberId, household, members) !== 0;
}

/** Clean a custom split at write time: drop unknown members and non-positive amounts, then make it add up to `total`. */
export function normaliseSplit(input: SplitShare[] | undefined, total: number, members: MemberRef[], preferId?: string): SplitShare[] | undefined {
  const valid = validShares(input, members);
  if (valid.length === 0) return undefined;
  return allocationsToShares(
    allocateCents(
      toCents(Math.abs(total)),
      valid.map((s) => ({ memberId: s.memberId, weight: s.amount })),
      preferId,
    ),
  );
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** "Priya $32.10 · Sam $32.10" */
export function describeSplit(shares: SplitShare[], members: HouseholdMember[], currency: string): string {
  return shares
    .filter((s) => s.amount > 0)
    .map((s) => `${firstName(members.find((m) => m.id === s.memberId)?.name ?? 'Someone')} ${formatMoneyAuto(s.amount, { currency })}`)
    .join(' · ');
}
