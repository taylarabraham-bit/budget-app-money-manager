import { useEffect, useMemo, useState } from 'react';
import { AmountInput, Button, Checkbox, Dialog, Select, Tabs, TextField } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { memberOptionsFor } from '../../components/memberOptions';
import { QuickDateButtons } from '../../components/QuickDateButtons';
import { useHousehold } from '../../data/store';
import { accountOptions, useAccounts } from '../accounts';
import { dayOfMonth } from '../../lib/frequency';
import { addFrequency, isValidIsoDate, todayIso } from './dates';
import { useBills } from './store';
import { BILL_FREQUENCIES, FREQUENCY_LABEL, type Bill, type BillFrequency, type BillInput, type BillKind } from './types';

interface BillFormDialogProps {
  open: boolean;
  /** Editing an existing bill; omit to add a new one. */
  bill?: Bill;
  /** What a new bill starts as. Bills are the default; "subscription" is the tag for services worth reviewing. */
  initialKind?: BillKind;
  onClose: () => void;
  onSubmit: (input: BillInput) => void;
}

interface FormState {
  kind: BillKind;
  name: string;
  amount: number | null;
  frequency: BillFrequency;
  nextDue: string;
  /** Travels with nextDue: picking a date re-anchors to it, "Skip one" advances along it (QA MF-2). */
  anchorDay: number;
  categoryId: string;
  memberId: string;
  shared: boolean;
  /** '' = not tracked. */
  accountId: string;
  note: string;
}

const DEFAULT_CATEGORY: Record<BillKind, string> = { subscription: 'c_subs', bill: 'c_home' };

/**
 * Add / edit a recurring bill, or a subscription (a bill tagged so the household
 * can review its subscriptions together and decide what is worth keeping). The due date is a real date
 * picker (native on Android and Windows) with quick picks beside it; marking
 * the bill paid later rolls that date forward by the chosen frequency.
 */
