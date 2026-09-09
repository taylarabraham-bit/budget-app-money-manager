import { useEffect, useState } from 'react';
import { AmountInput, Button, Dialog, Select, Tabs, TextField, formatMoneyAuto } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { memberOptionsFor } from '../../components/memberOptions';
import { MAX_AMOUNT, toCents } from '../../data/split';
import { useHousehold } from '../../data/store';
import { useAccounts } from './store';
import { KIND_LABEL, type Account, type AccountInput, type AccountKind } from './types';

interface AccountFormDialogProps {
  open: boolean;
  /** Editing an existing account; omit to add a new one. */
  account?: Account;
  /** Edit mode: the balance derived right now (signed for banks; owed for cards, negative = in credit), shown read-only beside the starting point. */
  currentBalance?: number;
  initialKind?: AccountKind;
  onClose: () => void;
  onSubmit: (input: AccountInput) => void;
}

interface FormState {
  kind: AccountKind;
  name: string;
  openingBalance: number | null;
  /** '' = joint. */
  memberId: string;
  note: string;
  // Credit terms as the fields hold them; parsed on save.
  apr: string;
  creditLimit: number | null;
  statementDay: string;
  dueDays: string;
  minPercent: string;
  minFloor: number | null;
}

const NAME_PLACEHOLDER: Record<AccountKind, string> = {
  everyday: 'Joint everyday, spending account…',
  savings: 'House deposit saver, emergency fund…',
  credit: 'Platinum Rewards Visa, store card…',
};

const numberOrUndefined = (text: string): number | undefined => {
  const v = Number(text.trim());
  return text.trim() === '' || !Number.isFinite(v) ? undefined : v;
};

/**
 * Add / edit a bank account or credit card. Credit cards carry the interest
 * terms - APR, statement day, grace period, minimum payment - that power the
 * "what does it cost if we don't pay it all?" estimates on the card's sheet.
 */
