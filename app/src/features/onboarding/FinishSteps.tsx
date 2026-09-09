import { Alert, AmountInput, Button, Card, Checkbox, MemberChip, Switch, TextField, formatMoneyAuto } from '@budget-app/ui';
import { useSettings } from '../../data/settings';
import { firstName } from '../../data/split';
import { daysFromNow, formatLongDate, isValidIsoDate, todayIso } from '../../lib/dates';
import { OCCURRENCES_PER_MONTH } from '../../lib/frequency';
import { useReminders } from '../reminders';
import { useSync } from '../../sync';
import { GOAL_ICONS, amountError, monthlyIncomeByMember, withinMax } from './draft';
import type { StepProps } from './HouseholdSteps';

/** Optional - but when given, a real day that is today or later, the rule GoalFormDialog applies (audit MON-12). */
const deadlineOk = (deadline: string): boolean => !deadline || (isValidIsoDate(deadline) && deadline >= todayIso());

export function goalValid(draft: StepProps['draft']): boolean {
  return !draft.goalEnabled || (!!draft.goal.name.trim() && !!draft.goal.target && draft.goal.target > 0 && withinMax(draft.goal.target) && deadlineOk(draft.goal.deadline));
}

export function GoalStep({ draft, update, submitted }: StepProps) {
  const g = draft.goal;
  const setGoal = (patch: Partial<typeof g>) => update({ goal: { ...g, ...patch } });
  return (
    <div className="bdg-stack bdg-gap-4">
      <p className="onboarding__p bdg-text-sm bdg-text-muted">Something you're saving for together - a holiday, a deposit, a couch. Goals show on the Overview and the app works out what to put aside each week. You can skip this.</p>
      <Checkbox label="Set a first goal" checked={draft.goalEnabled} onChange={(e) => update({ goalEnabled: e.target.checked })} />
      {draft.goalEnabled && (
        <Card padding="sm">
          <div className="bdg-stack bdg-gap-3">
            <div className="goal-icons" role="radiogroup" aria-label="Icon">
              {GOAL_ICONS.map((icon) => (
                <button key={icon} type="button" role="radio" aria-checked={g.icon === icon} className={`goal-icons__item${g.icon === icon ? ' goal-icons__item--active' : ''}`} onClick={() => setGoal({ icon })}>
                  {icon}
                </button>
              ))}
            </div>
            <TextField label="Goal" placeholder="Holiday fund, emergency savings…" value={g.name} onChange={(e) => setGoal({ name: e.target.value })} error={submitted && !g.name.trim() ? 'Name the goal' : undefined} fullWidth autoFocus />
            <div className="bdg-grid-2">
              <AmountInput label="Target" currency={draft.currency} value={g.target} onValueChange={(v) => setGoal({ target: v })} error={submitted ? amountError(g.target, draft.currency, 'Enter a target') : undefined} fullWidth />
              {/* The input's min is bypassed by typing and by a draft resumed after its date passed - validated too (audit MON-12). */}
              <TextField type="date" label="By when" value={g.deadline} min={todayIso()} onChange={(e) => setGoal({ deadline: e.target.value })} error={submitted && !deadlineOk(g.deadline) ? 'Pick today or a later day' : undefined} hint="Optional" fullWidth />
            </div>
            <div className="bill-form__quick" aria-label="Quick deadlines">
              {[
                ['3 months', daysFromNow(90)],
                ['6 months', daysFromNow(180)],
                ['1 year', daysFromNow(365)],
                ['No date', ''],
              ].map(([label, iso]) => (
                <Button key={label} size="sm" variant={g.deadline === iso ? 'secondary' : 'ghost'} onClick={() => setGoal({ deadline: iso! })}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export function PreferencesStep() {
  const { theme, setTheme } = useSettings();
  const reminders = useReminders();
  const sync = useSync();
  return (
    <div className="bdg-stack bdg-gap-4">
      <Switch label="Dark mode" description="Applies on this device only - change it any time in Settings." checked={theme === 'dark'} onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')} />
      <Switch
        label="Notify me about bills due today, paydays and purchases to confirm"
        description={reminders.notificationPermission === 'unsupported' ? 'Not supported in this browser.' : 'Only while the app is open. The bell in the header always lists everything that needs attention.'}
        checked={reminders.notificationsEnabled}
        disabled={reminders.notificationPermission === 'unsupported'}
        onCheckedChange={(on) => void reminders.setNotificationsEnabled(on)}
      />
      {reminders.notificationPermission === 'denied' && <Alert tone="warning">Notifications are blocked for this site in your browser settings.</Alert>}
      <Alert tone="info" title={sync.config ? 'Connected to your home server' : "Your partner's phone"}>
        {sync.config
          ? 'Everything you set up here is uploaded when you finish, and the other phone can join from its own setup screen.'
          : 'Once you finish, connect this device to the Supabase on your home laptop from Settings → Sync. Your partner then picks "Join your partner\'s household" on their phone and everything comes across.'}
      </Alert>
    </div>
  );
}

interface DoneStepProps {
  draft: StepProps['draft'];
  mode: 'first-run' | 'fresh';
  /** Paused bills and paydays the wizard never showed: a fresh re-run keeps them as they are (audit LV-2). */
  carried: { bills: number; paydays: number };
}

const kept = (n: number, noun: string) => (n ? ` · ${n} paused ${noun}${n === 1 ? '' : 's'} kept as ${n === 1 ? 'it is' : 'they are'}` : '');

export function DoneStep({ draft, mode, carried }: DoneStepProps) {
  const sync = useSync();
  // A bound household is mirrored: this reset syncs to the partner's phone too (QA SY-16).
  const synced = !!sync.config && !!sync.householdId;
  const money = (v: number) => formatMoneyAuto(v, { currency: draft.currency });
  const income = Object.values(monthlyIncomeByMember(draft.paydays)).reduce((a, b) => a + b, 0);
  const billsMonthly = draft.bills.reduce((acc, b) => acc + (b.amount ?? 0) * OCCURRENCES_PER_MONTH[b.frequency], 0);
  const limits = draft.categories.filter((c) => c.kind === 'expense' && c.enabled).reduce((acc, c) => acc + (c.limit ?? 0), 0);
  const paydays = draft.paydays.filter((p) => p.enabled).length;
  const banks = draft.accounts.filter((a) => a.kind !== 'credit' && a.name.trim());
  const cards = draft.accounts.filter((a) => a.kind === 'credit' && a.name.trim());
  const accountsLine =
    banks.length || cards.length
      ? [
          banks.length ? `${banks.length} bank account${banks.length === 1 ? '' : 's'} · ${money(banks.reduce((acc, a) => acc + (a.balance ?? 0), 0))}` : '',
          // Finish stores a card's owing as a positive number whatever sign was typed - say so here, not "-$500 owing" (audit MON-3).
          cards.length ? `${cards.length} card${cards.length === 1 ? '' : 's'} · ${money(cards.reduce((acc, a) => acc + Math.abs(a.balance ?? 0), 0))} owing` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'None yet';
  return (
    <div className="bdg-stack bdg-gap-4">
      <div>
        <h3 className="bdg-section-title">{draft.name.trim()}</h3>
        <p className="onboarding__p bdg-text-sm bdg-text-muted">
          {draft.currency}
          {draft.trackDaily && draft.dailyTarget ? ` · ${money(draft.dailyTarget)}/day earning target` : ''}
        </p>
      </div>
      <div className="bdg-row bdg-wrap bdg-gap-2">
        {draft.people.map((p) => (
          <MemberChip key={p.id} name={p.name.trim()} color={p.color} meta={`${p.role} · ${p.limit && p.limit > 0 ? `${money(p.limit)}/mo` : 'no cap'}`} />
        ))}
      </div>
      <dl className="onboarding__summary">
        <dt>Paydays</dt>
        <dd>
          {paydays ? `${paydays} · about ${money(income)} a month` : 'None yet'}
          {kept(carried.paydays, 'payday')}
        </dd>
        <dt>Sharing</dt>
        <dd>
          {draft.split === 'equal' ? (draft.people.length === 2 ? 'Half each' : 'Equal') : draft.split === 'income' ? 'By income' : draft.people.map((p) => `${firstName(p.name)} ${draft.customPct[p.id] ?? 0}%`).join(' · ')}
          {draft.requireApproval ? ' · confirm shared purchases' : ''}
        </dd>
        <dt>Bills</dt>
        <dd>
          {draft.bills.length ? `${draft.bills.length} · about ${money(billsMonthly)} a month` : 'None yet'}
          {kept(carried.bills, 'bill')}
        </dd>
        <dt>Accounts</dt>
        <dd>{accountsLine}</dd>
        <dt>Budgets</dt>
        <dd>
          {draft.categories.filter((c) => c.kind === 'expense' && c.enabled).length} categories · {money(limits)} a month
        </dd>
        <dt>First goal</dt>
        <dd>{draft.goalEnabled && draft.goal.name.trim() ? `${draft.goal.icon} ${draft.goal.name.trim()} · ${money(draft.goal.target ?? 0)}${draft.goal.deadline ? ` by ${formatLongDate(draft.goal.deadline)}` : ''}` : 'None yet'}</dd>
      </dl>
      {mode === 'fresh' ? (
        <Alert tone="warning" title={synced ? 'This replaces the household on both phones' : 'This replaces everything on this device'}>
          Purchases, goals, settlements, lists and account history are deleted when you finish; the people, bills, paydays and accounts above are created fresh.
          {synced ? ' This household syncs, so the reset reaches your partner\'s phone too - not just this one.' : ''} Export a backup from Settings first if you might want the old data back.
        </Alert>
      ) : (
        <Alert tone="success" title="Ready to go">
          Tap + to log your first purchase. Everything here can be changed later from the Household tab and Settings.
        </Alert>
      )}
    </div>
  );
}
