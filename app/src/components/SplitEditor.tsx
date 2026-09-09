import { useState } from 'react';
import { AmountInput, Button, formatMoneyAuto } from '@budget-app/ui';
import { allocateCents, firstName, fromCents, toCents } from '../data/split';
import type { HouseholdMember, SplitShare } from '../data/types';

interface SplitEditorProps {
  /** The purchase total the shares must add up to. */
  total: number;
  members: HouseholdMember[];
  payerId: string;
  value: SplitShare[];
  onChange: (next: SplitShare[]) => void;
  currency: string;
  /** Shown under the sum line when the save was attempted and the shares do not add up. */
  error?: string;
}

const amountFor = (value: SplitShare[], memberId: string) => value.find((s) => s.memberId === memberId)?.amount ?? 0;

/**
 * Custom split of one purchase: an amount per member (the payer first). With
 * two people, editing one side balances the other; with more, the sum line
 * shows what is still unassigned. Amount fields rather than a slider so the
 * cents stay visible and exact.
 */
export function SplitEditor({ total, members, payerId, value, onChange, currency, error }: SplitEditorProps) {
  // What the field being typed into reads as, null included. The committed
  // split holds numbers, so a cleared field used to bounce back as 0 and could
  // never be emptied (and "35" typed over it showed "035") - the draft keeps
  // null until blur, and only the commit coerces (audit DS-4).
  const [draft, setDraft] = useState<{ memberId: string; amount: number | null } | null>(null);
  const ordered = [...members].sort((a, b) => (a.id === payerId ? -1 : b.id === payerId ? 1 : 0));
  const totalCents = toCents(total);
  const sumCents = value.reduce((acc, s) => acc + toCents(s.amount), 0);
  const diff = totalCents - sumCents;
  const other = members.length === 2 ? members.find((m) => m.id !== payerId) : undefined;

  /** The draft applies only while the committed value still agrees with it (a quick pick or reset from outside wins). */
  const shown = (memberId: string): number | null => {
    const committed = amountFor(value, memberId);
    if (draft && draft.memberId === memberId && toCents(draft.amount ?? 0) === toCents(committed)) return draft.amount;
    return committed;
  };

  const set = (memberId: string, amount: number | null) => {
    setDraft({ memberId, amount });
    const cents = Math.max(0, toCents(amount ?? 0));
    const next = members.map((m) => ({ memberId: m.id, amount: m.id === memberId ? fromCents(cents) : amountFor(value, m.id) }));
    if (members.length === 2) {
      const otherId = members.find((m) => m.id !== memberId)!.id;
      const rest = Math.max(0, totalCents - cents);
      next.forEach((s) => {
        if (s.memberId === otherId) s.amount = fromCents(rest);
      });
    }
    onChange(next);
  };

  const equal = () => {
    setDraft(null);
    onChange(
      allocateCents(
        totalCents,
        members.map((m) => ({ memberId: m.id, weight: 1 })),
        payerId,
      ).map((a) => ({ memberId: a.memberId, amount: fromCents(a.cents) })),
    );
  };

  const allOther = () => {
    if (!other) return;
    setDraft(null);
    onChange(members.map((m) => ({ memberId: m.id, amount: m.id === other.id ? total : 0 })));
  };

  return (
    <div className="split-editor" role="group" aria-label="Custom split">
      <div className="split-editor__quick">
        <Button size="sm" variant="ghost" onClick={equal}>
          {members.length === 2 ? 'Half each' : 'Equal'}
        </Button>
        {other && (
          <Button size="sm" variant="ghost" onClick={allOther}>
            All {firstName(other.name)}'s
          </Button>
        )}
      </div>
      <div className="split-editor__fields">
        {ordered.map((m) => (
          <AmountInput
            key={m.id}
            label={`${firstName(m.name)}${m.id === payerId ? ' (paid)' : ''}`}
            currency={currency}
            size="sm"
            value={shown(m.id)}
            onValueChange={(v) => set(m.id, v)}
            onBlur={() => setDraft((d) => (d?.memberId === m.id ? null : d))}
            fullWidth
          />
        ))}
      </div>
      <span className={`split-editor__sum bdg-text-xs ${diff === 0 ? 'bdg-text-muted' : 'bdg-text-negative'}`}>
        {diff === 0
          ? `Adds up to ${formatMoneyAuto(total, { currency })}`
          : `Adds up to ${formatMoneyAuto(fromCents(sumCents), { currency })} - ${formatMoneyAuto(fromCents(Math.abs(diff)), { currency })} ${diff > 0 ? 'short' : 'over'}`}
        {error && diff !== 0 ? ` · ${error}` : ''}
      </span>
    </div>
  );
}
