import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AmountInput, Button, Checkbox, Dialog, Select, Tabs, TextField, formatDayLabel, formatMoneyAuto } from '@budget-app/ui';
import { MAX_AMOUNT, allocateCents, describeSplit, firstName, fromCents, normaliseSplit, resolveDefaultWeights, splitShares, toCents } from '../data/split';
import { deleteReceipt, downscaleImage, putReceipt, receiptsSupported, useReceiptUrl } from '../data/receipts';
import { useHousehold } from '../data/store';
import type { SplitShare, TransactionRecord } from '../data/types';
import { accountOptions, useAccounts } from '../features/accounts';
import { selectMerchantSuggestions, selectQuickAdds, useQuickAdds } from '../features/quickadd';
import { clampToNow, combineDateTime, dateOnly, daysFromNow, isValidIsoDate, toHhmm, todayIso } from '../lib/dates';
import { capMessage } from './amountCap';
import { ChipRow } from './ChipRow';
import type { LogKind, LogPurchaseRequest } from './LogPurchaseProvider';
import { memberOptionsFor } from './memberOptions';
import { SplitEditor } from './SplitEditor';


interface LogPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  /** What to open with: a kind, a prefill, or an entry to edit. */
  request?: LogPurchaseRequest;
  /** Opens the favourites manager (rendered beside this dialog, not inside it). */
  onManageFavourites?: () => void;
}

interface FormState {
  kind: LogKind;
  amount: number | null;
  categoryId: string;
  title: string;
  memberId: string;
  shared: boolean;
  sharedTouched: boolean;
  customSplit: SplitShare[] | null;
  note: string;
  /** Account it was paid with (purchases) or into (income); '' = not tracked. */
  accountId: string;
  whenMode: 'now' | 'custom';
  date: string;
  time: string;
  quickAddId: string | null;
  saveAsFavourite: boolean;
  /** A new photo picked in this session (downscaled), with a preview URL. */
  receipt: { blob: Blob; url: string } | null;
  /** Editing: the stored photo should be removed on save. */
  removeReceipt: boolean;
}

const incomeCategory = (categories: { id: string; kind: string }[]) => categories.find((c) => c.kind === 'income')?.id ?? '';

/**
 * The "+" flow: log a purchase (or income) by hand, or edit one. Favourites
 * fill the form in one tap, recent merchants suggest themselves as you type,
 * a purchase can be backdated, and a shared one previews how it splits.
 */
