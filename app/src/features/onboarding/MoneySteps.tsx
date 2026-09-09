import { Alert, AmountInput, Button, Card, Checkbox, Select, Switch, Tabs, TextField, formatMoneyAuto } from '@budget-app/ui';
import { ChipRow } from '../../components/ChipRow';
import { QuickDateButtons } from '../../components/QuickDateButtons';
import { firstName, toCents } from '../../data/split';
import { isValidIsoDate } from '../../lib/dates';
import { FREQUENCIES, FREQUENCY_LABEL, OCCURRENCES_PER_MONTH, type Frequency } from '../../lib/frequency';
import { KIND_LABEL, type BillKind } from '../bills/types';
import { BILL_SUGGESTIONS, amountError, categoryLimitValid, monthlyBillsTotal, monthlyIncomeByMember, newBill, percentsFrom, tooBigMessage, withinMax } from './draft';
import type { StepProps } from './HouseholdSteps';
import type { BillDraft, Draft, PaydayDraft } from './types';

const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }));

export function paydayValid(p: PaydayDraft): boolean {
  return !p.enabled || (!!p.name.trim() && !!p.amount && p.amount > 0 && withinMax(p.amount) && isValidIsoDate(p.nextDate));
}

export function PaydaysStep({ draft, update, submitted }: StepProps) {
  const setPayday = (memberId: string, patch: Partial<PaydayDraft>) => update({ paydays: draft.paydays.map((p) => (p.memberId === memberId ? { ...p, ...patch } : p)) });
  const money = (v: number) => formatMoneyAuto(v, { currency: draft.currency });
  const monthly = monthlyIncomeByMember(draft.paydays);
  const total = Object.values(monthly).reduce((a, b) => a + b, 0);
  return (
    <div className="bdg-stack bdg-gap-3">
      {draft.people.map((person) => {
        const p = draft.paydays.find((x) => x.memberId === person.id);
        if (!p) return null;
        const name = firstName(person.name) || 'This person';
        return (
          <Card key={person.id} padding="sm" title={`${name}'s pay`} subtitle={p.enabled && monthly[person.id] ? `About ${money(monthly[person.id]!)} a month` : undefined}>
            <div className="bdg-stack bdg-gap-3">
              <Checkbox label={`${name} has regular pay`} description="Untick for no regular income - it can be logged as it comes." checked={p.enabled} onChange={(e) => setPayday(person.id, { enabled: e.target.checked })} />
              {p.enabled && (
                <>
                  <div className="bdg-grid-2">
                    <TextField label="What is it" placeholder="Salary, shifts, freelance…" value={p.name} onChange={(e) => setPayday(person.id, { name: e.target.value })} error={submitted && !p.name.trim() ? 'Give it a name' : undefined} fullWidth />
                    <AmountInput label={p.variable ? 'Typical amount' : 'Amount'} currency={draft.currency} value={p.amount} onValueChange={(v) => setPayday(person.id, { amount: v })} error={submitted ? amountError(p.amount, draft.currency, 'Enter the amount') : undefined} fullWidth />
                  </div>
                  <div className="bdg-grid-2">
                    <Select label="How often" options={frequencyOptions} value={p.frequency} onChange={(e) => setPayday(person.id, { frequency: e.target.value as Frequency })} fullWidth />
                    <TextField type="date" label="Next payday" value={p.nextDate} onChange={(e) => setPayday(person.id, { nextDate: e.target.value })} error={submitted && !isValidIsoDate(p.nextDate) ? 'Pick the next payday' : undefined} fullWidth />
                  </div>
                  <QuickDateButtons value={p.nextDate} onPick={(iso) => setPayday(person.id, { nextDate: iso })} />
                  <Checkbox label="Amount varies" description="Shifts, tips, freelance - the app asks for the actual amount each time." checked={p.variable} onChange={(e) => setPayday(person.id, { variable: e.target.checked })} />
                </>
              )}
            </div>
          </Card>
        );
      })}
      <Card padding="sm" title="Daily earnings" subtitle="For freelance or shift work: a target per day that the Overview tracks.">
        <div className="bdg-stack bdg-gap-3">
          <Checkbox label="Track earnings against a daily target" checked={draft.trackDaily} onChange={(e) => update({ trackDaily: e.target.checked })} />
          {draft.trackDaily && <AmountInput label="Target per day" currency={draft.currency} value={draft.dailyTarget} onValueChange={(v) => update({ dailyTarget: v })} error={submitted ? amountError(draft.dailyTarget, draft.currency, 'Enter a daily target') : undefined} fullWidth />}
        </div>
      </Card>
      {total > 0 && <p className="onboarding__p bdg-text-sm bdg-text-muted">Expected household income: about {money(total)} a month. The Overview counts down to the next payday and plans what is safe to spend until then.</p>}
    </div>
  );
}

