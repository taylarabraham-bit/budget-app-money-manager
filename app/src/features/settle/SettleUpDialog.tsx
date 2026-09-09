import { useEffect, useRef, useState } from 'react';
import { AmountInput, Button, Dialog, Select, Tabs, TextField, formatMoneyAuto } from '@budget-app/ui';
import { capMessage } from '../../components/amountCap';
import { MAX_AMOUNT, firstName, roundMoney } from '../../data/split';
import type { HouseholdMember } from '../../data/types';
import { METHOD_LABEL, SETTLEMENT_METHODS, type SettlementInput, type SettlementMethod } from './types';

interface SettleUpDialogProps {
  open: boolean;
  /** The signed-in member. */
  me: HouseholdMember;
  /** The member being settled with. */
  other: HouseholdMember;
  /** Signed balance from my side: positive = they owe me. */
  net: number;
  currency: string;
  onClose: () => void;
  onSubmit: (input: SettlementInput) => void;
}

/** Record a payment that settles (part of) the balance between two members. */
export function SettleUpDialog({ open, me, other, net, currency, onClose, onSubmit }: SettleUpDialogProps) {
  const [amount, setAmount] = useState<number | null>(Math.abs(net) || null);
  const [method, setMethod] = useState<SettlementMethod>('transfer');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Who actually paid - suggested by the balance's direction, but a payment can go
  // against the flow (paying ahead, correcting a mistake), so it is the user's call.
  const [payer, setPayer] = useState<'me' | 'other'>(net < 0 ? 'me' : 'other');

  // Reset on OPEN only. Depending on `net` meant a background sync shifting the
  // balance mid-entry wiped the typed amount and flipped the payer (QA MF-8);
  // the "Afterwards…" preview below still uses the live net, so what gets
  // recorded is always previewed against the current balance.
  const netRef = useRef(net);
  netRef.current = net;
  useEffect(() => {
    if (!open) return;
    setAmount(Math.abs(netRef.current) || null);
    setMethod('transfer');
    setNote('');
    setSubmitted(false);
    setPayer(netRef.current < 0 ? 'me' : 'other');
  }, [open]);

  const iPay = payer === 'me';
  const otherName = firstName(other.name);
  const balance = Math.abs(net);
  // The store records whole cents - preview with the SAME quantized amount, so
  // "Afterwards…" always equals the ledger that results (even for "0.005").
  const recordable = amount && amount > 0 ? roundMoney(amount) : null;
  const amountError =
    submitted && !(recordable && recordable > 0)
      ? 'Enter an amount of at least one cent'
      : submitted && recordable && recordable > MAX_AMOUNT
        ? capMessage(currency)
        : undefined;
  // net is signed + = they owe me. Me paying raises my credit; them paying lowers it.
  const after = recordable ? (iPay ? net + recordable : net - recordable) : null;
  const hint =
    after == null
      ? undefined
      : Math.abs(after) < 0.005
        ? "Afterwards you'll be all square."
        : `Afterwards ${after > 0 ? `${otherName} will owe you` : `you will owe ${otherName}`} ${formatMoneyAuto(Math.abs(after), { currency })}.`;

  const save = () => {
    setSubmitted(true);
    if (!(recordable && recordable > 0) || recordable > MAX_AMOUNT) return;
    onSubmit({ fromMemberId: iPay ? me.id : other.id, toMemberId: iPay ? other.id : me.id, amount: recordable, method, note });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Settle up"
      description={net === 0 ? `Record a payment between you and ${otherName}.` : net < 0 ? `You owe ${otherName} ${formatMoneyAuto(balance, { currency })}.` : `${otherName} owes you ${formatMoneyAuto(balance, { currency })}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Record payment</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <Tabs
          variant="segmented"
          fullWidth
          aria-label="Who pays"
          value={payer}
          onChange={(v) => setPayer(v as 'me' | 'other')}
          items={[
            { value: 'other', label: `${otherName} pays you` },
            { value: 'me', label: `You pay ${otherName}` },
          ]}
        />
        <AmountInput label="Amount" currency={currency} value={amount} onValueChange={setAmount} error={amountError} hint={hint} fullWidth autoFocus />
        <Select label="How" options={SETTLEMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} value={method} onChange={(e) => setMethod(e.target.value as SettlementMethod)} fullWidth />
        <TextField label="Note" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
