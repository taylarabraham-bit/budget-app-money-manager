import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, MemberChip, PageHeader, ProgressBar } from '@budget-app/ui';
import { STORAGE_KEYS, readStored, removeStored, writeStored } from '../../data/persist';
import { useHousehold } from '../../data/store';
import { APP_NAME } from '../../lib/app-name';
import { newId } from '../../lib/ids';
import { useAccounts } from '../accounts';
import { useBills } from '../bills';
import { useLists } from '../lists';
import { usePaydays } from '../paydays';
import { useQuickAdds } from '../quickadd';
import { useSettlements } from '../settle';
import { useSync, type ServerHousehold } from '../../sync';
import { STEP_ORDER, buildFinish, categoryLimitValid, draftFromExisting, emptyDraft, parseSavedWizard, personLimitValid, skipPatch, withinMax, type SavedWizard } from './draft';
import { AccountsStep, accountDraftValid } from './AccountsStep';
import { DoneStep, GoalStep, PreferencesStep, goalValid } from './FinishSteps';
import { HouseholdStep, PeopleStep } from './HouseholdSteps';
import { BillsStep, BudgetsStep, PaydaysStep, SharingStep, billValid, paydayValid } from './MoneySteps';
import { JoinStep, StartStep } from './StartSteps';
import type { Draft, Step } from './types';
import './onboarding.css';

interface OnboardingScreenProps {
  /** `first-run`: replacing the sample. `fresh`: re-running over this device's own data (wiped on Finish). */
  mode: 'first-run' | 'fresh';
  onDone: () => void;
  onCancel: () => void;
}

const TITLE: Record<Step, string> = {
  start: `Let's set up ${APP_NAME}`,
  join: "Join your partner's household",
  household: 'Your household',
  people: "Who's in it",
  paydays: 'When money comes in',
  sharing: 'Sharing',
  bills: 'Bills & subscriptions',
  accounts: 'Accounts & cards',
  budgets: 'Monthly budgets',
  goal: 'A first goal',
  preferences: 'Preferences',
  done: 'All set',
};

const SUBTITLE: Record<Step, string> = {
  start: 'A couple of minutes and the app knows your household, your paydays and your bills.',
  join: 'Connect to the home server and the household comes to this phone.',
  household: 'A name for the two of you and the currency you spend in.',
  people: 'Each person gets their own monthly budget; shared purchases are split between you.',
  paydays: 'The app counts down to payday and works out what is safe to spend until then.',
  sharing: 'How shared purchases are divided, and whether you confirm each other\'s.',
  bills: 'Recurring bills and subscriptions - reminded, rolled forward, and counted before payday.',
  accounts: 'Bank accounts and credit cards - balances that track themselves, and what carrying a card balance costs.',
  budgets: 'How much to spend per category each month.',
  goal: 'Optional - something you are saving for together.',
  preferences: 'Appearance, notifications, and syncing with the other phone.',
  done: 'Check the details, then start logging.',
};

/** Steps that can be skipped with no data entered. */
const SKIPPABLE: ReadonlySet<Step> = new Set(['bills', 'accounts', 'goal']);

/**
 * Guided setup. Everything is collected into a draft and applied in one go
 * on Finish, so backing out changes nothing. A second phone can instead join
 * the household already on the home server.
 */