export function SharingStep({ draft, update }: StepProps) {
  const ids = draft.people.map((p) => p.id);
  const monthly = monthlyIncomeByMember(draft.paydays);
  const earners = ids.filter((id) => (monthly[id] ?? 0) > 0);
  const incomeAvailable = earners.length > 1;
  const incomePct = incomeAvailable ? percentsFrom(monthly, ids) : null;
  const pct = draft.split === 'income' && incomePct ? incomePct : draft.customPct;
  const sum = ids.reduce((acc, id) => acc + (pct[id] ?? 0), 0);
  // The other person is whoever is not "You" - not necessarily the second in the list (audit OB-4).
  const partner = draft.people.find((p) => p.id !== draft.youId);
  const other = draft.people.length === 2 && partner ? firstName(partner.name) || 'your partner' : 'everyone';

  const setPct = (id: string, value: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const next = { ...draft.customPct, [id]: n };
    if (ids.length === 2) next[ids.find((x) => x !== id)!] = 100 - n;
    update({ customPct: next, split: 'custom' });
  };

  return (
    <div className="bdg-stack bdg-gap-4">
      <p className="onboarding__p bdg-text-sm bdg-text-muted">When a purchase is ticked "Split with {other}", this is how it is divided. Each person's budget only carries their share, and the app keeps a running "who owes whom".</p>
      <Tabs
        variant="segmented"
        fullWidth
        aria-label="How shared purchases are split"
        value={draft.split}
        onChange={(v) => update({ split: v as Draft['split'] })}
        items={[
          { value: 'equal', label: ids.length === 2 ? 'Half each' : 'Equal' },
          { value: 'income', label: 'By income', disabled: !incomeAvailable },
          { value: 'custom', label: 'Custom %' },
        ]}
      />
      {draft.split === 'income' && incomePct && (
        <p className="onboarding__p bdg-text-sm">
          From the paydays you entered: {ids.map((id) => `${firstName(draft.people.find((p) => p.id === id)?.name ?? '')} ${incomePct[id]}%`).join(' · ')}. Whoever earns more covers more.
        </p>
      )}
      {!incomeAvailable && draft.split !== 'custom' && <p className="onboarding__p bdg-text-xs bdg-text-muted">"By income" needs a regular pay for at least two people (previous step).</p>}
      {draft.split === 'custom' && (
        <div className="bdg-stack bdg-gap-2">
          <div className="split-settings__grid">
            {draft.people.map((p) => (
              <TextField key={p.id} label={firstName(p.name) || 'Member'} type="number" suffix="%" value={String(draft.customPct[p.id] ?? 0)} onChange={(e) => setPct(p.id, e.target.value)} fullWidth />
            ))}
          </div>
          {sum !== 100 && <span className="bdg-text-sm bdg-text-negative">Adds up to {sum}% - it needs to be 100%</span>}
        </div>
      )}
      <Switch label="Confirm shared purchases" description={`Each of you confirms purchases the other logs as shared before they count towards what you owe. Most couples leave this off.`} checked={draft.requireApproval} onCheckedChange={(on) => update({ requireApproval: on })} />
    </div>
  );
}


