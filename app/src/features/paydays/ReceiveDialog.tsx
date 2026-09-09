import { useEffect, useRef, useState } from 'react';
import { AmountInput, Button, Dialog, TextField } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { isValidIsoDate, todayIso } from '../../lib/dates';
import type { IncomeSchedule } from './types';

interface ReceiveDialogProps {
  payday: IncomeSchedule | null;
  currency: string;
  onClose: () => void;
  onSubmit: (amount: number, receivedOn: string) => void;
}

/** For paydays whose amount varies: confirm what actually came in and when. */
export function ReceiveDialog({ payday, currency, onClose, onSubmit }: ReceiveDialogProps) {
  const [amount, setAmount] = useState<number | null>(payday?.amount ?? null);
  const [date, setDate] = useState(todayIso());
  const [submitted, setSubmitted] = useState(false);

  // Reset when the dialog opens on a payday, reading its amount through a ref:
  // depending on the amount meant a sync pull re-pricing the schedule wiped what
  // was typed mid-entry (audit UI-10).
  const paydayRef = useRef(payday);
  paydayRef.current = payday;
  useEffect(() => {
    setAmount(paydayRef.current?.amount ?? null);
    setDate(todayIso());
    setSubmitted(false);
  }, [payday?.id]);

  if (!payday) return null;
  const amountError = submitted && !(amount && amount > 0) ? 'Enter what actually came in' : submitted && overCap(amount) ? capMessage(currency) : undefined;
  const dateError = submitted && (!isValidIsoDate(date) || date > todayIso()) ? 'Pick today or an earlier day' : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${payday.name} received`}
      description="Enter what actually came in. It is logged as income and the next payday moves forward."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setSubmitted(true);
              if (!(amount && amount > 0) || overCap(amount) || !isValidIsoDate(date) || date > todayIso()) return;
              onSubmit(amount, date);
            }}
          >
            Log income
          </Button>
        </>
      }
    >
      <div className="bdg-stack">
        <AmountInput label="Amount" currency={currency} value={amount} onValueChange={setAmount} error={amountError} fullWidth autoFocus />
        <TextField type="date" label="Received on" value={date} onChange={(e) => setDate(e.target.value)} error={dateError} fullWidth />
      </div>
    </Dialog>
  );
}