export function OnboardingScreen({ mode, onDone, onCancel }: OnboardingScreenProps) {
  const store = useHousehold();
  const bills = useBills();
  const paydays = usePaydays();
  const settlements = useSettlements();
  const lists = useLists();
  const quickAdds = useQuickAdds();
  const accounts = useAccounts();
  const sync = useSync();
  // A wizard in progress survives a reload or a discarded tab (QA UX-14): the draft
  // and step are saved as they change, restored here, and cleared on Finish/Cancel.
  // Saved drafts expire after a week (audit OB-14) - see parseSavedWizard.
  const savedWizard = useRef<SavedWizard | null | undefined>(undefined);
  if (savedWizard.current === undefined) savedWizard.current = readStored(STORAGE_KEYS.onboardingDraft, parseSavedWizard);
  const resumed = savedWizard.current && savedWizard.current.mode === mode ? savedWizard.current : null;
  // Prefill from existing data in 'fresh' mode. The per-store flags matter in a mixed
  // state (real bills under a still-sample household): the real rows prefill, the
  // sample's names and limits never do - and Finish therefore cannot silently wipe
  // rows the wizard never showed (QA UX-2).
  const [draft, setDraft] = useState<Draft>(() => {
    const existingFlags = { household: !store.isSample, bills: !bills.isSample, paydays: !paydays.isSample, accounts: !accounts.isSample };
    if (resumed?.draft) {
      if (Array.isArray(resumed.draft.accounts)) return resumed.draft;
      // A draft saved by a build without the accounts step knows nothing about
      // them. Resuming it with [] let Finish replaceAllAccounts([]) - a wipe of
      // real rows the wizard never showed (QA7 O-5) - so prefill them from the
      // live store instead.
      const fallback = mode === 'fresh' && !accounts.isSample ? draftFromExisting(store, bills.bills, paydays.schedules, accounts.accounts, accounts.transfers, existingFlags).accounts : [];
      return { ...resumed.draft, accounts: fallback };
    }
    return mode === 'fresh' ? draftFromExisting(store, bills.bills, paydays.schedules, accounts.accounts, accounts.transfers, existingFlags) : emptyDraft(store.household.currency || 'USD');
  });
  const [path, setPath] = useState<'new' | 'join'>('new');
  const [index, setIndex] = useState(() => (resumed ? Math.max(1, Math.min(resumed.index, STEP_ORDER.length - 1)) : 0));
  const [submitted, setSubmitted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [joined, setJoined] = useState<ServerHousehold | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Joined a household from the server: which member is using THIS phone (QA UX-1).
  const [whoAmI, setWhoAmI] = useState<string | null>(null);

  const clearSavedWizard = () => removeStored(STORAGE_KEYS.onboardingDraft);
  // A draft saved by the OTHER mode is stale by definition - the stores changed
  // underneath it - and would otherwise resurface whenever the mode flipped back (audit OB-14).
  useEffect(() => {
    if (savedWizard.current && savedWizard.current.mode !== mode) clearSavedWizard();
  }, [mode]);
  // Save the in-progress wizard (new-household path only; the join path types nothing worth keeping).
  useEffect(() => {
    if (path !== 'new' || index === 0 || finishing) return;
    writeStored(STORAGE_KEYS.onboardingDraft, { version: 1, mode, index, draft, savedAt: new Date().toISOString() });
  }, [draft, index, path, mode, finishing]);

  const steps: readonly Step[] = path === 'join' ? ['start', 'join'] : STEP_ORDER;
  const step = steps[index] ?? 'start';
  const numbered: readonly Step[] = steps.filter((s) => s !== 'start' && s !== 'join');
  const stepNumber = numbered.indexOf(step) + 1;
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Rows the wizard never shows - archived accounts, paused bills and paydays - ride
  // through a fresh re-run instead of being deleted with the rebuild (QA7 A-7/O-3,
  // audit LV-2). Never from a still-sample store: those rows are not the household's.
  const fresh = mode === 'fresh';
  const keptArchived = fresh && !accounts.isSample ? accounts.accounts.filter((a) => a.archived) : [];
  const pausedBills = fresh && !bills.isSample ? bills.bills.filter((b) => b.paused) : [];
  const pausedSchedules = fresh && !paydays.isSample ? paydays.schedules.filter((s) => s.paused) : [];

  const valid = useMemo(() => {
    switch (step) {
      case 'household':
        return !!draft.name.trim();
      case 'people':
        return draft.people.length > 0 && draft.people.every((p) => p.name.trim() && personLimitValid(p));
      case 'paydays':
        return draft.paydays.every(paydayValid) && (!draft.trackDaily || (!!draft.dailyTarget && draft.dailyTarget > 0 && withinMax(draft.dailyTarget)));
      case 'sharing':
        return draft.split !== 'custom' || draft.people.reduce((acc, p) => acc + (draft.customPct[p.id] ?? 0), 0) === 100;
      case 'bills':
        return draft.bills.every(billValid);
      case 'accounts':
        return draft.accounts.every(accountDraftValid);
      case 'budgets':
        return draft.categories.every((c) => !c.enabled || c.kind !== 'expense' || categoryLimitValid(c.limit));
      case 'goal':
        return goalValid(draft);
      default:
        return true;
    }
  }, [step, draft]);

  const go = (i: number) => {
    setSubmitted(false);
    setNotice(null);
    setIndex(Math.max(0, Math.min(steps.length - 1, i)));
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    setSubmitted(true);
    if (!valid) return;
    if (step === 'done') {
      finish();
      return;
    }
    go(index + 1);
  };
  const back = () => {
    if (index === 0) {
      clearSavedWizard(); // a deliberate exit; only a reload resumes
      onCancel();
      return;
    }
    go(index - 1);
  };
  const skip = () => {
    // Only rows added in this run are discarded; prefilled live rows stay (audit OB-5) -
    // so one edited into an invalid state still has to be fixed or removed first.
    const patch = skipPatch(draft, step);
    const kept = { ...draft, ...patch };
    const keptValid = step === 'bills' ? kept.bills.every(billValid) : step === 'accounts' ? kept.accounts.every(accountDraftValid) : true;
    if (!keptValid) {
      setSubmitted(true);
      return;
    }
    update(patch);
    go(index + 1);
  };

  const finish = () => {
    setFinishing(true);
    const createdAt = new Date().toISOString();
    const rows = buildFinish(draft, { createdAt, keptArchived, pausedBills, pausedSchedules });
    store.hydrate(
      {
        // Re-running setup keeps the household's identity (sync, settle-up history ids); a first run mints a new one.
        household: { id: fresh && !store.isSample ? store.household.id : newId('hh'), ...rows.household },
        members: rows.members,
        categories: rows.categories,
        transactions: [],
        goals: rows.goal ? [rows.goal] : [],
        goalContributions: [],
      },
      // THIS device stays the person who ran the wizard, not members[0] (audit OB-4).
      { currentMemberId: rows.currentMemberId },
    );
    bills.replaceAll(rows.bills);
    paydays.replaceAll(rows.schedules);
    settlements.replaceAll([]);
    lists.replaceAll([]);
    quickAdds.replaceAll([]);
    accounts.replaceAllAccounts(rows.accounts);
    // Transfers always start empty: the drafted balances ARE the fresh opening points.
    accounts.replaceAllTransfers([]);
    writeStored(STORAGE_KEYS.welcome, { version: 1, dismissedAt: createdAt });
    clearSavedWizard();
    onDone();
  };

  if (joined) {
    return (
      <div className="onboarding">
        <PageHeader size="lg" eyebrow="Joined" title={`Welcome to ${joined.name}`} subtitle="Everything from the other phone is on this one now, and the two stay in sync through your home server." />
        <Card padding="lg">
          <div className="bdg-stack bdg-gap-4">
            {/* Without this, the device silently becomes members[0] - the partner who set
                the household up - and everything it logs is attributed to them (QA UX-1). */}
            <div className="bdg-stack bdg-gap-2">
              <span className="bdg-text-sm bdg-font-medium">Which of you is this phone?</span>
              <p className="onboarding__p bdg-text-sm bdg-text-muted">New purchases are logged as you. It can be changed any time in Settings.</p>
              <div className="bdg-row bdg-wrap bdg-gap-2">
                {store.members.map((m) => (
                  <MemberChip key={m.id} name={m.name} color={m.color} meta={m.role} selected={whoAmI === m.id} onSelect={() => setWhoAmI(m.id)} />
                ))}
              </div>
            </div>
            {whoAmI && (
              <Alert tone="success" title="You're all set">
                Tap + to log your first purchase. Shared purchases are split between you and show up on both phones.
              </Alert>
            )}
          </div>
        </Card>
        <div className="onboarding__footer">
          <span />
          <Button
            size="lg"
            disabled={!whoAmI}
            onClick={() => {
              if (whoAmI) store.setCurrentMember(whoAmI);
              sync.identityChosen(); // the join's adopt raised needsIdentity; this picker answered it
              writeStored(STORAGE_KEYS.welcome, { version: 1, dismissedAt: new Date().toISOString() });
              clearSavedWizard();
              onDone();
            }}
          >
            Start using the app
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <PageHeader size="lg" eyebrow={stepNumber > 0 ? `Step ${stepNumber} of ${numbered.length}` : undefined} title={TITLE[step]} subtitle={SUBTITLE[step]} onBack={back} backLabel={index === 0 ? 'Cancel' : 'Back'} />
      {stepNumber > 0 && <ProgressBar value={stepNumber} max={numbered.length} size="sm" tone="primary" aria-label={`Step ${stepNumber} of ${numbered.length}`} />}
      {notice && (
        <Alert tone="info" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Card padding="lg">
        {step === 'start' && (
          <StartStep
            onNew={() => {
              setPath('new');
              go(1);
            }}
            onJoin={() => {
              setPath('join');
              go(1);
            }}
          />
        )}
        {step === 'join' && (
          <JoinStep
            onJoined={setJoined}
            onServerEmpty={() => {
              setPath('new');
              setNotice("The server is connected but has no household yet - you're the first. Set one up here and it's uploaded when you finish.");
              setIndex(1);
            }}
          />
        )}
        {step === 'household' && <HouseholdStep draft={draft} update={update} submitted={submitted} />}
        {step === 'people' && <PeopleStep draft={draft} update={update} submitted={submitted} />}
        {step === 'paydays' && <PaydaysStep draft={draft} update={update} submitted={submitted} />}
        {step === 'sharing' && <SharingStep draft={draft} update={update} submitted={submitted} />}
        {step === 'bills' && <BillsStep draft={draft} update={update} submitted={submitted} />}
        {step === 'accounts' && <AccountsStep draft={draft} update={update} submitted={submitted} />}
        {step === 'budgets' && <BudgetsStep draft={draft} update={update} submitted={submitted} />}
        {step === 'goal' && <GoalStep draft={draft} update={update} submitted={submitted} />}
        {step === 'preferences' && <PreferencesStep />}
        {step === 'done' && <DoneStep draft={draft} mode={mode} carried={{ bills: pausedBills.length, paydays: pausedSchedules.length }} />}
      </Card>

      {step !== 'start' && step !== 'join' && (
        <div className="onboarding__footer">
          <Button variant="secondary" onClick={back}>
            Back
          </Button>
          <div className="bdg-row bdg-gap-2">
            {SKIPPABLE.has(step) && (
              <Button variant="ghost" onClick={skip}>
                Skip for now
              </Button>
            )}
            <Button size="lg" onClick={next} loading={finishing}>
              {step === 'done' ? 'Finish setup' : 'Continue'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
