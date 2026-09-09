import { AmountInput, Button, Card, TextField, Tabs, formatMoneyAuto } from '@budget-app/ui';
import { ChipRow } from '../../components/ChipRow';
import { MAX_AMOUNT } from '../../data/split';
import { KIND_LABEL, type AccountKind } from '../accounts/types';
import { ACCOUNT_SUGGESTIONS, newAccountDraft, tooBigMessage, withinMax } from './draft';
import type { StepProps } from './HouseholdSteps';
import type { AccountDraft } from './types';

// The wizard's Accounts step. Optional (skippable): everything here can be
// added later from Overview → Manage accounts. What it collects mirrors
// AccountFormDialog minus the per-member picker (wizard accounts start joint)
// - the credit terms are what make "what does not paying it off cost?"
// answerable from day one.

const inRange = (text: string, min: number, max: number, integer = false): boolean => {
  if (text.trim() === '') return true; // optional
  const v = Number(text.trim());
  return Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
};

/** Optional credit amounts (limit, minimum floor): 0 up to the cap when given, as AccountFormDialog has it. */
const creditAmountOk = (v: number | null): boolean => v === null || (v >= 0 && v <= MAX_AMOUNT);

/** Same rules as the Accounts screen's form: a name, a balance within the cap, and credit terms in range when given (audit UX-6/MON-8). */
export function accountDraftValid(a: AccountDraft): boolean {
  if (!a.name.trim() || !withinMax(a.balance)) return false;
  if (a.kind !== 'credit') return true;
  return inRange(a.apr, 0, 100) && inRange(a.statementDay, 1, 31, true) && inRange(a.dueDays, 0, 90, true) && inRange(a.minPercent, 0, 100) && creditAmountOk(a.creditLimit) && creditAmountOk(a.minFloor);
}

