import { useEffect, useState } from 'react';
import { AmountInput, Button, Dialog, Select, TextField } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { useHousehold } from '../../data/store';
import { DEFAULT_SHOPPING_CATEGORY, type ListItem, type ListItemInput } from './types';

interface ListItemDialogProps {
  open: boolean;
  /** Editing an existing shopping item; omit to add one with details. */
  item?: ListItem;
  onClose: () => void;
  onSubmit: (input: Omit<ListItemInput, 'list'>) => void;
  onDelete?: () => void;
}

/** Add (with details) or edit a shopping-list item: name, estimate, category, note. */
export function ListItemDialog({ open, item, onClose, onSubmit, onDelete }: ListItemDialogProps) {
  const { categories, household } = useHousehold();
  const expense = categories.filter((c) => c.kind === 'expense');
  const defaultCategory = expense.find((c) => c.id === DEFAULT_SHOPPING_CATEGORY)?.id ?? expense[0]?.id ?? '';
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState<number | null>(item?.estimatedAmount ?? null);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategory);
  const [note, setNote] = useState(item?.note ?? '');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setAmount(item?.estimatedAmount ?? null);
    setCategoryId(item?.categoryId ?? defaultCategory);
    setNote(item?.note ?? '');
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const nameError = submitted && !name.trim() ? 'What is it?' : undefined;
  // Optional, but still capped: a typo here lands in the list total (audit UX-6).
  const amountError = submitted && overCap(amount) ? capMessage(household.currency) : undefined;
  const save = () => {
    setSubmitted(true);
    if (!name.trim() || overCap(amount)) return;
    onSubmit({ name, estimatedAmount: amount, categoryId, note });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={item ? `Edit ${item.name}` : 'Add to the shopping list'}
      footer={
        <>
          {item && onDelete && (
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{item ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <TextField label="Item" placeholder="Milk, bread, dish soap…" value={name} onChange={(e) => setName(e.target.value)} error={nameError} fullWidth autoFocus={!item} />
        <AmountInput label="Estimated price" currency={household.currency} value={amount} onValueChange={setAmount} error={amountError} hint="Optional - helps the list add up." fullWidth />
        <Select label="Category" options={expense.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} fullWidth />
        <TextField label="Note" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      </div>
    </Dialog>
  );
}
