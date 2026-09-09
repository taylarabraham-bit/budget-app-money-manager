import { useEffect, useState } from 'react';
import { AmountInput, Avatar, Button, Checkbox, Dialog, TextField } from '@budget-app/ui';
import { useHousehold } from '../data/store';
import { todayIso } from '../lib/dates';
import { capMessage, overCap } from './amountCap';

interface GoalFormDialogProps {
  open: boolean;
  onClose: () => void;
}

const ICONS: Array<[string, string]> = [
  ['🎯', 'Target'], ['✈️', 'Holiday'], ['🏠', 'Home'], ['🚗', 'Car'], ['🚲', 'Bike'], ['💻', 'Laptop'], ['📱', 'Phone'], ['🎓', 'Education'],
  ['🛟', 'Emergency fund'], ['🎁', 'Gift'], ['💍', 'Wedding'], ['🐶', 'Pet'], ['🎸', 'Hobby'], ['🏖️', 'Beach'], ['🧸', 'Kids'],
];

/** "Add a goal": name, icon, target, optional head start, deadline and who is contributing. */
export function GoalFormDialog({ open, onClose }: GoalFormDialogProps) {
  const { members, currentMemberId, household, addGoal } = useHousehold();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [target, setTarget] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [deadline, setDeadline] = useState('');
  const [contributors, setContributors] = useState<string[]>([currentMemberId]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setIcon('🎯');
    setTarget(null);
    setSaved(null);
    setDeadline('');
    setContributors([currentMemberId]);
    setSubmitted(false);
  }, [open, currentMemberId]);

  const nameError = submitted && !name.trim() ? 'Give the goal a name' : undefined;
  const targetError = submitted && !(target && target > 0) ? 'Enter a target greater than zero' : submitted && overCap(target) ? capMessage(household.currency) : undefined;
  const savedError = submitted && overCap(saved) ? capMessage(household.currency) : undefined;
  const contributorsError = submitted && contributors.length === 0 ? 'Pick at least one member' : undefined;
  // A typo'd past year would demand the whole amount "this week" and never remind (QA UX-11).
  const submittedDeadlineError = submitted && deadline && deadline < todayIso() ? 'Pick today or a later day' : undefined;

  const save = () => {
    setSubmitted(true);
    if (!name.trim() || !(target && target > 0) || overCap(target) || overCap(saved) || contributors.length === 0 || (deadline && deadline < todayIso())) return;
    addGoal({ name, icon, target, saved: saved ?? 0, deadlineDate: deadline || undefined, contributorIds: contributors });
    onClose();
  };

  const toggle = (id: string) => setContributors((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a goal"
      description="Something the household is saving towards."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save goal</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <TextField label="Name" placeholder="e.g. Holiday fund" value={name} onChange={(e) => setName(e.target.value)} error={nameError} fullWidth autoFocus />
        <div className="bdg-stack bdg-gap-2">
          <span className="bdg-field__label">Icon</span>
          <div className="goal-icons" role="radiogroup" aria-label="Icon">
            {ICONS.map(([i, label]) => (
              <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={label} title={label} className={`goal-icons__item${icon === i ? ' goal-icons__item--active' : ''}`} onClick={() => setIcon(i)}>
                <span aria-hidden="true">{i}</span>
              </button>
            ))}
          </div>
        </div>
        <AmountInput label="Target" currency={household.currency} value={target} onValueChange={setTarget} error={targetError} fullWidth />
        <AmountInput label="Already saved" size="md" currency={household.currency} value={saved} onValueChange={setSaved} error={savedError} hint="Optional head start" fullWidth />
        <TextField
          label="Reach it by"
          type="date"
          value={deadline}
          min={todayIso()}
          onChange={(e) => setDeadline(e.target.value)}
          error={submittedDeadlineError}
          hint="Optional - sets the weekly pace"
          fullWidth
        />
        <div className="bdg-stack bdg-gap-3">
          <span className="bdg-field__label">Who's contributing</span>
          {members.map((m) => (
            <Checkbox
              key={m.id}
              label={
                <span className="bdg-row bdg-gap-2">
                  <Avatar name={m.name} color={m.color} size="xs" aria-hidden="true" />
                  {m.name}
                </span>
              }
              checked={contributors.includes(m.id)}
              onChange={() => toggle(m.id)}
            />
          ))}
          {contributorsError && <div className="bdg-field__message bdg-field__message--error">{contributorsError}</div>}
        </div>
      </div>
    </Dialog>
  );
}
