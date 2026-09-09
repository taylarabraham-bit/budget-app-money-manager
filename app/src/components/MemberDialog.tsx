import { useEffect, useId, useState } from 'react';
import { firstName } from '../data/split';
import { AmountInput, Avatar, Button, Dialog, MEMBER_COLORS, Select, TextField, memberColorFor, type MemberColor } from '@budget-app/ui';
import { useHousehold } from '../data/store';
import { MEMBER_ROLES, type HouseholdMember, type NewMemberInput } from '../data/types';
import { capMessage, overCap } from './amountCap';

interface MemberDialogProps {
  open: boolean;
  /** Editing an existing member; omit to add a new one. */
  member?: HouseholdMember;
  onClose: () => void;
  onSubmit: (input: NewMemberInput) => void;
  /** Edit mode only: asks to remove the member (the screen confirms). */
  onRemove?: () => void;
}

interface FormState {
  name: string;
  role: NewMemberInput['role'];
  color: MemberColor;
  monthlyLimit: number | null;
}

const COLOR_LABEL: Record<MemberColor, string> = { coral: 'Coral', violet: 'Violet', sky: 'Sky', lime: 'Lime', rose: 'Rose', amber: 'Amber' };

/** Six member colours as a radio group of avatar previews. */
function ColorPicker({ name, value, taken, onChange }: { name: string; value: MemberColor; taken: MemberColor[]; onChange: (c: MemberColor) => void }) {
  const id = useId();
  return (
    <div className="color-picker">
      <span className="color-picker__label" id={`${id}-label`}>
        Colour
      </span>
      <div className="color-picker__options" role="radiogroup" aria-labelledby={`${id}-label`}>
        {MEMBER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            aria-label={`${COLOR_LABEL[c]}${taken.includes(c) ? ' (used by another member)' : ''}`}
            title={taken.includes(c) ? `${COLOR_LABEL[c]} - used by another member` : COLOR_LABEL[c]}
            className="color-picker__option"
            onClick={() => onChange(c)}
          >
            <Avatar name={name.trim() || '?'} color={c} size="sm" />
          </button>
        ))}
      </div>
      {taken.includes(value) && <span className="bdg-text-xs bdg-text-muted">Another member already uses this colour - it still works, but a unique one is easier to tell apart.</span>}
    </div>
  );
}

/**
 * Add or edit a household member: name, role, colour and their personal
 * monthly budget. Until the Supabase backend exists, "adding" a member just
 * creates their record - there is no invite email yet.
 */
export function MemberDialog({ open, member, onClose, onSubmit, onRemove }: MemberDialogProps) {
  const { members, household, currentMemberId } = useHousehold();
  const editing = !!member;

  const freeColor = (): MemberColor => MEMBER_COLORS.find((c) => !members.some((m) => m.color === c)) ?? MEMBER_COLORS[0]!;
  const initial = (): FormState =>
    member
      ? { name: member.name, role: member.role, color: member.color, monthlyLimit: member.monthlyLimit }
      : { name: '', role: 'Partner', color: freeColor(), monthlyLimit: null };

  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [colorTouched, setColorTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial());
      setSubmitted(false);
      setColorTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  // Suggest a colour from the name until the user picks one, so new members
  // get a stable default; never override a deliberate choice.
  const onName = (name: string) => {
    setForm((f) => ({ ...f, name, color: !editing && !colorTouched && members.every((m) => m.color !== memberColorFor(name)) ? memberColorFor(name) : f.color }));
  };

  // Two "Sam"s are indistinguishable in every picker and collide as React keys (audit UX-14).
  const duplicateName = members.some((m) => m.id !== member?.id && m.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const nameError = submitted && !form.name.trim() ? 'Enter their name' : submitted && duplicateName ? 'Someone in the household already has that name' : undefined;
  const limitError =
    submitted && !(form.monthlyLimit != null && form.monthlyLimit >= 0)
      ? 'Enter a monthly budget (0 is fine)'
      : submitted && overCap(form.monthlyLimit)
        ? capMessage(household.currency)
        : undefined;
  const takenColors = members.filter((m) => m.id !== member?.id).map((m) => m.color);
  const isSelf = member?.id === currentMemberId;

  const save = () => {
    setSubmitted(true);
    if (!form.name.trim() || duplicateName || form.monthlyLimit == null || form.monthlyLimit < 0 || overCap(form.monthlyLimit)) return;
    onSubmit({ name: form.name, role: form.role, color: form.color, monthlyLimit: form.monthlyLimit });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${firstName(member.name)}` : 'Add a member'}
      description={
        editing
          ? 'Their budget limit applies from this month.'
          : // No invite emails exist: the partner joins from their own phone (audit UI-16).
            'Everyone in the household gets their own personal budget. Your partner joins from the setup screen on their own phone - Settings → Sync on this device shows the server details to enter there.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? 'Save changes' : 'Add member'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <TextField label="Name" placeholder="Their name" value={form.name} onChange={(e) => onName(e.target.value)} error={nameError} fullWidth autoFocus={!editing} />
        <Select label="Role" options={MEMBER_ROLES.map((r) => ({ value: r, label: r }))} value={form.role} onChange={(e) => set('role', e.target.value as NewMemberInput['role'])} hint="Roles are labels for now - everyone can log purchases." fullWidth />
        <ColorPicker
          name={form.name}
          value={form.color}
          taken={takenColors}
          onChange={(c) => {
            setColorTouched(true);
            set('color', c);
          }}
        />
        <AmountInput
          label="Monthly budget"
          currency={household.currency}
          value={form.monthlyLimit}
          onValueChange={(v) => set('monthlyLimit', v)}
          error={limitError}
          hint="Their personal spending ceiling for a month, across every category."
          fullWidth
        />
        {editing && onRemove && (
          <div className="bdg-row-between">
            <span className="bdg-text-xs bdg-text-muted">{isSelf ? 'You cannot remove yourself.' : 'Past purchases stay in Activity.'}</span>
            <Button size="sm" variant="danger" onClick={onRemove} disabled={isSelf}>
              Remove member
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
