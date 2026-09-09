import { TransactionItem, formatMoneyAuto } from '@budget-app/ui';
import { firstName } from '../../data/split';
import type { Category, HouseholdMember } from '../../data/types';
import { dateOnly, formatShortDate } from '../../lib/dates';
import { balanceSentence, type LedgerEntry } from './selectors';
import { METHOD_LABEL, type Settlement } from './types';

interface LedgerRowProps {
  entry: LedgerEntry;
  viewerId: string;
  otherName: string;
  members: HouseholdMember[];
  categories: Category[];
  currency: string;
  onClick: () => void;
}

/** One line of the settle-up history: a shared purchase (its effect on the balance) or a payment. */
export function LedgerRow({ entry, viewerId, otherName, members, categories, currency, onClick }: LedgerRowProps) {
  const nameOf = (id: string) => firstName(members.find((m) => m.id === id)?.name ?? 'Someone');
  const when = formatShortDate(dateOnly(entry.date));
  const balanceNote = entry.excluded
    ? entry.excluded === 'disputed'
      ? 'Not counted · disputed'
      : 'Not counted · awaiting confirmation'
    : `Balance: ${balanceSentence(entry.balanceAfter, otherName)}${entry.balanceAfter !== 0 ? ` ${formatMoneyAuto(Math.abs(entry.balanceAfter), { currency })}` : ''}`;

  if (entry.kind === 'settlement') {
    const s = entry.source as Settlement;
    const you = s.fromMemberId === viewerId ? 'You' : nameOf(s.fromMemberId);
    const them = s.toMemberId === viewerId ? 'you' : nameOf(s.toMemberId);
    return (
      <TransactionItem
        title={`${you} paid ${them}`}
        amount={entry.effect}
        currency={currency}
        icon="🤝"
        category={[s.method ? METHOD_LABEL[s.method] : undefined, s.note].filter(Boolean).join(' · ') || 'Payment'}
        when={when}
        note={balanceNote}
        onClick={onClick}
      />
    );
  }

  const category = categories.find((c) => c.id === (entry.source as { categoryId: string }).categoryId);
  const payer = entry.fromId === viewerId ? 'you' : nameOf(entry.fromId);
  const counterpart = entry.toId === viewerId ? 'your' : `${nameOf(entry.toId)}'s`;
  return (
    <TransactionItem
      title={entry.title}
      amount={entry.effect}
      currency={currency}
      icon={category?.icon ?? '🧾'}
      category={`Paid by ${payer} · ${counterpart} share ${formatMoneyAuto(Math.abs(entry.effect), { currency })} of ${formatMoneyAuto(entry.total, { currency })}`}
      when={when}
      note={balanceNote}
      pending={!!entry.excluded}
      onClick={onClick}
    />
  );
}
