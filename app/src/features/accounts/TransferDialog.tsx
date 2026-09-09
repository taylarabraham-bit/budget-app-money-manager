import { useEffect, useState } from 'react';
import { AmountInput, Button, Dialog, Select, TextField, formatMoneyAuto } from '@budget-app/ui';
import { MAX_AMOUNT, fromCents, toCents } from '../../data/split';
import { useHousehold } from '../../data/store';
import { clampToNow, combineDateTime, isValidIsoDate, toHhmm, todayIso } from '../../lib/dates';
import { KIND_ICON, type Account, type TransferInput } from './types';

interface TransferDialogProps {
  open: boolean;
  accounts: Account[];
  /** Pre-picks the ends: paying a card opens with `toAccountId` set to it. */
  preset?: { fromAccountId?: string; toAccountId?: string };
  /** Current derived balance per account id, for the overdraw heads-up. */
  balanceCentsOf?: (id: string) => number | undefined;
  onClose: () => void;
  /** Returns false when the store rejected it (shouldn't happen past validation). */
  onSubmit: (input: TransferInput) => void;
}

const OUTSIDE = '';

/**
 * Move money between accounts, or in/out of them: pay the credit card, top
 * up savings, deposit cash. Not spending and not income - it never touches
 * budgets, only where the money sits.
 */
export function TransferDialog({ open, accounts, preset, balanceCentsOf, onClose, onSubmit }: TransferDialogProps) {
  const { household, currentMemberId } = useHousehold();

  const firstBank = accounts.find((a) => !a.archived && a.kind !== 'credit')?.id ?? OUTSIDE;
  const initial = () => ({
    // Paying a card: default the money to come from the first bank account.
    from: preset?.fromAccountId ?? (preset?.toAccountId ? firstBank : OUTSIDE),
    to: preset?.toAccountId ?? OUTSIDE,
    amount: null as number | null,
    date: todayIso(),
    note: '',
  });
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial());
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.fromAccountId, preset?.toAccountId]);

  const set = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) => setForm((f) => ({ ...f, [key]: value }));

  const toCard = accounts.find((a) => a.id === form.to)?.kind === 'credit';
  const endsError =
    submitted && form.from === OUTSIDE && form.to === OUTSIDE
      ? 'Pick at least one account'
      : submitted && form.from !== OUTSIDE && form.from === form.to
        ? 'Pick two different accounts'
        : undefined;
  const amountError =
    submitted && !(form.amount && form.amount > 0)
      ? 'Enter an amount greater than zero'
      : submitted && form.amount && form.amount > MAX_AMOUNT
        ? `That looks too big - amounts up to ${formatMoneyAuto(MAX_AMOUNT, { currency: household.currency })} are supported`
        : undefined;
  const dateError = submitted && (!isValidIsoDate(form.date) || form.date > todayIso()) ? 'Pick today or an earlier day' : undefined;
  // Heads-up, not a block: a real account can genuinely overdraw, but a
  // fat-fingered amount should not sail through in silence (QA7 L-odft).
  const fromAccount = accounts.find((a) => a.id === form.from);
  const fromBalanceCents = form.from !== OUTSIDE ? balanceCentsOf?.(form.from) : undefined;
  const overdrawHint =
    fromAccount && fromAccount.kind !== 'credit' && fromBalanceCents !== undefined && form.amount != null && toCents(form.amount) > fromBalanceCents
      ? `More than the ${formatMoneyAuto(fromCents(Math.max(0, fromBalanceCents)), { currency: household.currency })} in ${fromAccount.name} - it would go overdrawn.`
      : undefined;

  const save = () => {
    setSubmitted(true);
    if ((form.from === OUTSIDE && form.to === OUTSIDE) || (form.from !== OUTSIDE && form.from === form.to)) return;
    if (!(form.amount && form.amount > 0 && form.amount <= MAX_AMOUNT)) return;
    if (!isValidIsoDate(form.date) || form.date > todayIso()) return;
    onSubmit({
      fromAccountId: form.from || undefined,
      toAccountId: form.to || undefined,
      amount: form.amount,
      date: clampToNow(combineDateTime(form.date, form.date === todayIso() ? toHhmm(new Date()) : '12:00')),
      memberId: currentMemberId,
      note: form.note,
    });
  };

  // Archived accounts stay OUT of the pickers - except one already selected
  // (paying an archived card from its sheet): hiding it made the select render
  // "Outside" while the saved transfer went into the archived card (QA7 A-9).
  const endOptions = (exclude: string, current: string) => [
    { value: OUTSIDE, label: 'Outside these accounts (cash, another bank)' },
    ...accounts.filter((a) => (!a.archived || a.id === current) && (a.id !== exclude || exclude === OUTSIDE)).map((a) => ({ value: a.id, label: `${KIND_ICON[a.kind]} ${a.name}${a.archived ? ' (archived)' : ''}` })),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={toCard ? 'Pay the card' : 'Move money'}
      description={toCard ? 'A payment lowers what the card owes and comes out of the account it was paid from.' : 'Transfers change where money sits - they never count as spending or income.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{toCard ? 'Log payment' : 'Move it'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <Select label="From" options={endOptions(form.to, form.from)} value={form.from} onChange={(e) => set('from', e.target.value)} error={endsError} fullWidth />
        <Select label="To" options={endOptions(form.from, form.to)} value={form.to} onChange={(e) => set('to', e.target.value)} fullWidth />
        <AmountInput label="Amount" currency={household.currency} value={form.amount} onValueChange={(v) => set('amount', v)} error={amountError} hint={overdrawHint} fullWidth autoFocus={!!preset} />
        <TextField type="date" label="When" value={form.date} max={todayIso()} onChange={(e) => set('date', e.target.value)} error={dateError} fullWidth />
        <TextField label="Note" placeholder="Optional" value={form.note} onChange={(e) => set('note', e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