export function AccountsStep({ draft, update, submitted }: StepProps) {
  const set = (key: string, patch: Partial<AccountDraft>) => update({ accounts: draft.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)) });
  const addSuggestion = (name: string) => {
    const s = ACCOUNT_SUGGESTIONS.find((x) => x.name === name);
    if (!s) return;
    update({ accounts: [...draft.accounts, newAccountDraft(s.kind, s.kind === 'credit' ? '' : s.name)] });
  };
  const money = (v: number) => formatMoneyAuto(v, { currency: draft.currency });
  const banks = draft.accounts.filter((a) => a.kind !== 'credit' && a.name.trim());
  const cards = draft.accounts.filter((a) => a.kind === 'credit' && a.name.trim());
  const remaining = ACCOUNT_SUGGESTIONS.filter((s) => s.kind === 'credit' || !draft.accounts.some((a) => a.kind === s.kind));
  const cap = money(MAX_AMOUNT);

  return (
    <div className="bdg-stack bdg-gap-4">
      <p className="onboarding__p bdg-text-sm bdg-text-muted">
        Where the money actually sits. Purchases, bills and paydays can point at an account, so balances track themselves - and a credit card with its interest rate can say what carrying a balance
        costs. Your paydays and bills get pointed at the first bank account here; change any of them later. You can skip this and add accounts from the Overview.
      </p>
      {remaining.length > 0 && <ChipRow label="Add an account" chips={remaining.map((s) => ({ id: s.name, label: `${s.icon} ${s.name}` }))} onPick={addSuggestion} />}
      {draft.accounts.map((a) => {
        const credit = a.kind === 'credit';
        return (
          <Card
            key={a.key}
            padding="sm"
            title={a.name.trim() || `New ${KIND_LABEL[a.kind].toLowerCase()}`}
            subtitle={KIND_LABEL[a.kind]}
            actions={
              <Button variant="ghost" size="sm" onClick={() => update({ accounts: draft.accounts.filter((x) => x.key !== a.key) })}>
                Remove
              </Button>
            }
          >
            <div className="bdg-stack bdg-gap-3">
              <Tabs
                variant="segmented"
                fullWidth
                aria-label="Account type"
                value={a.kind}
                onChange={(v) => set(a.key, { kind: v as AccountKind, dueDays: v === 'credit' && !a.dueDays.trim() ? '25' : a.dueDays })}
                items={[
                  { value: 'everyday', label: 'Everyday' },
                  { value: 'savings', label: 'Savings' },
                  { value: 'credit', label: 'Credit card' },
                ]}
              />
              <div className="bdg-grid-2">
                <TextField
                  label="Name"
                  placeholder={credit ? 'Platinum Rewards Visa…' : 'Joint everyday, house saver…'}
                  value={a.name}
                  onChange={(e) => set(a.key, { name: e.target.value })}
                  error={submitted && !a.name.trim() ? 'Name it like the bank does' : undefined}
                  fullWidth
                  autoFocus={!a.name}
                />
                <AmountInput label={credit ? 'Owing on it today' : 'Balance today'} currency={draft.currency} value={a.balance} onValueChange={(v) => set(a.key, { balance: v })} error={submitted && !withinMax(a.balance) ? tooBigMessage(draft.currency) : undefined} hint="The starting point; what you log moves it." fullWidth />
              </div>
              {credit && (
                <>
                  <div className="bdg-grid-2">
                    <TextField
                      label="Interest rate (% p.a.)"
                      type="number"
                      inputMode="decimal"
                      placeholder="20.99"
                      value={a.apr}
                      onChange={(e) => set(a.key, { apr: e.target.value })}
                      error={submitted && !inRange(a.apr, 0, 100) ? 'A yearly rate between 0 and 100' : undefined}
                      hint="From the statement - it powers the interest estimates."
                      fullWidth
                    />
                    <AmountInput label="Credit limit" currency={draft.currency} value={a.creditLimit} onValueChange={(v) => set(a.key, { creditLimit: v })} error={submitted && !creditAmountOk(a.creditLimit) ? `A limit from 0 up to ${cap}` : undefined} fullWidth />
                  </div>
                  <div className="bdg-grid-2">
                    <TextField
                      label="Statement closes on day"
                      type="number"
                      inputMode="numeric"
                      placeholder="12"
                      value={a.statementDay}
                      onChange={(e) => set(a.key, { statementDay: e.target.value })}
                      error={submitted && !inRange(a.statementDay, 1, 31, true) ? 'A day of the month, 1-31' : undefined}
                      fullWidth
                    />
                    <TextField
                      label="Due days after statement"
                      type="number"
                      inputMode="numeric"
                      placeholder="25"
                      value={a.dueDays}
                      onChange={(e) => set(a.key, { dueDays: e.target.value })}
                      error={submitted && !inRange(a.dueDays, 0, 90, true) ? 'Days after the statement, 0-90' : undefined}
                      fullWidth
                    />
                  </div>
                  <div className="bdg-grid-2">
                    <TextField
                      label="Minimum payment (%)"
                      type="number"
                      inputMode="decimal"
                      placeholder="2"
                      value={a.minPercent}
                      onChange={(e) => set(a.key, { minPercent: e.target.value })}
                      error={submitted && !inRange(a.minPercent, 0, 100) ? 'A percentage between 0 and 100' : undefined}
                      fullWidth
                    />
                    <AmountInput label="…or at least" currency={draft.currency} value={a.minFloor} onValueChange={(v) => set(a.key, { minFloor: v })} error={submitted && !creditAmountOk(a.minFloor) ? `An amount from 0 up to ${cap}` : undefined} hint="Whichever is greater." fullWidth />
                  </div>
                </>
              )}
            </div>
          </Card>
        );
      })}
      <div className="bdg-row bdg-wrap bdg-gap-2">
        <Button variant="secondary" onClick={() => update({ accounts: [...draft.accounts, newAccountDraft('everyday')] })}>
          Add another account
        </Button>
      </div>
      {(banks.length > 0 || cards.length > 0) && (
        <p className="onboarding__p bdg-text-sm bdg-text-muted">
          {[
            banks.length > 0 ? `${banks.length} bank account${banks.length === 1 ? '' : 's'} · ${money(banks.reduce((acc, a) => acc + (a.balance ?? 0), 0))}` : '',
            // Owing is stored as a positive number whatever sign was typed (audit MON-3).
            cards.length > 0 ? `${cards.length} card${cards.length === 1 ? '' : 's'} · ${money(cards.reduce((acc, a) => acc + Math.abs(a.balance ?? 0), 0))} owing` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
