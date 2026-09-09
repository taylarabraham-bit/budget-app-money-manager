import { useId } from 'react';
import { AmountInput, Avatar, Button, Card, MEMBER_COLORS, Select, TextField, type MemberColor } from '@budget-app/ui';
import { MEMBER_ROLES, type MemberRole } from '../../data/types';
import { currencyOptions } from '../setup/defaults';
import { newPayday, newPerson, nextFreeColor, personLimitValid, tooBigMessage, withinMax } from './draft';
import type { Draft } from './types';

export interface StepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  /** Continue was pressed on this step: show validation. */
  submitted: boolean;
}

const COLOR_LABEL: Record<MemberColor, string> = { coral: 'Coral', violet: 'Violet', sky: 'Sky', lime: 'Lime', rose: 'Rose', amber: 'Amber' };

export function HouseholdStep({ draft, update, submitted }: StepProps) {
  return (
    <div className="bdg-stack bdg-gap-4">
      <TextField label="Household name" placeholder="e.g. Priya & Sam" value={draft.name} onChange={(e) => update({ name: e.target.value })} error={submitted && !draft.name.trim() ? 'Give your household a name' : undefined} hint="Shows in the sidebar and on reports." fullWidth autoFocus />
      <Select label="Currency" options={currencyOptions(draft.currency)} value={draft.currency} onChange={(e) => update({ currency: e.target.value })} hint="Everything is shown in this currency. It can be changed later in Settings." fullWidth />
    </div>
  );
}

function ColorSwatches({ name, value, taken, onChange }: { name: string; value: MemberColor; taken: MemberColor[]; onChange: (c: MemberColor) => void }) {
  const id = useId();
  return (
    <div className="color-picker">
      <span className="color-picker__label" id={`${id}-label`}>
        Colour
      </span>
      <div className="color-picker__options" role="radiogroup" aria-labelledby={`${id}-label`}>
        {MEMBER_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={`${COLOR_LABEL[c]}${taken.includes(c) ? ' (used by another member)' : ''}`} title={COLOR_LABEL[c]} className="color-picker__option" onClick={() => onChange(c)}>
            <Avatar name={name.trim() || '?'} color={c} size="sm" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PeopleStep({ draft, update, submitted }: StepProps) {
  // "You" is the person using THIS device - on the partner's phone that is not
  // whoever the household lists first (audit OB-4). Shown first, never removable.
  const youId = draft.people.some((p) => p.id === draft.youId) ? draft.youId : draft.people[0]?.id;
  const ordered = [...draft.people.filter((p) => p.id === youId), ...draft.people.filter((p) => p.id !== youId)];
  const setPerson = (id: string, patch: Partial<Draft['people'][number]>) => update({ people: draft.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const remove = (id: string) => update({ people: draft.people.filter((p) => p.id !== id), paydays: draft.paydays.filter((p) => p.memberId !== id), bills: draft.bills.map((b) => (b.memberId === id ? { ...b, memberId: youId ?? b.memberId } : b)) });
  const add = () => {
    const person = newPerson('Partner', nextFreeColor(draft.people.map((p) => p.color)));
    update({ people: [...draft.people, person], paydays: [...draft.paydays, newPayday(person.id)], customPct: { ...draft.customPct, [person.id]: 0 } });
  };
  return (
    <div className="bdg-stack bdg-gap-3">
      {ordered.map((p, i) => {
        const you = p.id === youId;
        return (
          <Card
            key={p.id}
            padding="sm"
            title={you ? 'You' : i === 1 ? 'Your partner' : `Member ${i + 1}`}
            actions={
              !you ? (
                <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
                  Remove
                </Button>
              ) : undefined
            }
          >
            <div className="bdg-stack bdg-gap-3">
              <div className="onboarding__member-head">
                <Avatar name={p.name.trim() || '?'} color={p.color} size="md" />
                <TextField label="Name" placeholder={you ? 'Your name' : 'Their name'} value={p.name} onChange={(e) => setPerson(p.id, { name: e.target.value })} error={submitted && !p.name.trim() ? 'Enter a name' : undefined} fullWidth autoFocus={you} />
              </div>
              <div className="bdg-grid-2">
                <Select label="Role" options={MEMBER_ROLES.map((role) => ({ value: role, label: role }))} value={p.role} onChange={(e) => setPerson(p.id, { role: e.target.value as MemberRole })} fullWidth />
                <AmountInput
                  label="Monthly spending limit"
                  currency={draft.currency}
                  value={p.limit}
                  onValueChange={(v) => setPerson(p.id, { limit: v })}
                  error={submitted && !personLimitValid(p) ? (!withinMax(p.limit) ? tooBigMessage(draft.currency) : 'Enter a limit so safe-to-spend works') : undefined}
                  // A member with no personal cap keeps it unless a limit is typed (audit OB-13).
                  hint={p.noCap ? 'No personal cap at the moment - leave it empty to keep it that way.' : 'Their personal safe-to-spend each month.'}
                  fullWidth
                />
              </div>
              <ColorSwatches name={p.name} value={p.color} taken={draft.people.filter((o) => o.id !== p.id).map((o) => o.color)} onChange={(color) => setPerson(p.id, { color })} />
            </div>
          </Card>
        );
      })}
      {draft.people.length < MEMBER_COLORS.length && (
        <Button variant="secondary" onClick={add}>
          Add another member
        </Button>
      )}
    </div>
  );
}
