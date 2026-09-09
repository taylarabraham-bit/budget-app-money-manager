import { parseIsoDate } from '@budget-app/ui';
import { fromCents, isShared, shareOf, toCents } from '../../data/split';
import type { HouseholdState } from '../../data/store';
import type { HouseholdMember, TransactionRecord } from '../../data/types';
import type { Settlement } from './types';

// The settle-up ledger. For a viewer A and another member B:
//   balance = Σ (B's share of shared purchases A paid)
//           − Σ (A's share of shared purchases B paid)
//           + Σ payments A → B  −  Σ payments B → A
// Positive means B owes A. Pairwise only - no netting across three people,
// which changes who pays whom and confuses households. All sums in cents.

export type Excluded = 'pending' | 'disputed';

export interface LedgerEntry {
  id: string;
  kind: 'purchase' | 'settlement';
  /** ISO datetime. */
  date: string;
  title: string;
  /** Purchase: payer → the other member. Settlement: payer → receiver. */
  fromId: string;
  toId: string;
  /** Purchase total / payment amount. */
  total: number;
  /** Signed change to "what the other member owes the viewer" (+ = they owe more). */
  effect: number;
  /** Running balance after this entry (oldest → newest); excluded entries do not move it. */
  balanceAfter: number;
  /** Left out of the balance until resolved. */
  excluded?: Excluded;
  source: TransactionRecord | Settlement;
}

interface Effect {
  cents: number;
  excluded?: Excluded;
}

function purchaseEffect(t: TransactionRecord, viewerId: string, otherId: string, state: HouseholdState): Effect | null {
  if (t.amount >= 0 || !isShared(t)) return null;
  let cents: number;
  if (t.memberId === viewerId) cents = toCents(shareOf(t, otherId, state.household, state.members));
  else if (t.memberId === otherId) cents = -toCents(shareOf(t, viewerId, state.household, state.members));
  else return null; // a third member paid: that is another pair's business
  if (cents === 0) return null;
  return { cents, excluded: t.disputed ? 'disputed' : t.pending ? 'pending' : undefined };
}

function settlementEffect(s: Settlement, viewerId: string, otherId: string): number | null {
  if (s.fromMemberId === otherId && s.toMemberId === viewerId) return -toCents(s.amount); // they paid me back
  if (s.fromMemberId === viewerId && s.toMemberId === otherId) return toCents(s.amount); // I paid them
  return null;
}