export function billValid(b: BillDraft): boolean {
  return !!b.name.trim() && !!b.amount && b.amount > 0 && withinMax(b.amount) && isValidIsoDate(b.nextDue);
}

export function BillsStep({ draft, update, submitted }: StepProps) {
  const expense = draft.categories.filter((c) => c.kind === 'expense' && c.enabled);
  // New bills default to being paid by "You" (audit OB-4).
  const payer = draft.people.some((p) => p.id === draft.youId) ? draft.youId : draft.people[0]!.id;
  const setBill = (key: string, patch: Partial<BillDraft>) => update({ bills: draft.bills.map((b) => (b.key === key ? { ...b, ...patch } : b)) });
  const addSuggestion = (name: string) => {
    const s = BILL_SUGGESTIONS.find((x) => x.name === name);
    if (!s) return;
    update({ bills: [...draft.bills, newBill(s, payer, expense)] });
  };
  const addCustom = () => update({ bills: [...draft.bills, newBill({ name: '' }, payer, expense)] });
  const remaining = BILL_SUGGESTIONS.filter((s) => !draft.bills.some((b) => b.name.trim().toLowerCase() === s.name.toLowerCase()));
  const money = (v: number) => formatMoneyAuto(v, { currency: draft.currency });
  const monthlyTotal = draft.bills.reduce((acc, b) => acc + (b.amount ?? 0) * OCCURRENCES_PER_MONTH[b.frequency], 0);

  return (
    <div className="bdg-stack bdg-gap-4">
      <p className="onboarding__p bdg-text-sm bdg-text-muted">Tap the ones you pay, then fill in the amount and when it's next due. Bills are paid first: the app keeps them aside before working out what's safe to spend, never counts them against a budget, reminds you when they're due, and rolls the date forward each time you mark one paid. You can skip this and add bills later.</p>
      {remaining.length > 0 && <ChipRow label="Common bills" chips={remaining.map((s) => ({ id: s.name, label: `${s.icon} ${s.name}` }))} onPick={addSuggestion} />}
      {draft.bills.map((b) => (
        <Card
          key={b.key}
          padding="sm"
          title={b.name.trim() || 'New bill'}
          subtitle={KIND_LABEL[b.kind]}
          actions={
            <Button variant="ghost" size="sm" onClick={() => update({ bills: draft.bills.filter((x) => x.key !== b.key) })}>
              Remove
            </Button>
          }
        >
          <div className="bdg-stack bdg-gap-3">
            <div className="bdg-grid-2">
              <TextField label="Name" placeholder="Rent, Netflix…" value={b.name} onChange={(e) => setBill(b.key, { name: e.target.value })} error={submitted && !b.name.trim() ? 'Give it a name' : undefined} fullWidth autoFocus={!b.name} />
              <AmountInput label="Amount" currency={draft.currency} value={b.amount} onValueChange={(v) => setBill(b.key, { amount: v })} error={submitted ? amountError(b.amount, draft.currency, 'Enter the amount') : undefined} fullWidth />
            </div>
            <div className="bdg-grid-2">
              <Select label="Repeats" options={frequencyOptions} value={b.frequency} onChange={(e) => setBill(b.key, { frequency: e.target.value as Frequency })} fullWidth />
              <TextField type="date" label="Next due" value={b.nextDue} onChange={(e) => setBill(b.key, { nextDue: e.target.value })} error={submitted && !isValidIsoDate(b.nextDue) ? 'Pick the next due date' : undefined} fullWidth />
            </div>
            <QuickDateButtons value={b.nextDue} onPick={(iso) => setBill(b.key, { nextDue: iso })} />
            <div className="bdg-grid-2">
              <Select label="Type" options={(['bill', 'subscription'] as BillKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={b.kind} onChange={(e) => setBill(b.key, { kind: e.target.value as BillKind })} fullWidth />
              <Select label="Category" options={expense.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} value={b.categoryId} onChange={(e) => setBill(b.key, { categoryId: e.target.value })} fullWidth />
            </div>
            <div className="bdg-grid-2">
              <Select label="Paid by" options={draft.people.map((p) => ({ value: p.id, label: p.name.trim() || 'Member' }))} value={b.memberId} onChange={(e) => setBill(b.key, { memberId: e.target.value })} fullWidth />
              <Checkbox label="Shared" description="Split between you when it's paid." checked={b.shared} onChange={(e) => setBill(b.key, { shared: e.target.checked })} />
            </div>
          </div>
        </Card>
      ))}
      <div className="bdg-row bdg-wrap bdg-gap-2">
        <Button variant="secondary" onClick={addCustom}>
          Add another bill
        </Button>
      </div>
      {draft.bills.length > 0 && <p className="onboarding__p bdg-text-sm bdg-text-muted">{draft.bills.length} bill{draft.bills.length === 1 ? '' : 's'} · about {money(monthlyTotal)} a month.</p>}
    </div>
  );
}

export function BudgetsStep({ draft, update, submitted }: StepProps) {
  const money = (v: number) => formatMoneyAuto(v, { currency: draft.currency });
  const setCategory = (id: string, patch: Partial<Draft['categories'][number]>) => update({ categories: draft.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const expense = draft.categories.filter((c) => c.kind === 'expense');
  const limitTotal = expense.filter((c) => c.enabled).reduce((acc, c) => acc + (c.limit ?? 0), 0);
  const income = Object.values(monthlyIncomeByMember(draft.paydays)).reduce((a, b) => a + b, 0);
  const bills = monthlyBillsTotal(draft.bills);
  // Bills come off the top, so the budgets have to fit into what is left after them.
  const afterBills = Math.max(0, income - bills);
  const personal = draft.people.reduce((acc, p) => acc + (p.limit ?? 0), 0);
  // Decided in cents: limits exactly equal to what is left are not "higher" (audit MON-5).
  const tooHigh = income > 0 && toCents(limitTotal) > toCents(afterBills);
  const incomeLine =
    income > 0
      ? bills > 0
        ? `Expected income is about ${money(income)} a month; bills take ${money(bills)} first, leaving ${money(afterBills)} for budgets${tooHigh ? ' - the limits are higher than that' : ''}.`
        : `Expected income is about ${money(income)} a month${tooHigh ? ' - the limits are higher than that' : ''}.`
      : null;
  return (
    <div className="bdg-stack bdg-gap-3">
      <p className="onboarding__p bdg-text-sm bdg-text-muted">Household limits per category for the month - for everyday spending after the bills, which are paid first and never counted here. Untick what you don't use; everything can be renamed or re-limited later on the Household tab.</p>
      <div className="onboarding__categories">
        {expense.map((c) => (
          <div key={c.id} className={`onboarding__category${c.enabled ? '' : ' onboarding__category--off'}`}>
            <Checkbox label={`${c.icon} ${c.name}`} checked={c.enabled} onChange={(e) => setCategory(c.id, { enabled: e.target.checked })} />
            {/* A cleared field stays null (so it CAN be cleared and typed into without a
                leading zero); it becomes 0 - no limit - on Finish (audit DS-4). */}
            <AmountInput
              label="Monthly limit"
              currency={draft.currency}
              size="sm"
              value={c.enabled ? c.limit : null}
              disabled={!c.enabled}
              onValueChange={(v) => setCategory(c.id, { limit: v })}
              error={submitted && c.enabled && !categoryLimitValid(c.limit) ? (!withinMax(c.limit) ? tooBigMessage(draft.currency) : 'A limit from 0 up (0 means no limit)') : undefined}
            />
          </div>
        ))}
      </div>
      <Alert tone={tooHigh ? 'warning' : 'info'} title={`Category limits add up to ${money(limitTotal)} a month`}>
        {[incomeLine, `Personal limits total ${money(personal)}.`].filter(Boolean).join(' ')}
      </Alert>
    </div>
  );
}
