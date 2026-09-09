import { useEffect, useMemo, useState } from 'react';
import { AmountInput, Button, Checkbox, Dialog, EmptyState, Select, TextField, formatMoneyAuto } from '@budget-app/ui';
import { capMessage, overCap } from '../../components/amountCap';
import { useHousehold } from '../../data/store';
import { clampGraphemes } from '../../lib/graphemes';
import { useQuickAdds } from './store';
import type { QuickAdd } from './types';
import './quickadd.css';

interface QuickAddManageDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Draft {
  title: string;
  amount: number | null;
  categoryId: string;
  shared: boolean;
  icon: string;
}

/** Rename, re-price, re-categorise or delete favourites. */
export function QuickAddManageDialog({ open, onClose }: QuickAddManageDialogProps) {
  const { categories, household } = useHousehold();
  const { quickAdds, updateQuickAdd, removeQuickAdd } = useQuickAdds();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // The row whose Delete is awaiting a second tap (audit UI-24).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const currency = household.currency;
  const sorted = useMemo(() => [...quickAdds].sort((a, b) => a.kind.localeCompare(b.kind) || b.useCount - a.useCount), [quickAdds]);
  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  // The provider keeps this dialog mounted, so a half-edited row (and its
  // errors) used to come back next time it opened (audit UX-8).
  useEffect(() => {
    if (open) return;
    setEditingId(null);
    setDraft(null);
    setSubmitted(false);
    setConfirmingId(null);
  }, [open]);

  const startEdit = (q: QuickAdd) => {
    setEditingId(q.id);
    setDraft({ title: q.title, amount: q.amount, categoryId: q.categoryId, shared: !!q.shared, icon: q.icon ?? '' });
    setSubmitted(false);
    setConfirmingId(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setSubmitted(false);
  };
  const saveEdit = () => {
    if (!editingId || !draft) return;
    setSubmitted(true);
    if (!draft.title.trim() || !(draft.amount && draft.amount > 0) || overCap(draft.amount)) return;
    updateQuickAdd(editingId, { title: draft.title, amount: draft.amount, categoryId: draft.categoryId, shared: draft.shared, icon: draft.icon.trim() });
    cancelEdit();
  };
  const amountError = !submitted || !draft ? undefined : !(draft.amount && draft.amount > 0) ? 'Enter an amount above zero' : overCap(draft.amount) ? capMessage(currency) : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Favourites"
      description="One-tap shortcuts in the Log purchase dialog."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {sorted.length === 0 ? (
        <EmptyState compact icon="⭐" title="No favourites yet" description='Tick "Save as favourite" when logging something you buy often.' />
      ) : (
        <div className="quickadd-list">
          {sorted.map((q) => (
            <div key={q.id} className="quickadd-row">
              {editingId === q.id && draft ? (
                <div className="bdg-stack bdg-gap-2 quickadd-row__form">
                  <div className="bdg-grid-2">
                    <TextField label="Name" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} error={submitted && !draft.title.trim() ? 'Name the favourite' : undefined} fullWidth autoFocus />
                    <AmountInput label="Amount" currency={currency} value={draft.amount} onValueChange={(v) => setDraft({ ...draft, amount: v })} error={amountError} fullWidth />
                  </div>
                  <div className="bdg-grid-2">
                    <Select label="Category" options={categories.filter((c) => c.kind === q.kind).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} fullWidth />
                    <TextField label="Icon" placeholder="☕" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: clampGraphemes(e.target.value, 2) })} fullWidth />
                  </div>
                  {q.kind === 'expense' && <Checkbox label="Shared" checked={draft.shared} onChange={(e) => setDraft({ ...draft, shared: e.target.checked })} />}
                  <div className="bdg-row bdg-gap-2">
                    <Button size="sm" onClick={saveEdit}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="quickadd-row__icon" aria-hidden="true">
                    {q.icon || categoryOf(q.categoryId)?.icon || (q.kind === 'income' ? '💼' : '🧾')}
                  </span>
                  <span className="quickadd-row__body">
                    <span className="quickadd-row__title">{q.title}</span>
                    <span className="bdg-text-xs bdg-text-muted">
                      {confirmingId === q.id ? (
                        'Delete this favourite? Re-adding it means re-entering the amount, category and split.'
                      ) : (
                        <>
                          {formatMoneyAuto(q.amount, { currency })} · {categoryOf(q.categoryId)?.name ?? 'Uncategorised'}
                          {q.shared ? ' · shared' : ''}
                          {q.useCount > 0 ? ` · used ${q.useCount}×` : ''}
                        </>
                      )}
                    </span>
                  </span>
                  {confirmingId === q.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                        Keep
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          removeQuickAdd(q.id);
                          setConfirmingId(null);
                        }}
                        aria-label={`Confirm deleting ${q.title}`}
                      >
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(q)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setConfirmingId(q.id)} aria-label={`Delete ${q.title}`}>
                        Delete
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
