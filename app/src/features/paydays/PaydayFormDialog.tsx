import { useEffect, useMemo, useState } from 'react';
import { AmountInput, Button, Checkbox, Dialog, Select, TextField } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { memberOptionsFor } from '../../components/memberOptions';
import { QuickDateButtons } from '../../components/QuickDateButtons';
import { useHousehold } from '../../data/store';
import { accountOptions, useAccounts } from '../accounts';
import { isValidIsoDate, todayIso } from '../../lib/dates';
import { FREQUENCIES, FREQUENCY_LABEL, addFrequency, dayOfMonth, type Frequency } from '../../lib/frequency';
import type { IncomeSchedule, IncomeScheduleInput } from './types';

interface PaydayFormDialogProps {
  open: boolean;
  /** Editing an existing payday; omit to add a new one. */
  payday?: IncomeSchedule;
  onClose: () => void;
  onSubmit: (input: IncomeScheduleInput) => void;
}

interface FormState {
  name: string;
  amount: number | null;
  frequency: Frequency;
  nextDate: string;
  /** Travels with nextDate: picking a date re-anchors to it, "Skip one" advances along it (QA MF-2). */
  anchorDay: number;
  memberId: string;
  categoryId: string;
  /** '' = not tracked. */
  accountId: string;
  variable: boolean;
  note: string;
}

/** Add / edit a payday: what arrives, how often, when next, and whose it is. */
export function PaydayFormDialog({ open, payday, onClose, onSubmit }: PaydayFormDialogProps) {
  const { categories, members, currentMemberId, household } = useHousehold();
  const { accounts } = useAccounts();
  const incomeCategories = useMemo(() => categories.filter((c) => c.kind === 'income'), [categories]);
  // Editing a payday landing in a since-archived account keeps that account pickable rather than silently dropping it.
  const payAccountOptions = useMemo(() => {
    const options = accountOptions(payday?.accountId ? accounts.map((a) => (a.id === payday.accountId ? { ...a, archived: undefined } : a)) : accounts);
    // A since-DELETED account (gone, not archived): surface it instead of an
    // empty-looking picker that silently re-saves the dead id (QA7 B-3).
    if (payday?.accountId && !accounts.some((a) => a.id === payday.accountId)) options.push({ value: payday.accountId, label: 'An account since removed' });
    return options.length > 0 ? [{ value: '', label: 'Not tracked' }, ...options] : [];
  }, [accounts, payday?.accountId]);

  const initial = (): FormState =>
    payday
      ? {
          name: payday.name,
          amount: payday.amount,
          frequency: payday.frequency,
          nextDate: payday.nextDate,
          anchorDay: payday.anchorDay ?? dayOfMonth(payday.nextDate),
          memberId: payday.memberId,
          categoryId: payday.categoryId,
          accountId: payday.accountId ?? '',
          variable: !!payday.variable,
          note: payday.note ?? '',
        }
      : { name: '', amount: null, frequency: 'monthly', nextDate: todayIso(), anchorDay: dayOfMonth(todayIso()), memberId: currentMemberId, categoryId: incomeCategories[0]?.id ?? '', accountId: '', variable: false, note: '' };

  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial());
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payday?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  // Same anchor rules as the bill form: picks re-anchor, Skip advances along the
  // anchor (kept even when the step lands clamped), an unchanged date keeps the
  // stored anchor (QA MF-2). Re-picking the STORED date keeps the stored anchor
  // too, so Sep 30 / anchor 31 -> Skip one -> Save no longer drifts to 30 (audit UX-10).
  const storedAnchor = payday ? payday.anchorDay ?? dayOfMonth(payday.nextDate) : undefined;
  const pickDate = (value: string) =>
    setForm((f) => ({ ...f, nextDate: value, anchorDay: payday && value === payday.nextDate ? storedAnchor! : isValidIsoDate(value) ? dayOfMonth(value) : f.anchorDay }));
  const anchor = payday && form.nextDate === payday.nextDate ? storedAnchor! : form.anchorDay;

  const nameError = submitted && !form.name.trim() ? 'Give it a name, like "Salary" or "Shifts"' : undefined;
  const amountError =
    submitted && !(form.amount && form.amount > 0)
      ? form.variable
        ? 'Enter a typical amount - you can adjust it each time'
        : 'Enter an amount greater than zero'
      : submitted && overCap(form.amount)
        ? capMessage(household.currency)
        : undefined;
  const dateError =
    submitted && !isValidIsoDate(form.nextDate) ? 'Pick the next day it arrives' : submitted && form.nextDate < '2000-01-01' ? 'That year looks wrong - use a date after 2000' : undefined;
  const categoryError = submitted && !form.categoryId ? 'Pick an income category' : undefined;

  const save = () => {
    setSubmitted(true);
    if (!form.name.trim() || !(form.amount && form.amount > 0) || overCap(form.amount) || !isValidIsoDate(form.nextDate) || form.nextDate < '2000-01-01' || !form.categoryId) return;
    onSubmit({ name: form.name, amount: form.amount, frequency: form.frequency, nextDate: form.nextDate, anchorDay: anchor, memberId: form.memberId, categoryId: form.categoryId, accountId: form.accountId, variable: form.variable, note: form.note });
  };

  const editing = !!payday;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${payday.name}` : 'Add a payday'}
      description={editing ? 'Changes apply from the next expected date.' : 'The Overview counts down to it and plans your spending until then.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? 'Save changes' : 'Add payday'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <TextField label="Name" placeholder="Salary, shifts, freelance…" value={form.name} onChange={(e) => set('name', e.target.value)} error={nameError} fullWidth autoFocus={!editing} />
        <AmountInput label={form.variable ? 'Typical amount' : 'Amount'} currency={household.currency} value={form.amount} onValueChange={(v) => set('amount', v)} error={amountError} fullWidth />
        <Checkbox label="Amount varies" description="We'll ask for the actual amount each time it arrives." checked={form.variable} onChange={(e) => set('variable', e.target.checked)} />
        <Select label="Repeats" options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} value={form.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)} fullWidth />
        <div className="bdg-stack bdg-gap-2">
          <TextField type="date" label="Next payday" value={form.nextDate} onChange={(e) => pickDate(e.target.value)} error={dateError} hint={editing ? undefined : 'It rolls forward each time you mark it received.'} required fullWidth />
          {/* Skip advances along the anchor and is not a re-pick: set, not pickDate (QA MF-2). */}
          <QuickDateButtons onPick={pickDate} onSkip={editing && isValidIsoDate(form.nextDate) ? () => set('nextDate', addFrequency(form.nextDate, form.frequency, anchor)) : undefined} />
        </div>
        <Select label="Whose" options={memberOptionsFor(members, form.memberId)} value={form.memberId} onChange={(e) => set('memberId', e.target.value)} fullWidth />
        <Select label="Logged as" options={incomeCategories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} placeholder="Choose an income category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={categoryError} fullWidth />
        {payAccountOptions.length > 0 && (
          <Select label="Paid into" options={payAccountOptions} value={form.accountId} onChange={(e) => set('accountId', e.target.value)} hint="Each pay you mark received lands in that account's balance." fullWidth />
        )}
        <TextField label="Note" placeholder="Optional" value={form.note} onChange={(e) => set('note', e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