export function BillFormDialog({ open, bill, initialKind = 'bill', onClose, onSubmit }: BillFormDialogProps) {
  const { categories, members, currentMemberId, household } = useHousehold();
  const { accounts } = useAccounts();
  const { bills } = useBills();
  const expenseCategories = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  // Editing a bill on a since-archived account keeps that account pickable rather than silently dropping it.
  const payAccountOptions = useMemo(() => {
    const options = accountOptions(bill?.accountId ? accounts.map((a) => (a.id === bill.accountId ? { ...a, archived: undefined } : a)) : accounts);
    // A since-DELETED account (gone, not archived): surface it instead of an
    // empty-looking picker that silently re-saves the dead id (QA7 B-3).
    if (bill?.accountId && !accounts.some((a) => a.id === bill.accountId)) options.push({ value: bill.accountId, label: 'An account since removed' });
    return options.length > 0 ? [{ value: '', label: 'Not tracked' }, ...options] : [];
  }, [accounts, bill?.accountId]);

  const defaultCategory = (kind: BillKind) => expenseCategories.find((c) => c.id === DEFAULT_CATEGORY[kind])?.id ?? expenseCategories[0]?.id ?? '';

  const initial = (): FormState =>
    bill
      ? {
          kind: bill.kind,
          name: bill.name,
          amount: bill.amount,
          frequency: bill.frequency,
          nextDue: bill.nextDue,
          anchorDay: bill.anchorDay ?? dayOfMonth(bill.nextDue),
          categoryId: bill.categoryId,
          memberId: bill.memberId,
          shared: !!bill.shared,
          accountId: bill.accountId ?? '',
          note: bill.note ?? '',
        }
      : {
          kind: initialKind,
          name: '',
          amount: null,
          frequency: 'monthly',
          nextDue: todayIso(),
          anchorDay: dayOfMonth(todayIso()),
          categoryId: defaultCategory(initialKind),
          memberId: currentMemberId,
          shared: false,
          accountId: '',
          note: '',
        };

  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);

  // Fresh form every time the dialog opens (and for whichever bill it opens on).
  useEffect(() => {
    if (open) {
      setForm(initial());
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  // A PICKED date re-anchors to its day; "Skip one" goes through set() so the anchor
  // it advanced along is kept even when the step lands clamped (Mar 31 -> Apr 30
  // must stay anchored on 31). A date that ends up back at the stored value keeps
  // the stored anchor - in the form state too, not only in `anchor` below, so
  // re-picking Sep 30 (anchor 31) and then "Skip one" no longer saves 30 (QA MF-2, audit UX-10).
  const storedAnchor = bill ? bill.anchorDay ?? dayOfMonth(bill.nextDue) : undefined;
  const pickDate = (value: string) =>
    setForm((f) => ({ ...f, nextDue: value, anchorDay: bill && value === bill.nextDue ? storedAnchor! : isValidIsoDate(value) ? dayOfMonth(value) : f.anchorDay }));
  const anchor = bill && form.nextDue === bill.nextDue ? storedAnchor! : form.anchorDay;

  const switchKind = (next: string) => {
    const kind: BillKind = next === 'bill' ? 'bill' : 'subscription';
    setForm((f) => ({
      ...f,
      kind,
      // Keep a category the user picked on purpose; only swap the default one.
      categoryId: f.categoryId === defaultCategory(f.kind) ? defaultCategory(kind) : f.categoryId,
    }));
  };

  // A second "Netflix" is indistinguishable everywhere it is listed (audit UX-14).
  const duplicateName = bills.some((b) => b.id !== bill?.id && b.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const nameError =
    submitted && !form.name.trim() ? 'Give it a name, like "Netflix" or "Rent"' : submitted && duplicateName ? 'A bill or subscription with that name already exists' : undefined;
  // The cap through the shared constant, and enforced on save, not only displayed (audit MON-8 / UX-6).
  const amountError = submitted && !(form.amount && form.amount > 0) ? 'Enter an amount greater than zero' : submitted && overCap(form.amount) ? capMessage(household.currency) : undefined;
  const dateError =
    submitted && !isValidIsoDate(form.nextDue) ? 'Pick the date it is next due' : submitted && form.nextDue < '2000-01-01' ? 'That year looks wrong - use a date after 2000' : undefined;
  const categoryError = submitted && !form.categoryId ? 'Pick a category so it counts against a budget' : undefined;

  const save = () => {
    setSubmitted(true);
    if (!form.name.trim() || duplicateName || !(form.amount && form.amount > 0) || overCap(form.amount) || !isValidIsoDate(form.nextDue) || form.nextDue < '2000-01-01' || !form.categoryId) return;
    onSubmit({
      kind: form.kind,
      name: form.name,
      amount: form.amount,
      frequency: form.frequency,
      nextDue: form.nextDue,
      anchorDay: anchor,
      categoryId: form.categoryId,
      memberId: form.memberId,
      shared: form.shared,
      accountId: form.accountId,
      note: form.note,
    });
  };

  const categoryOptions = expenseCategories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  // A since-removed payer stays visible rather than the picker showing the first member over a ghost id (audit UX-5).
  const memberOptions = memberOptionsFor(members, form.memberId);
  const frequencyOptions = BILL_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }));
  const editing = !!bill;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${bill.name}` : form.kind === 'bill' ? 'Add a bill' : 'Add a subscription'}
      description={editing ? 'Changes apply from the next due date.' : 'We will remind you when it is due and roll the date forward each time you pay it.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? 'Save changes' : form.kind === 'bill' ? 'Add bill' : 'Add subscription'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <Tabs
          variant="segmented"
          fullWidth
          aria-label="Type"
          value={form.kind}
          onChange={switchKind}
          items={[
            { value: 'bill', label: 'Bill' },
            { value: 'subscription', label: 'Subscription' },
          ]}
        />
        <TextField
          label="Name"
          placeholder={form.kind === 'bill' ? 'Rent, electricity, insurance…' : 'Netflix, Spotify, gym…'}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={nameError}
          fullWidth
          autoFocus={!editing}
        />
        <AmountInput label="Amount" currency={household.currency} value={form.amount} onValueChange={(v) => set('amount', v)} error={amountError} fullWidth />
        <Select label="Repeats" options={frequencyOptions} value={form.frequency} onChange={(e) => set('frequency', e.target.value as BillFrequency)} fullWidth />
        <div className="bdg-stack bdg-gap-2">
          <TextField
            type="date"
            label="Next due date"
            value={form.nextDue}
            onChange={(e) => pickDate(e.target.value)}
            error={dateError}
            hint={editing ? undefined : 'The next day it is due. It rolls forward each time you mark it paid.'}
            required
            fullWidth
          />
          {/* Skipping advances along the schedule's anchor (Sep 30 with anchor 31 → Oct 31), and is not a re-pick: set, not pickDate. */}
          <QuickDateButtons
            aria-label="Quick due dates"
            onPick={pickDate}
            onSkip={editing && isValidIsoDate(form.nextDue) ? () => set('nextDue', addFrequency(form.nextDue, form.frequency, anchor)) : undefined}
          />
        </div>
        <Select label="Category" options={categoryOptions} placeholder="Choose a category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={categoryError} fullWidth />
        <Select label="Paid by" options={memberOptions} value={form.memberId} onChange={(e) => set('memberId', e.target.value)} fullWidth />
        {payAccountOptions.length > 0 && (
          <Select label="Paid from" options={payAccountOptions} value={form.accountId} onChange={(e) => set('accountId', e.target.value)} hint="Each payment you log moves that account's balance." fullWidth />
        )}
        <Checkbox label="Split with household" description="Shared bills count towards everyone's budget." checked={form.shared} onChange={(e) => set('shared', e.target.checked)} />
        <TextField label="Note" placeholder="Optional" value={form.note} onChange={(e) => set('note', e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
