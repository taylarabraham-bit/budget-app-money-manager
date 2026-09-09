import { useEffect, useRef, useState } from 'react';
import { AmountInput, Button, Dialog, TextField, formatMoneyAuto } from '@budget-app/ui';
import { useHousehold } from '../data/store';
import type { Category, CategoryInput } from '../data/types';
import { clampGraphemes } from '../lib/graphemes';
import { capMessage, overCap } from './amountCap';

interface CategoryLimitDialogProps {
  open: boolean;
  /** Editing an existing category; omit to add a new expense category. */
  category?: Category;
  /** Spent in this category so far this month (edit mode), for context. */
  spent?: number;
  onClose: () => void;
  onSubmit: (input: CategoryInput) => void;
}

/**
 * Set a category's monthly limit (and its name/icon). Limits are
 * household-wide: every member's purchases in the category count towards it.
 */
export function CategoryLimitDialog({ open, category, spent = 0, onClose, onSubmit }: CategoryLimitDialogProps) {
  const { household, categories } = useHousehold();
  const editing = !!category;
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [limit, setLimit] = useState<number | null>(category?.limit ?? null);
  const [submitted, setSubmitted] = useState(false);

  // Reset on OPEN (and on which category) only, reading the row through a ref:
  // depending on the row object meant a sync pull touching it snapped the
  // fields back to the partner's values mid-typing (audit UI-10).
  const categoryRef = useRef(category);
  categoryRef.current = category;
  useEffect(() => {
    if (!open) return;
    const c = categoryRef.current;
    setName(c?.name ?? '');
    setIcon(c?.icon ?? '');
    setLimit(c?.limit ?? null);
    setSubmitted(false);
  }, [open, category?.id]);

  const money = (v: number) => formatMoneyAuto(v, { currency: household.currency });
  // Two "Groceries" are indistinguishable in every select and filter (audit UX-14).
  const duplicateName = categories.some((c) => c.id !== category?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const nameError = submitted && !name.trim() ? 'Name the category' : submitted && duplicateName ? 'A category with that name already exists' : undefined;
  const limitError =
    submitted && !(limit != null && limit >= 0) ? 'Enter a monthly limit (0 means no limit)' : submitted && overCap(limit) ? capMessage(household.currency) : undefined;
  const limitHint = editing && spent > 0 ? `${money(spent)} spent so far this month.` : 'Shared by the whole household.';

  const save = () => {
    setSubmitted(true);
    if (!name.trim() || duplicateName || limit == null || limit < 0 || overCap(limit)) return;
    onSubmit({ name: name.trim(), icon: icon.trim() || '🏷️', limit });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={editing ? `${category.icon} ${category.name}` : 'Add a category'}
      description={editing ? 'Monthly limit for the whole household.' : 'A new spending category with its own monthly limit.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? 'Save limit' : 'Add category'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <AmountInput label="Monthly limit" currency={household.currency} value={limit} onValueChange={setLimit} error={limitError} hint={limitHint} fullWidth autoFocus />
        <div className="bdg-row bdg-gap-2" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 88px' }}>
            <TextField label="Icon" placeholder="🛒" value={icon} onChange={(e) => setIcon(clampGraphemes(e.target.value, 2))} fullWidth />
          </div>
          <div className="bdg-grow">
            <TextField label="Name" placeholder="Groceries" value={name} onChange={(e) => setName(e.target.value)} error={nameError} fullWidth />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
