import { useEffect, useState } from 'react';
import { AmountInput, Button, Dialog, Select, Tabs, TextField } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { memberOptionsFor } from '../../components/memberOptions';
import { useHousehold } from '../../data/store';
import { DEFAULT_WISH_CATEGORY, PRIORITY_LABEL, PRIORITY_ORDER, type ListItem, type ListItemInput, type WishPriority } from './types';

interface WishFormDialogProps {
  open: boolean;
  item?: ListItem;
  onClose: () => void;
  onSubmit: (input: Omit<ListItemInput, 'list'>) => void;
}

const validUrl = (u: string) => {
  if (!u.trim()) return true;
  try {
    new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return true;
  } catch {
    return false;
  }
};

/** Add or edit a wish: name, price, who wants it, priority, category, link, note. */
export function WishFormDialog({ open, item, onClose, onSubmit }: WishFormDialogProps) {
  const { categories, members, currentMemberId, household } = useHousehold();
  const expense = categories.filter((c) => c.kind === 'expense');
  const defaultCategory = expense.find((c) => c.id === DEFAULT_WISH_CATEGORY)?.id ?? expense[0]?.id ?? '';
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState<number | null>(item?.estimatedAmount ?? null);
  const [addedBy, setAddedBy] = useState(item?.addedBy ?? currentMemberId);
  const [priority, setPriority] = useState<WishPriority>(item?.priority ?? 'medium');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategory);
  const [url, setUrl] = useState(item?.url ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setAmount(item?.estimatedAmount ?? null);
    setAddedBy(item?.addedBy ?? currentMemberId);
    setPriority(item?.priority ?? 'medium');
    setCategoryId(item?.categoryId ?? defaultCategory);
    setUrl(item?.url ?? '');
    setNote(item?.note ?? '');
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const nameError = submitted && !name.trim() ? 'What is it?' : undefined;
  const amountError =
    submitted && !(amount && amount > 0) ? 'Add a price so the household knows what it costs' : submitted && overCap(amount) ? capMessage(household.currency) : undefined;
  const urlError = submitted && !validUrl(url) ? 'That does not look like a link' : undefined;

  const save = () => {
    setSubmitted(true);
    if (!name.trim() || !(amount && amount > 0) || overCap(amount) || !validUrl(url)) return;
    onSubmit({ name, estimatedAmount: amount, addedBy, priority, categoryId, url, note });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'Add a wish'}
      description={item ? undefined : "Bigger things you'd like one day. The household can see what is worth saving for."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{item ? 'Save' : 'Add wish'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <TextField label="Name" placeholder="Standing desk, a weekend away…" value={name} onChange={(e) => setName(e.target.value)} error={nameError} fullWidth autoFocus={!item} />
        <AmountInput label="Estimated price" currency={household.currency} value={amount} onValueChange={setAmount} error={amountError} fullWidth />
        <Select label="Who wants it" options={memberOptionsFor(members, addedBy)} value={addedBy} onChange={(e) => setAddedBy(e.target.value)} fullWidth />
        <div className="bdg-stack bdg-gap-1">
          <span className="bdg-text-sm bdg-font-medium">Priority</span>
          <Tabs variant="segmented" fullWidth aria-label="Priority" value={priority} onChange={(v) => setPriority(v as WishPriority)} items={[...PRIORITY_ORDER].reverse().map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        </div>
        <Select label="Category" options={expense.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} fullWidth />
        <TextField type="url" label="Link" placeholder="Optional" value={url} onChange={(e) => setUrl(e.target.value)} error={urlError} fullWidth />
        <TextField label="Note" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