export function LogPurchaseDialog({ open, onClose, request, onManageFavourites }: LogPurchaseDialogProps) {
  const { categories, members, currentMemberId, household, addTransaction, updateTransaction } = useHousehold();
  const state = useHousehold();
  const { quickAdds, addQuickAdd, touchQuickAdd } = useQuickAdds();
  const { accounts } = useAccounts();
  const editing = request?.editing;

  const initialForm = (): FormState => {
    const now = new Date();
    if (editing) {
      const cat = categories.find((c) => c.id === editing.categoryId);
      const d = new Date(editing.date);
      return {
        kind: cat ? (cat.kind === 'income' ? 'income' : 'expense') : editing.amount > 0 ? 'income' : 'expense',
        amount: Math.abs(editing.amount),
        categoryId: editing.categoryId,
        title: editing.title,
        memberId: editing.memberId,
        shared: !!editing.shared || !!editing.split?.length,
        sharedTouched: true,
        customSplit: editing.split?.length ? editing.split : null,
        note: editing.note ?? '',
        accountId: editing.accountId ?? '',
        whenMode: 'custom',
        date: Number.isNaN(d.getTime()) ? todayIso() : dateOnly(editing.date),
        time: Number.isNaN(d.getTime()) ? '12:00' : toHhmm(d),
        quickAddId: null,
        saveAsFavourite: false,
        receipt: null,
        removeReceipt: false,
      };
    }
    const p = request?.initial ?? {};
    const kind: LogKind = p.kind ?? request?.kind ?? 'expense';
    return {
      kind,
      amount: p.amount ?? null,
      categoryId: p.categoryId ?? (kind === 'income' ? incomeCategory(categories) : ''),
      title: p.title ?? '',
      memberId: p.memberId ?? currentMemberId,
      shared: p.shared ?? (p.categoryId ? !!categories.find((c) => c.id === p.categoryId)?.defaultShared : false),
      sharedTouched: p.shared !== undefined,
      customSplit: null,
      note: p.note ?? '',
      accountId: '',
      whenMode: p.date ? 'custom' : 'now',
      date: p.date ?? todayIso(now),
      time: p.date ? '12:00' : toHhmm(now),
      quickAddId: null,
      saveAsFavourite: false,
      receipt: null,
      removeReceipt: false,
    };
  };

  const [form, setForm] = useState<FormState>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // Set when a NEW entry saved but its photo write failed: the next Save retries only the photo (QA UX-13).
  const [createdId, setCreatedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The stored photo when editing (until the user removes or replaces it).
  const storedReceiptUrl = useReceiptUrl(editing?.id ?? null, !!editing?.hasReceipt && !form.removeReceipt && !form.receipt);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => {
      if (prev.receipt) URL.revokeObjectURL(prev.receipt.url);
      return initialForm();
    });
    setSubmitted(false);
    setSaving(false);
    setReceiptBusy(false);
    setReceiptError(null);
    setCreatedId(null);
    setWhenOpen(!!request?.initial?.date || !!request?.editing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const currency = household.currency;
  const isExpense = form.kind === 'expense';
  const payer = members.find((m) => m.id === form.memberId);
  const other = members.length === 2 ? members.find((m) => m.id !== form.memberId) : undefined;
  const canSplit = isExpense && members.length > 1;
  const categoryOptions = useMemo(() => categories.filter((c) => c.kind === form.kind).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })), [categories, form.kind]);
  // A since-removed payer stays visible rather than the picker showing the first member over a ghost id (audit UX-5).
  const memberOptions = memberOptionsFor(members, form.memberId);
  // Editing an entry on a since-archived account keeps that account pickable, so opening the form never silently drops it.
  const payAccountOptions = useMemo(() => {
    const options = accountOptions(editing?.accountId ? accounts.map((a) => (a.id === editing.accountId ? { ...a, archived: undefined } : a)) : accounts);
    // A since-DELETED account (gone, not archived): surface it instead of an
    // empty-looking picker that silently re-saves the dead id (audit UX-5, as bills do).
    if (editing?.accountId && !accounts.some((a) => a.id === editing.accountId)) options.push({ value: editing.accountId, label: 'An account since removed' });
    return options.length > 0 ? [{ value: '', label: 'Not tracked' }, ...options] : [];
  }, [accounts, editing?.accountId]);
  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  // Chips: favourites (create mode) and recent merchants matching what is typed.
  const favourites = useMemo(() => (editing ? [] : selectQuickAdds(quickAdds, form.kind)), [quickAdds, form.kind, editing]);
  const suggestions = useMemo(() => selectMerchantSuggestions(state, form.kind, form.title), [state, form.kind, form.title]);
  const selectedFavourite = favourites.find((q) => q.id === form.quickAddId);
  const favouriteStillMatches = !!selectedFavourite && selectedFavourite.amount === form.amount && selectedFavourite.title === form.title;

  // What each person would be charged, for the checkbox description.
  const preview = useMemo(() => {
    if (!canSplit || !form.shared || !form.amount || form.amount <= 0 || !payer) return [];
    const draft = { id: 'draft', title: form.title, amount: -form.amount, date: '', categoryId: form.categoryId, memberId: form.memberId, shared: true, split: form.customSplit ?? undefined } as TransactionRecord;
    return splitShares(draft, household, members);
  }, [canSplit, form.shared, form.amount, form.title, form.categoryId, form.memberId, form.customSplit, payer, household, members]);

  const splitSumOk = !form.customSplit || !form.amount || form.customSplit.reduce((acc, s) => acc + toCents(s.amount), 0) === toCents(form.amount);
  const customDate = form.whenMode === 'custom';
  const dateError =
    submitted && customDate && (!isValidIsoDate(form.date) || form.date > todayIso())
      ? 'Pick today or an earlier day'
      : submitted && customDate && form.date < '2000-01-01'
        ? 'That year looks wrong - use a date after 2000'
        : undefined;
  const amountError =
    submitted && !(form.amount && form.amount > 0)
      ? 'Enter an amount greater than zero'
      : submitted && form.amount && form.amount > MAX_AMOUNT
        ? capMessage(currency)
        : undefined;
  const categoryError = submitted && !form.categoryId ? (isExpense ? 'Pick a category so we can track it' : 'Pick where the money came from') : undefined;

  const sharedLabel = other ? `Split with ${firstName(other.name)}` : 'Split with household';
  const myShare = preview.find((s) => s.memberId === currentMemberId)?.amount;
  const otherShare = other ? preview.find((s) => s.memberId === other.id)?.amount : undefined;
  let sharedDescription: string;
  if (preview.length > 0) {
    sharedDescription = describeSplit(preview, members, currency);
    if (other && otherShare !== undefined && otherShare > 0 && form.memberId === currentMemberId) sharedDescription += ` - ${firstName(other.name)} will owe you ${formatMoneyAuto(otherShare, { currency })}`;
    else if (other && myShare !== undefined && myShare > 0 && form.memberId !== currentMemberId) sharedDescription += ` - you will owe ${firstName(payer?.name ?? '')} ${formatMoneyAuto(myShare, { currency })}`;
    if (household.requireApproval && other && !editing) sharedDescription += ` · ${firstName(form.memberId === currentMemberId ? other.name : payer?.name ?? '')} will be asked to confirm.`;
  } else if (household.defaultSplit?.mode === 'ratio') sharedDescription = 'Split by your household percentages.';
  else sharedDescription = other ? 'Half each, whoever paid.' : 'Split equally between everyone.';

  // A cleared date field used to render ", Invalid Date" here (audit UX-4).
  const whenText =
    form.whenMode === 'now'
      ? 'Now'
      : !isValidIsoDate(form.date)
        ? 'Pick a date'
        : `${formatDayLabel(form.date)}${form.time ? `, ${new Date(`${form.date}T${form.time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`;

  const close = () => {
    if (saving) return;
    setSubmitted(false);
    // The preview object URL otherwise keeps the decoded photo alive until the next open (audit UI-23).
    setForm((f) => {
      if (!f.receipt) return f;
      URL.revokeObjectURL(f.receipt.url);
      return { ...f, receipt: null };
    });
    onClose();
  };

  // -- receipt photo --

  const pickReceipt = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    setReceiptBusy(true);
    setReceiptError(null);
    try {
      const blob = await downscaleImage(file);
      setForm((f) => {
        if (f.receipt) URL.revokeObjectURL(f.receipt.url);
        return { ...f, receipt: { blob, url: URL.createObjectURL(blob) }, removeReceipt: false };
      });
    } catch {
      setReceiptError("That file couldn't be read as a photo.");
    } finally {
      setReceiptBusy(false);
    }
  };

  const clearReceipt = () =>
    setForm((f) => {
      if (f.receipt) URL.revokeObjectURL(f.receipt.url);
      return { ...f, receipt: null, removeReceipt: !!editing?.hasReceipt };
    });

  const hasReceiptPreview = !!form.receipt || !!storedReceiptUrl;
  // Purchases take photos; an income shows the section only while it still has
  // a stored one (from before UX-3), and then only to remove it.
  const showReceiptSection = receiptsSupported() && (isExpense || !!storedReceiptUrl);

  const switchKind = (next: string) => {
    const kind: LogKind = next === 'income' ? 'income' : 'expense';
    setForm((f) => {
      if (f.kind === kind) return f;
      // A photo picked in Purchase mode must not ride silently onto an income,
      // whose form never offered it and could never take it off again (audit
      // UX-3). A STORED photo is not touched here: an income that still has one
      // shows it with a Remove control instead, so nothing vanishes unseen.
      if (f.receipt) URL.revokeObjectURL(f.receipt.url);
      return { ...f, kind, categoryId: kind === 'income' ? incomeCategory(categories) : '', shared: false, customSplit: null, quickAddId: null, receipt: null };
    });
  };

  const pickCategory = (id: string) => {
    setForm((f) => ({ ...f, categoryId: id, shared: f.sharedTouched || !canSplit ? f.shared : !!categoryOf(id)?.defaultShared }));
  };

  const pickFavourite = (id: string) => {
    const q = quickAdds.find((x) => x.id === id);
    if (!q) return;
    // Re-tapping the selected chip saves only while the form still matches it,
    // as the hint promises; after an edit it re-applies the favourite's values
    // instead of saving the edited amount (audit UX-2).
    if (form.quickAddId === id && favouriteStillMatches) {
      void save();
      return;
    }
    const cat = categoryOf(q.categoryId);
    setForm((f) => ({
      ...f,
      amount: q.amount,
      categoryId: cat && cat.kind === f.kind ? q.categoryId : f.categoryId,
      title: q.title,
      shared: canSplit ? !!q.shared : false,
      sharedTouched: true,
      customSplit: null,
      memberId: q.memberId && members.some((m) => m.id === q.memberId) ? q.memberId : f.memberId,
      quickAddId: id,
    }));
  };

  const pickSuggestion = (title: string) => {
    const s = suggestions.find((x) => x.title === title);
    if (!s) return;
    const cat = categoryOf(s.categoryId);
    setForm((f) => ({ ...f, title: s.title, categoryId: cat && cat.kind === f.kind ? s.categoryId : f.categoryId, shared: f.sharedTouched || !canSplit ? f.shared : !!cat?.defaultShared }));
  };

  const toggleCustom = () => {
    if (form.customSplit) {
      set('customSplit', null);
      return;
    }
    set('customSplit', allocateCents(toCents(form.amount ?? 0), resolveDefaultWeights(household, members), form.memberId).map((a) => ({ memberId: a.memberId, amount: fromCents(a.cents) })));
  };

  /** Stores or removes the photo for a saved entry; resolves to the `hasReceipt` value to keep, or null on failure. */
  const commitReceipt = async (id: string, current: boolean): Promise<boolean | null> => {
    if (form.receipt) {
      try {
        await putReceipt(id, form.receipt.blob);
        return true;
      } catch {
        return null;
      }
    }
    if (form.removeReceipt && current) {
      await deleteReceipt(id);
      return false;
    }
    return current;
  };

  const save = async () => {
    if (saving || receiptBusy) return;
    if (createdId) {
      // The entry already saved; this Save retries only the failed photo write.
      setSaving(true);
      const has = await commitReceipt(createdId, false);
      setSaving(false);
      if (has === null) {
        setReceiptError('The photo still could not be stored on this device. Try a different photo, or Cancel - the purchase itself is saved.');
        return;
      }
      if (has) updateTransaction(createdId, { hasReceipt: true });
      close();
      return;
    }
    setSubmitted(true);
    if (!(form.amount && form.amount > 0 && form.amount <= MAX_AMOUNT) || !form.categoryId || !splitSumOk) return;
    // The 2000 floor used to live only in dateError, so a 1999 purchase saved before the message was seen (audit UX-4).
    if (customDate && (!isValidIsoDate(form.date) || form.date > todayIso() || form.date < '2000-01-01')) return;
    const amount = form.amount;
    const shared = canSplit && form.shared;
    const split = shared && form.customSplit ? form.customSplit : undefined;
    const date = customDate ? clampToNow(combineDateTime(form.date, form.time)) : undefined;
    // Only a purchase can carry a photo (audit UX-3); a removal still applies to either kind.
    const touchesReceipt = (isExpense && !!form.receipt) || form.removeReceipt;
    if (touchesReceipt) setSaving(true);

    if (editing) {
      const patch: Partial<Omit<TransactionRecord, 'id'>> = {
        title: form.title.trim() || (isExpense ? 'Purchase' : 'Income'),
        amount: isExpense ? -amount : amount,
        categoryId: form.categoryId,
        memberId: form.memberId,
        note: form.note.trim() || undefined,
        accountId: form.accountId || undefined,
        // "When · Now" on an edit means NOW - not "silently keep the old date" (QA UX-5).
        date: date ?? (form.whenMode === 'now' ? clampToNow(combineDateTime(todayIso(), toHhmm(new Date()))) : editing.date),
      };
      if (shared) {
        patch.shared = true;
        patch.split = split ? normaliseSplit(split, amount, members, form.memberId) : undefined;
      } else patch.shared = false;
      if (touchesReceipt) {
        const has = await commitReceipt(editing.id, !!editing.hasReceipt);
        if (has === null) {
          // Save the edit but keep the dialog open so the warning is actually seen
          // (saving again is a harmless identical update; the photo can be retried).
          updateTransaction(editing.id, patch);
          request?.onSaved?.({ ...editing, ...patch, shared: patch.shared || undefined }, 'updated');
          setReceiptError('Your changes were saved, but the photo could not be stored on this device. Try picking it again, or Cancel to close.');
          setSaving(false);
          return;
        }
        patch.hasReceipt = has || undefined;
      }
      updateTransaction(editing.id, patch);
      request?.onSaved?.({ ...editing, ...patch, shared: patch.shared || undefined }, 'updated');
      setSaving(false);
      close();
      return;
    }

    const record = addTransaction({ kind: form.kind, amount, categoryId: form.categoryId, title: form.title, memberId: form.memberId, shared: canSplit ? form.shared : undefined, split, note: form.note, date, accountId: form.accountId || undefined });
    if (form.quickAddId) touchQuickAdd(form.quickAddId);
    if (form.saveAsFavourite && form.title.trim()) addQuickAdd({ title: form.title, amount, kind: form.kind, categoryId: form.categoryId, shared: shared || undefined, icon: categoryOf(form.categoryId)?.icon });
    let saved = record;
    if (isExpense && form.receipt) {
      const has = await commitReceipt(record.id, false);
      if (has) {
        updateTransaction(record.id, { hasReceipt: true });
        saved = { ...record, hasReceipt: true };
      } else if (has === null) {
        // The entry is saved but the photo is not - say so and keep the dialog open,
        // exactly like the edit path; closing silently lost photos (QA UX-13/DR-1).
        setCreatedId(record.id);
        setReceiptError('The purchase was saved, but the photo could not be stored on this device. Try picking it again, or Cancel to close.');
        setSaving(false);
        request?.onSaved?.(record, 'created');
        return;
      }
    }
    request?.onSaved?.(saved, 'created');
    setSaving(false);
    close();
  };

  const title = editing ? (isExpense ? 'Edit purchase' : 'Edit income') : isExpense ? 'Log purchase' : 'Log income';
  const description =
    request?.source === 'shopping-list' || request?.source === 'wish-list'
      ? 'From your list - adjust the amount to what you actually paid.'
      : editing
        ? 'Changes apply everywhere this entry is counted.'
        : isExpense
          ? 'It goes into your personal budget unless you split it.'
          : "Counts towards today's earnings.";
  const favouriteReady = !!(form.amount && form.amount > 0 && form.title.trim() && form.categoryId);

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={receiptBusy}>
            {editing ? 'Save changes' : isExpense ? 'Save purchase' : 'Save income'}
          </Button>
        </>
      }
    >
      <div className="bdg-stack">
        <Tabs
          variant="segmented"
          fullWidth
          aria-label="Kind"
          value={form.kind}
          onChange={switchKind}
          items={[
            { value: 'expense', label: 'Purchase' },
            { value: 'income', label: 'Income' },
          ]}
        />
        {favourites.length > 0 && (
          <div className="bdg-stack bdg-gap-1">
            <ChipRow
              label="Favourites"
              chips={favourites.map((q) => ({ id: q.id, label: `${q.icon ?? categoryOf(q.categoryId)?.icon ?? ''} ${q.title} · ${formatMoneyAuto(q.amount, { currency })}`.trim(), selected: q.id === form.quickAddId }))}
              onPick={pickFavourite}
              trailing={
                <Button size="sm" variant="ghost" onClick={onManageFavourites}>
                  Manage
                </Button>
              }
            />
            {favouriteStillMatches && <span className="bdg-text-xs bdg-text-muted">Tap {selectedFavourite!.title} again to save it straight away.</span>}
          </div>
        )}
        <AmountInput label="Amount" currency={currency} value={form.amount} onValueChange={(v) => set('amount', v)} error={amountError} fullWidth autoFocus={!request?.initial?.amount && !editing} />
        <Select
          label={isExpense ? 'Category' : 'Source'}
          options={categoryOptions}
          placeholder={isExpense ? 'Choose a category' : 'Choose a source'}
          value={form.categoryId}
          onChange={(e) => pickCategory(e.target.value)}
          error={categoryError}
          fullWidth
        />
        <div className="bdg-stack bdg-gap-1">
          <TextField label={isExpense ? 'Merchant' : 'From'} placeholder={isExpense ? 'Where was it?' : 'Who paid you?'} value={form.title} onChange={(e) => set('title', e.target.value)} autoComplete="off" fullWidth />
          {suggestions.length > 0 && <ChipRow label="Recent merchants" chips={suggestions.map((s) => ({ id: s.title, label: `${categoryOf(s.categoryId)?.icon ?? ''} ${s.title}`.trim() }))} onPick={pickSuggestion} />}
        </div>
        <Select label={isExpense ? 'Paid by' : 'Earned by'} options={memberOptions} value={form.memberId} onChange={(e) => set('memberId', e.target.value)} fullWidth />
        {payAccountOptions.length > 0 && (
          <Select
            label={isExpense ? 'Paid with' : 'Paid into'}
            options={payAccountOptions}
            value={form.accountId}
            onChange={(e) => set('accountId', e.target.value)}
            hint={isExpense && accounts.find((a) => a.id === form.accountId)?.kind === 'credit' ? 'Goes on the card - it counts in your budget now and raises what the card owes.' : undefined}
            fullWidth
          />
        )}
        {canSplit && (
          <div className="bdg-stack bdg-gap-2">
            <Checkbox
              label={sharedLabel}
              description={sharedDescription}
              checked={form.shared}
              onChange={(e) => setForm((f) => ({ ...f, shared: e.target.checked, sharedTouched: true, customSplit: e.target.checked ? f.customSplit : null }))}
            />
            {form.shared && (
              <div className="bdg-row">
                <Button variant="ghost" size="sm" onClick={toggleCustom} disabled={!form.customSplit && !(form.amount && form.amount > 0)}>
                  {form.customSplit ? 'Use the default split' : 'Customise split'}
                </Button>
              </div>
            )}
            {form.shared && form.customSplit && (
              <SplitEditor total={form.amount ?? 0} members={members} payerId={form.memberId} value={form.customSplit} onChange={(v) => set('customSplit', v)} currency={currency} error={submitted && !splitSumOk ? 'Fix the split to save' : undefined} />
            )}
          </div>
        )}
        <TextField label="Note" placeholder="Optional" value={form.note} onChange={(e) => set('note', e.target.value)} fullWidth />
        <div className="log-when">
          <div className="log-when__summary">
            <span>
              <span className="log-when__label">When</span> · {whenText}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setWhenOpen((o) => !o)}>
              {whenOpen ? 'Done' : 'Change'}
            </Button>
          </div>
          {whenOpen && (
            <div className="bdg-stack bdg-gap-2">
              <div className="bill-form__quick" aria-label="Quick dates">
                <Button size="sm" variant={form.whenMode === 'now' ? 'secondary' : 'ghost'} onClick={() => setForm((f) => ({ ...f, whenMode: 'now', date: todayIso(), time: toHhmm(new Date()) }))}>
                  Now
                </Button>
                <Button size="sm" variant={form.whenMode === 'custom' && form.date === todayIso() ? 'secondary' : 'ghost'} onClick={() => setForm((f) => ({ ...f, whenMode: 'custom', date: todayIso(), time: toHhmm(new Date()) }))}>
                  Earlier today
                </Button>
                <Button size="sm" variant={form.whenMode === 'custom' && form.date === daysFromNow(-1) ? 'secondary' : 'ghost'} onClick={() => setForm((f) => ({ ...f, whenMode: 'custom', date: daysFromNow(-1), time: '12:00' }))}>
                  Yesterday
                </Button>
              </div>
              <div className="bdg-grid-2">
                <TextField type="date" label="Date" value={form.date} min="2000-01-01" max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, whenMode: 'custom', date: e.target.value }))} error={dateError} fullWidth />
                <TextField type="time" label="Time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, whenMode: 'custom', time: e.target.value }))} fullWidth />
              </div>
            </div>
          )}
        </div>
        {showReceiptSection && (
          <div className="bdg-stack bdg-gap-2">
            <span className="bdg-text-sm bdg-font-medium">Receipt</span>
            {hasReceiptPreview ? (
              <div className="log-receipt">
                <img className="log-receipt__thumb" src={form.receipt?.url ?? storedReceiptUrl ?? undefined} alt="Receipt preview" />
                <div className="bdg-row bdg-gap-2 bdg-wrap">
                  {isExpense && (
                    <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} loading={receiptBusy}>
                      Replace
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={clearReceipt}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bdg-row">
                <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} loading={receiptBusy} iconStart={<span aria-hidden="true">📷</span>}>
                  Add receipt photo
                </Button>
              </div>
            )}
            {receiptError && <Alert tone="warning">{receiptError}</Alert>}
            <input ref={fileInput} className="log-file" type="file" accept="image/*" aria-label="Receipt photo" onChange={(e) => void pickReceipt(e.target.files?.[0])} />
          </div>
        )}
        {!editing && (
          <Checkbox
            label="Save as favourite"
            description="Shows as a one-tap chip next time."
            checked={form.saveAsFavourite}
            disabled={!favouriteReady}
            onChange={(e) => set('saveAsFavourite', e.target.checked)}
          />
        )}
      </div>
    </Dialog>
  );
}