// Timestamps are minute-precision, so a payment recorded right after a purchase
// can share its time: purchases sort first, as the payment usually settles them.
const kindOrder = (kind?: 'purchase' | 'settlement') => (kind === 'settlement' ? 1 : 0);
const byDateAsc = (a: { date: string; id: string; kind?: 'purchase' | 'settlement' }, b: { date: string; id: string; kind?: 'purchase' | 'settlement' }) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : kindOrder(a.kind) - kindOrder(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every purchase and payment between two members, newest first, with running balances from the viewer's side. */
export function selectLedger(state: HouseholdState, settlements: Settlement[], viewerId: string, otherId: string): LedgerEntry[] {
  const nameOf = (id: string) => state.members.find((m) => m.id === id)?.name.split(' ')[0] ?? 'Someone';
  const raw: Array<Omit<LedgerEntry, 'effect' | 'balanceAfter'> & { cents: number }> = [];
  for (const t of state.transactions) {
    const e = purchaseEffect(t, viewerId, otherId, state);
    if (!e) continue;
    raw.push({ id: t.id, kind: 'purchase', date: t.date, title: t.title, fromId: t.memberId, toId: t.memberId === viewerId ? otherId : viewerId, total: Math.abs(t.amount), cents: e.cents, excluded: e.excluded, source: t });
  }
  for (const s of settlements) {
    const cents = settlementEffect(s, viewerId, otherId);
    if (cents === null) continue;
    raw.push({ id: s.id, kind: 'settlement', date: s.date, title: `${nameOf(s.fromMemberId)} paid ${nameOf(s.toMemberId)}`, fromId: s.fromMemberId, toId: s.toMemberId, total: s.amount, cents, source: s });
  }
  raw.sort(byDateAsc);
  let running = 0;
  const entries: LedgerEntry[] = raw.map((r) => {
    if (!r.excluded) running += r.cents;
    const { cents, ...rest } = r;
    return { ...rest, effect: fromCents(cents), balanceAfter: fromCents(running) };
  });
  return entries.reverse();
}

/** Net balance between two members from `a`'s side: positive = `b` owes `a`. */
export function pairNet(state: HouseholdState, settlements: Settlement[], a: string, b: string): number {
  let cents = 0;
  for (const t of state.transactions) {
    const e = purchaseEffect(t, a, b, state);
    if (e && !e.excluded) cents += e.cents;
  }
  for (const s of settlements) cents += settlementEffect(s, a, b) ?? 0;
  return fromCents(cents);
}

/** Shared purchases waiting on confirmation or in dispute, from `a`'s side (same sign convention as `pairNet`). */
export function pairAwaiting(state: HouseholdState, a: string, b: string): number {
  let cents = 0;
  for (const t of state.transactions) {
    const e = purchaseEffect(t, a, b, state);
    if (e?.excluded) cents += e.cents;
  }
  return fromCents(cents);
}

export interface PairBalance {
  from: HouseholdMember;
  to: HouseholdMember;
  amount: number;
}

export interface MyBalance {
  status: 'owes' | 'owed' | 'square';
  /** Absolute net across everyone. */
  amount: number;
  /** The member the balance is mostly with (the only other member in a couple). */
  with: HouseholdMember | null;
  breakdown: Array<{ member: HouseholdMember; net: number; awaiting: number }>;
  /** Signed total of shared purchases not yet counted (awaiting confirmation / disputed). */
  awaiting: number;
}

export interface BalancesData {
  mine: MyBalance;
  /** Every pair that is not square, largest first. */
  pairs: PairBalance[];
  sharedThisMonth: number;
  sharedCountThisMonth: number;
  lastSettlement?: Settlement;
  /** False until the household has ever shared a purchase or recorded a payment. */
  hasAny: boolean;
}

export function selectBalances(state: HouseholdState, settlements: Settlement[], now: Date = new Date()): BalancesData {
  const me = state.currentMemberId;
  const others = state.members.filter((m) => m.id !== me);
  const breakdown = others.map((member) => ({ member, net: pairNet(state, settlements, me, member.id), awaiting: pairAwaiting(state, me, member.id) }));
  const totalCents = breakdown.reduce((acc, b) => acc + toCents(b.net), 0);
  const status: MyBalance['status'] = totalCents > 0 ? 'owed' : totalCents < 0 ? 'owes' : 'square';
  const biggest = [...breakdown].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0];
  const withMember = others.length === 1 ? others[0]! : biggest && biggest.net !== 0 ? biggest.member : null;

  const pairs: PairBalance[] = [];
  for (let i = 0; i < state.members.length; i++) {
    for (let j = i + 1; j < state.members.length; j++) {
      const a = state.members[i]!;
      const b = state.members[j]!;
      const net = pairNet(state, settlements, a.id, b.id);
      if (net > 0) pairs.push({ from: b, to: a, amount: net });
      else if (net < 0) pairs.push({ from: a, to: b, amount: -net });
    }
  }
  pairs.sort((x, y) => y.amount - x.amount);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Bounded on both ends like Activity's month filter: a future-dated synced row must not count as "this month" (QA MF-5).
  const sharedMonth = state.transactions.filter((t) => t.amount < 0 && isShared(t) && !t.pending && !t.disputed && parseIsoDate(t.date) >= monthStart && parseIsoDate(t.date) < nextMonthStart);
  const sortedSettlements = [...settlements].sort(byDateAsc);
  const lastSettlement = sortedSettlements[sortedSettlements.length - 1];

  return {
    mine: { status, amount: fromCents(Math.abs(totalCents)), with: withMember, breakdown, awaiting: fromCents(breakdown.reduce((acc, b) => acc + toCents(b.awaiting), 0)) },
    pairs,
    sharedThisMonth: sharedMonth.reduce((acc, t) => acc - t.amount, 0),
    sharedCountThisMonth: sharedMonth.length,
    lastSettlement,
    hasAny: settlements.length > 0 || state.transactions.some((t) => t.amount < 0 && isShared(t)),
  };
}

/** "Sam owes you" / "You owe Sam" / "All square" for a signed balance from the viewer's side. */
export function balanceSentence(net: number, otherFirstName: string): string {
  if (net > 0) return `${otherFirstName} owes you`;
  if (net < 0) return `You owe ${otherFirstName}`;
  return 'All square';
}
