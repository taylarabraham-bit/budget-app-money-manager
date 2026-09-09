import { useEffect, useState } from 'react';
import { Amount, AmountInput, Avatar, Badge, Button, Dialog, ProgressBar, Select, formatMoneyAuto, formatPercent } from '@budget-app/ui';
import { goalDeadlineLabel, goalPace, goalWeeksLeft, selectGoalContributions } from '../data/selectors';
import { firstName, toCents } from '../data/split';
import { useHousehold } from '../data/store';
import type { Goal } from '../data/types';
import { capMessage, overCap } from './amountCap';

interface GoalDialogProps {
  goal: Goal | null;
  onClose: () => void;
}

type Mode = 'detail' | 'contribute' | 'confirm-delete';

/** One goal: progress, pace and contributors, with Add money, Pause/Resume and Delete. */
export function GoalDialog({ goal, onClose }: GoalDialogProps) {
  const state = useHousehold();
  const { members, currentMemberId, household, contributeToGoal, updateGoal, removeGoal } = state;
  const [mode, setMode] = useState<Mode>('detail');
  const [amount, setAmount] = useState<number | null>(null);
  const [memberId, setMemberId] = useState(currentMemberId);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setMode('detail');
    setAmount(null);
    setMemberId(currentMemberId);
    setSubmitted(false);
  }, [goal?.id, currentMemberId]);

  if (!goal) return null;
  const currency = household.currency;
  const done = goal.status === 'completed' || goal.saved >= goal.target;
  // In cents: the float difference of two dollar amounts carries dust that a later ceil rounds up a whole dollar (audit MON-9).
  const remainingCents = Math.max(0, toCents(goal.target) - toCents(goal.saved));
  const remaining = remainingCents / 100;
  const pace = goalPace(goal);
  const weeks = goalWeeksLeft(goal);
  const contributors = goal.contributorIds.map((id) => members.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  const ledger = selectGoalContributions(state, goal.id);

  if (mode === 'confirm-delete') {
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title="Delete this goal?"
        description={`${goal.name} and its ${formatMoneyAuto(goal.saved, { currency })} saved so far will be removed from the household. It cannot be undone.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode('detail')}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                removeGoal(goal.id);
                onClose();
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    );
  }

  if (mode === 'contribute') {
    const error = submitted && !(amount && amount > 0) ? 'Enter an amount greater than zero' : submitted && overCap(amount) ? capMessage(currency) : undefined;
    const save = () => {
      setSubmitted(true);
      if (!(amount && amount > 0) || overCap(amount)) return;
      contributeToGoal({ goalId: goal.id, amount, memberId });
      setMode('detail');
      setAmount(null);
      setSubmitted(false);
    };
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title={`Add to ${goal.name}`}
        description={`${formatMoneyAuto(remaining, { currency })} to go${pace ? ` · ${formatMoneyAuto(pace, { currency })}/week keeps you on pace` : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode('detail')}>
              Back
            </Button>
            <Button onClick={save}>Add to goal</Button>
          </>
        }
      >
        <div className="bdg-stack">
          <AmountInput label="Amount" currency={currency} value={amount} onValueChange={setAmount} error={error} fullWidth autoFocus />
          <Select label="From" options={members.map((m) => ({ value: m.id, label: m.name }))} value={memberId} onChange={(e) => setMemberId(e.target.value)} fullWidth />
          {pace && (
            <div className="bdg-row bdg-wrap bdg-gap-2">
              {[pace, Math.ceil(pace * 2), Math.ceil(remainingCents / 400)].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i).map((v) => (
                <Button key={v} variant="secondary" size="sm" onClick={() => setAmount(v)}>
                  {formatMoneyAuto(v, { currency })}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="bdg-row bdg-gap-2">
          <span aria-hidden="true">{goal.icon}</span>
          {goal.name}
        </span>
      }
      description={goalDeadlineLabel(goal) ? `Reach it ${goalDeadlineLabel(goal)}${weeks ? ` · ${weeks} ${weeks === 1 ? 'week' : 'weeks'} left` : ''}` : 'No deadline'}
      footer={
        <>
          <Button variant="secondary" onClick={() => updateGoal(goal.id, { status: goal.status === 'paused' ? 'active' : 'paused' })} disabled={done}>
            {goal.status === 'paused' ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="danger" onClick={() => setMode('confirm-delete')}>
            Delete
          </Button>
          {!done && <Button onClick={() => setMode('contribute')}>Add money</Button>}
        </>
      }
    >
      <div className="bdg-stack">
        <div className="bdg-row-between">
          <div className="bdg-row bdg-gap-2" style={{ alignItems: 'baseline' }}>
            <Amount value={goal.saved} currency={currency} tone="neutral" size="xl" weight="bold" wholeOnly={Number.isInteger(goal.saved)} />
            <span className="bdg-text-sm bdg-text-muted">of {formatMoneyAuto(goal.target, { currency })}</span>
          </div>
          {done ? (
            <Badge tone="positive" dot>
              Reached
            </Badge>
          ) : goal.status === 'paused' ? (
            <Badge tone="neutral">Paused</Badge>
          ) : (
            <Badge tone="info">{formatPercent(Math.min(1, goal.saved / goal.target))}</Badge>
          )}
        </div>
        <ProgressBar value={Math.min(goal.saved, goal.target)} max={goal.target} tone={done ? 'positive' : goal.status === 'paused' ? 'neutral' : 'primary'} />
        <div className="txn-detail">
          <div className="txn-detail__row">
            <span className="txn-detail__label">Still to go</span>
            <span className="txn-detail__value">{done ? 'Nothing - goal reached' : formatMoneyAuto(remaining, { currency })}</span>
          </div>
          {pace && !done && (
            <div className="txn-detail__row">
              <span className="txn-detail__label">Pace to make it</span>
              <span className="txn-detail__value">{formatMoneyAuto(pace, { currency })}/week</span>
            </div>
          )}
          <div className="txn-detail__row">
            <span className="txn-detail__label">Contributing</span>
            <span className="txn-detail__value bdg-row bdg-gap-1">
              {contributors.map((m) => (
                <Avatar key={m.id} name={m.name} color={m.color} size="xs" />
              ))}
              <span style={{ marginLeft: 4 }}>{contributors.map((m) => firstName(m.name)).join(', ') || 'Nobody yet'}</span>
            </span>
          </div>
        </div>
        {ledger.length > 0 && (
          <div className="bdg-stack bdg-gap-2">
            <span className="bdg-section-title">Recent deposits</span>
            <div className="txn-detail">
              {ledger.slice(0, 4).map((c) => {
                const m = members.find((x) => x.id === c.memberId);
                return (
                  <div key={c.id} className="txn-detail__row">
                    <span className="bdg-row bdg-gap-2">
                      {m && <Avatar name={m.name} color={m.color} size="xs" />}
                      <span>
                        {firstName(m?.name ?? 'Someone')}
                        <span className="bdg-text-muted"> · {new Date(c.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                      </span>
                    </span>
                    <Amount value={c.amount} currency={currency} tone="positive" signDisplay="exceptZero" size="sm" />
                  </div>
                );
              })}
              {ledger.length > 4 && <div className="bdg-text-xs bdg-text-subtle" style={{ padding: '8px 0' }}>{ledger.length - 4} earlier</div>}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
