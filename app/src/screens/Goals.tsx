import { useMemo, useState } from 'react';
import { Alert, Button, EmptyState, GoalCard, PageHeader, StatCard, Tabs, formatMoneyAuto } from '@budget-app/ui';
import { GoalDialog } from '../components/GoalDialog';
import { GoalFormDialog } from '../components/GoalFormDialog';
import { ScreenActions } from '../components/ScreenActions';
import { goalDeadlineLabel, goalPace, selectGoals } from '../data/selectors';
import { useHousehold } from '../data/store';
import type { Goal } from '../data/types';

type GoalTab = 'active' | 'reached' | 'paused';

/**
 * Goals - everything the household is saving towards. Active goals sorted
 * closest-to-done first, with reached and paused goals on their own tabs.
 * Tap a goal for its details, to add money, pause or delete it.
 */
export function GoalsScreen() {
  const state = useHousehold();
  const { household, members } = state;
  const currency = household.currency;
  const data = useMemo(() => selectGoals(state), [state]);
  const [tab, setTab] = useState<GoalTab>('active');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openGoal = openId ? state.goals.find((g) => g.id === openId) ?? null : null;
  const list: Goal[] = tab === 'active' ? data.active : tab === 'reached' ? data.reached : data.paused;
  const justReached = data.reached.find((g) => g.lastContributionAt && Date.now() - new Date(g.lastContributionAt).getTime() < 7 * 86_400_000);

  const card = (g: Goal) => (
    <GoalCard
      key={g.id}
      name={g.name}
      icon={g.icon}
      target={g.target}
      saved={g.saved}
      currency={currency}
      status={g.status}
      deadline={goalDeadlineLabel(g) ?? (g.status === 'completed' ? undefined : 'no deadline')}
      pace={goalPace(g) ? `${formatMoneyAuto(goalPace(g) ?? 0, { currency })}/week to make it` : undefined}
      contributors={g.contributorIds.map((id) => members.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m).map((m) => ({ name: m.name, color: m.color }))}
      onClick={() => setOpenId(g.id)}
    />
  );

  return (
    <div className="bdg-stack goals">
      <PageHeader
        size="lg"
        title="Goals"
        subtitle={data.active.length ? `${data.active.length} active · ${formatMoneyAuto(data.savedTotal, { currency })} of ${formatMoneyAuto(data.targetTotal, { currency })} saved` : 'Nothing in progress'}
        actions={
          <>
            <Button size="sm" onClick={() => setAdding(true)}>
              Add a goal
            </Button>
            <ScreenActions />
          </>
        }
      />

      {justReached && tab === 'active' && (
        <Alert tone="success" title={`${justReached.name} reached its target`} action={<Button variant="ghost" size="sm" onClick={() => setTab('reached')}>See reached goals</Button>}>
          {formatMoneyAuto(justReached.target, { currency })} saved. Nice work, everyone.
        </Alert>
      )}

      <div className="bdg-grid-2">
        <StatCard compact label="Saved so far" value={data.savedTotal} currency={currency} caption={`${data.active.length} active ${data.active.length === 1 ? 'goal' : 'goals'}`} icon="🏦" />
        <StatCard compact label="Still to go" value={data.remainingTotal} currency={currency} caption={data.reached.length ? `${data.reached.length} reached` : 'Across active goals'} icon="🎯" />
      </div>

      <Tabs
        aria-label="Goal status"
        fullWidth
        value={tab}
        onChange={(v) => setTab(v as GoalTab)}
        items={[
          { value: 'active', label: 'Active', count: data.active.length },
          { value: 'reached', label: 'Reached', count: data.reached.length },
          { value: 'paused', label: 'Paused', count: data.paused.length },
        ]}
      />

      {list.length === 0 ? (
        tab === 'active' ? (
          <EmptyState icon="🎯" title="No goals yet" description="Set a target and the household can save towards it together." action={<Button onClick={() => setAdding(true)}>Add a goal</Button>} />
        ) : tab === 'reached' ? (
          <EmptyState compact icon="🏁" title="Nothing reached yet" description="Goals land here once their target is met." />
        ) : (
          <EmptyState compact icon="⏸️" title="Nothing paused" description="Pause a goal from its details to park it without losing progress." />
        )
      ) : (
        <div className="goals__grid">{list.map(card)}</div>
      )}

      <GoalFormDialog open={adding} onClose={() => setAdding(false)} />
      <GoalDialog goal={openGoal} onClose={() => setOpenId(null)} />
    </div>
  );
}
