import { useEffect, useRef, useState } from 'react';
import { AmountInput, Button, Dialog, TextField } from '@budget-app/ui';
import { useHousehold } from '../data/store';
import type { HouseholdPatch } from '../data/types';
import { useNavigation } from '../navigation';
import { capMessage, overCap } from './amountCap';

interface HouseholdSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (patch: HouseholdPatch) => void;
}

/**
 * Household settings: the household's name and the daily earnings target
 * that the Overview's "Daily earnings" chart measures against. Currency,
 * who is using this device, backups and resets live on the Settings screen.
 */
export function HouseholdSettingsDialog({ open, onClose, onSubmit }: HouseholdSettingsDialogProps) {
  const { household } = useHousehold();
  const { openSettings } = useNavigation();
  const [name, setName] = useState(household.name);
  const [target, setTarget] = useState<number | null>(household.dailyEarningTarget);
  const [submitted, setSubmitted] = useState(false);

  // Reset on OPEN only, reading the live values through a ref: depending on
  // them meant a sync pull changing the household snapped the fields back to
  // the partner's values mid-typing (audit UI-10).
  const householdRef = useRef(household);
  householdRef.current = household;
  useEffect(() => {
    if (!open) return;
    setName(householdRef.current.name);
    setTarget(householdRef.current.dailyEarningTarget);
    setSubmitted(false);
  }, [open]);

  const nameError = submitted && !name.trim() ? 'Give the household a name' : undefined;
  const targetError =
    submitted && !(target != null && target >= 0) ? 'Enter a daily target (0 turns the target line off)' : submitted && overCap(target) ? capMessage(household.currency) : undefined;

  const save = () => {
    setSubmitted(true);
    if (!name.trim() || target == null || target < 0 || overCap(target)) return;
    onSubmit({ name: name.trim(), dailyEarningTarget: target });
  };

  const goToSettings = () => {
    onClose();
    openSettings();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Household settings"
      description="Shared by everyone in the household."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <TextField label="Household name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} fullWidth autoFocus />
        <AmountInput
          label="Daily earnings target"
          currency={household.currency}
          value={target}
          onValueChange={setTarget}
          error={targetError}
          hint="What the household aims to earn per day. Shown as the target line on the Daily earnings chart."
          fullWidth
        />
        <div className="bdg-row-between">
          <span className="bdg-text-xs bdg-text-muted">{`Currency (${household.currency}), who is using this device, backups and resets are in Settings.`}</span>
          <Button size="sm" variant="ghost" onClick={goToSettings}>
            Open Settings
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