export function AccountFormDialog({ open, account, currentBalance, initialKind = 'everyday', onClose, onSubmit }: AccountFormDialogProps) {
  const { household, members } = useHousehold();
  const { accounts } = useAccounts();

  const initial = (): FormState =>
    account
      ? {
          kind: account.kind,
          name: account.name,
          // Cards are edited as positive "owing"; bank openings are SIGNED -
          // seeding abs() here flipped an overdrawn account positive on any
          // unrelated edit (QA7 A-1).
          openingBalance: account.openingBalance === 0 ? null : account.kind === 'credit' ? Math.abs(account.openingBalance) : account.openingBalance,
          memberId: account.memberId ?? '',
          note: account.note ?? '',
          apr: account.apr !== undefined ? String(account.apr) : '',
          creditLimit: account.creditLimit ?? null,
          statementDay: account.statementDay !== undefined ? String(account.statementDay) : '',
          dueDays: account.dueDaysAfterStatement !== undefined ? String(account.dueDaysAfterStatement) : '',
          minPercent: account.minPaymentPercent !== undefined ? String(account.minPaymentPercent) : '',
          minFloor: account.minPaymentFloor ?? null,
        }
      : {
          kind: initialKind,
          name: '',
          openingBalance: null,
          memberId: '',
          note: '',
          apr: '',
          creditLimit: null,
          statementDay: '',
          // The commonest grace period; editable, and only saved for credit cards.
          dueDays: '25',
          minPercent: '',
          minFloor: null,
        };

  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);

  // Fresh form every time the dialog opens (and for whichever account it opens on).
  useEffect(() => {
    if (open) {
      setForm(initial());
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const editing = !!account;
  const credit = form.kind === 'credit';
  const apr = numberOrUndefined(form.apr);
  const statementDay = numberOrUndefined(form.statementDay);
  const dueDays = numberOrUndefined(form.dueDays);
  const minPercent = numberOrUndefined(form.minPercent);

  // A second "Visa" is indistinguishable in every picker (audit UX-14).
  const duplicateName = accounts.some((a) => a.id !== account?.id && a.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  // The cap in the household's currency, not a dollar literal (audit UI-17).
  const cap = formatMoneyAuto(MAX_AMOUNT, { currency: household.currency });

  // ONE validator, shared by render and save. The old split re-derived some
  // checks inside save() but read the balance one from stale render state, so
  // the first click sailed past the $1,000,000 cap - and the credit amount
  // fields had no bounds at all (QA7 A-2).
  const problems = () => ({
    name: !form.name.trim() ? 'Give it a name, like the bank calls it' : duplicateName ? 'You already have an account with that name' : undefined,
    balance: overCap(form.openingBalance) ? capMessage(household.currency) : undefined,
    apr: credit && form.apr.trim() !== '' && (apr === undefined || apr < 0 || apr > 100) ? 'A yearly rate between 0 and 100, like 20.99' : undefined,
    statementDay: credit && form.statementDay.trim() !== '' && (statementDay === undefined || !Number.isInteger(statementDay) || statementDay < 1 || statementDay > 31) ? 'A day of the month, 1-31' : undefined,
    dueDays: credit && form.dueDays.trim() !== '' && (dueDays === undefined || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > 90) ? 'Days after the statement, 0-90' : undefined,
    minPercent: credit && form.minPercent.trim() !== '' && (minPercent === undefined || minPercent < 0 || minPercent > 100) ? 'A percentage between 0 and 100' : undefined,
    creditLimit: credit && form.creditLimit !== null && (form.creditLimit < 0 || overCap(form.creditLimit)) ? `A limit from 0 up to ${cap}` : undefined,
    minFloor: credit && form.minFloor !== null && (form.minFloor < 0 || overCap(form.minFloor)) ? `An amount from 0 up to ${cap}` : undefined,
  });
  const errors = problems();
  const nameError = submitted ? errors.name : undefined;
  const balanceError = submitted ? errors.balance : undefined;
  const aprError = submitted ? errors.apr : undefined;
  const statementDayError = submitted ? errors.statementDay : undefined;
  const dueDaysError = submitted ? errors.dueDays : undefined;
  const minPercentError = submitted ? errors.minPercent : undefined;
  const creditLimitError = submitted ? errors.creditLimit : undefined;
  const minFloorError = submitted ? errors.minFloor : undefined;

  const save = () => {
    setSubmitted(true);
    if (Object.values(problems()).some(Boolean)) return;
    onSubmit({
      kind: form.kind,
      name: form.name,
      memberId: form.memberId,
      openingBalance: form.openingBalance ?? 0,
      note: form.note,
      apr: credit ? apr : undefined,
      creditLimit: credit ? form.creditLimit ?? undefined : undefined,
      statementDay: credit ? statementDay : undefined,
      dueDaysAfterStatement: credit ? dueDays : undefined,
      minPaymentPercent: credit ? minPercent : undefined,
      minPaymentFloor: credit ? form.minFloor ?? undefined : undefined,
    });
  };

  // A since-removed owner stays visible rather than the picker showing "Joint" over a ghost id (audit UX-5).
  const memberOptions = [{ value: '', label: 'Joint - the household’s' }, ...memberOptionsFor(members, form.memberId)];
  // Edit mode: the field is the STARTING point, never today's balance - labelling
  // it "Balance today" invited "correcting" it to the derived figure, which then
  // double-counted everything logged since (audit LV-1). The derived balance sits
  // beside it, read-only, so the two are never confused.
  const showCurrent = editing && currentBalance !== undefined;
  const currentInCredit = credit && currentBalance !== undefined && toCents(currentBalance) < 0;
  const currentLabel = credit ? (currentInCredit ? 'In credit now' : 'Owing now') : 'Balance now';
  const currentText = currentBalance === undefined ? '' : formatMoneyAuto(credit ? Math.abs(currentBalance) : currentBalance, { currency: household.currency });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${account.name}` : 'Add an account'}
      description={editing ? 'The balance stays derived from what you log; only the starting point and terms change here.' : 'Purchases, income, bills and transfers can point at it, so the balance tracks itself.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? 'Save changes' : `Add ${KIND_LABEL[form.kind].toLowerCase()}`}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <Tabs
          variant="segmented"
          fullWidth
          aria-label="Account type"
          value={form.kind}
          onChange={(v) => set('kind', v as AccountKind)}
          items={[
            { value: 'everyday', label: 'Everyday' },
            { value: 'savings', label: 'Savings' },
            { value: 'credit', label: 'Credit card' },
          ]}
        />
        <TextField label="Name" placeholder={NAME_PLACEHOLDER[form.kind]} value={form.name} onChange={(e) => set('name', e.target.value)} error={nameError} fullWidth autoFocus={!editing} />
        <div className={showCurrent ? 'bdg-grid-2' : undefined}>
          <AmountInput
            label={editing ? (credit ? 'Started at' : 'Starting balance') : credit ? 'Owing on it today' : 'Balance today'}
            currency={household.currency}
            value={form.openingBalance}
            onValueChange={(v) => set('openingBalance', v)}
            error={balanceError}
            hint={editing ? 'The starting point; everything logged since is counted on top of it. Change it only if the starting point was wrong.' : 'The starting point; everything you log from here moves it.'}
            fullWidth
          />
          {showCurrent && <TextField label={currentLabel} value={currentText} readOnly hint="Worked out from what you have logged." fullWidth />}
        </div>
        <Select label="Whose is it" options={memberOptions} value={form.memberId} onChange={(e) => set('memberId', e.target.value)} fullWidth />
        {credit && (
          <div className="bdg-stack bdg-gap-2">
            <span className="bdg-text-sm bdg-font-medium">Interest terms</span>
            <span className="bdg-text-xs bdg-text-muted">From the card's statement or app. The rate is what lets us estimate the cost of not paying in full.</span>
            <div className="bdg-grid-2">
              <TextField label="Interest rate (% p.a.)" type="number" inputMode="decimal" placeholder="20.99" value={form.apr} onChange={(e) => set('apr', e.target.value)} error={aprError} fullWidth />
              <AmountInput label="Credit limit" currency={household.currency} value={form.creditLimit} onValueChange={(v) => set('creditLimit', v)} error={creditLimitError} fullWidth />
            </div>
            <div className="bdg-grid-2">
              <TextField
                label="Statement closes on day"
                type="number"
                inputMode="numeric"
                placeholder="12"
                value={form.statementDay}
                onChange={(e) => set('statementDay', e.target.value)}
                error={statementDayError}
                hint="Day of the month the statement is issued."
                fullWidth
              />
              <TextField
                label="Due days after statement"
                type="number"
                inputMode="numeric"
                placeholder="25"
                value={form.dueDays}
                onChange={(e) => set('dueDays', e.target.value)}
                error={dueDaysError}
                hint="The interest-free grace period."
                fullWidth
              />
            </div>
            <div className="bdg-grid-2">
              <TextField
                label="Minimum payment (%)"
                type="number"
                inputMode="decimal"
                placeholder="2"
                value={form.minPercent}
                onChange={(e) => set('minPercent', e.target.value)}
                error={minPercentError}
                fullWidth
              />
              <AmountInput label="…or at least" currency={household.currency} value={form.minFloor} onValueChange={(v) => set('minFloor', v)} error={minFloorError} hint="Whichever is greater." fullWidth />
            </div>
          </div>
        )}
        <TextField label="Note" placeholder="Optional" value={form.note} onChange={(e) => set('note', e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
