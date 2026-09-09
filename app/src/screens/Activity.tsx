import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, MemberChip, PageHeader, Select, StatCard, Tabs, TextField, TransactionList, formatMoneyAuto } from '@budget-app/ui';
import type { Transaction } from '@budget-app/ui';
import { ScreenActions } from '../components/ScreenActions';
import { TransactionDialog } from '../components/TransactionDialog';
import { DEFAULT_ACTIVITY_FILTERS, selectActivity, type ActivityFilters, type ActivityKind, type ActivityPeriod } from '../data/selectors';
import { useHousehold } from '../data/store';
import { useToday } from '../lib/useToday';

interface ActivityScreenProps {
  onLogPurchase: () => void;
  /** Kind tab to open on (e.g. reminders route straight to 'pending'). Re-applied whenever it changes. */
  initialKind?: ActivityKind;
  /** Bumped per navigation so a second reminder tap re-applies the same kind (QA UX-6). */
  navNonce?: number;
}

/** Rows rendered before "Show more": a two-year "All time" list re-rendered per keystroke lagged on the phone (audit UI-11). */
export const ACTIVITY_PAGE = 200;

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="9" cy="9" r="6" />
    <path d="M13.5 13.5L17 17" />
  </svg>
);

/**
 * Activity - the purchase log. Every transaction grouped by day with daily
 * net totals, narrowed by kind (spending / income / pending), period, member,
 * category and free-text search. Tapping a row opens its details.
 */
export function ActivityScreen({ onLogPurchase, initialKind, navNonce }: ActivityScreenProps) {
  const state = useHousehold();
  const { household, members, categories } = state;
  const currency = household.currency;
  const [filters, setFilters] = useState<ActivityFilters>(() => ({ ...DEFAULT_ACTIVITY_FILTERS, kind: initialKind ?? DEFAULT_ACTIVITY_FILTERS.kind }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // How many rows are on screen; every filter change starts over at one page.
  const [limit, setLimit] = useState(ACTIVITY_PAGE);
  useEffect(() => {
    if (initialKind) setFilters((f) => (f.kind === initialKind ? f : { ...f, kind: initialKind }));
    setLimit(ACTIVITY_PAGE);
  }, [initialKind, navNonce]);
  const now = useToday(); // "this week/month" stays honest across midnight on a screen left open
  const data = useMemo(() => selectActivity(state, filters, now), [state, filters, now]);
  const set = <K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setLimit(ACTIVITY_PAGE);
  };
  const toggleMember = (id: string) => set('memberIds', filters.memberIds.includes(id) ? filters.memberIds.filter((m) => m !== id) : [...filters.memberIds, id]);
  const clearNarrowing = () => {
    setFilters((f) => ({ ...f, memberIds: [], categoryId: '', query: '' }));
    setLimit(ACTIVITY_PAGE);
  };

  const periodLabel: Record<ActivityPeriod, string> = { week: 'This week', month: 'This month', all: 'All time' };
  // Built once per change of the inputs, with map lookups: a find per row on every
  // render (each keystroke in Search) is what made the long list lag (audit UI-11).
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const rows = useMemo<Transaction[]>(
    () =>
      data.items.map((t) => {
        const cat = categoryById.get(t.categoryId);
        const member = memberById.get(t.memberId);
        return {
          id: t.id,
          title: t.title,
          amount: t.amount,
          date: t.date,
          category: cat?.name,
          member: member ? { name: member.name, color: member.color } : undefined,
          icon: cat?.icon,
          note: t.note,
          pending: t.pending,
          recurring: t.recurring,
        };
      }),
    [data.items, categoryById, memberById],
  );
  const visible = useMemo(() => (rows.length > limit ? rows.slice(0, limit) : rows), [rows, limit]);
  const hidden = rows.length - visible.length;
  const selected = selectedId ? state.transactions.find((t) => t.id === selectedId) ?? null : null;

  return (
    <div className="bdg-stack activity">
      <PageHeader
        size="lg"
        title="Activity"
        subtitle={`${data.counts.all} ${data.counts.all === 1 ? 'entry' : 'entries'} · ${periodLabel[filters.period].toLowerCase()}`}
        actions={
          <>
            <Button size="sm" onClick={onLogPurchase}>
              Log purchase
            </Button>
            <ScreenActions />
          </>
        }
      />

      <Tabs
        aria-label="Kind"
        fullWidth
        value={filters.kind}
        onChange={(v) => set('kind', v as ActivityKind)}
        items={[
          { value: 'all', label: 'All', count: data.counts.all },
          { value: 'spend', label: 'Spending', count: data.counts.spend },
          { value: 'income', label: 'Income', count: data.counts.income },
          { value: 'pending', label: 'Pending', count: data.counts.pending },
        ]}
      />

      <div className="activity__filters">
        <Tabs
          aria-label="Period"
          variant="segmented"
          fullWidth
          value={filters.period}
          onChange={(v) => set('period', v as ActivityPeriod)}
          items={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'all', label: 'All time' },
          ]}
        />
        <TextField label="Search" hideLabel type="search" placeholder="Search merchants, notes, people" prefix={<SearchIcon />} value={filters.query} onChange={(e) => set('query', e.target.value)} fullWidth />
        {/* Labelled because this filter means WHO PAID - unlike the budget-scoped member chips elsewhere. */}
        <div className="bdg-row bdg-wrap bdg-gap-2" role="group" aria-label="Filter by who paid">
          <span className="bdg-text-xs bdg-text-muted activity__filter-label">Paid by</span>
          {members.map((m) => (
            <MemberChip key={m.id} name={m.name.split(' ')[0] ?? m.name} color={m.color} size="sm" selected={filters.memberIds.includes(m.id)} onSelect={() => toggleMember(m.id)} />
          ))}
        </div>
        <Select
          label="Category"
          hideLabel
          size="sm"
          value={filters.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))]}
          fullWidth
        />
      </div>

      <div className="bdg-grid-2">
        <StatCard compact label="Spent" value={data.spent} currency={currency} caption={periodLabel[filters.period]} />
        <StatCard compact label="Earned" value={data.earned} currency={currency} tone="auto" caption={periodLabel[filters.period]} />
      </div>

      <TransactionList
        transactions={visible}
        currency={currency}
        showTime
        onSelect={setSelectedId}
        empty={
          data.narrowed ? (
            <EmptyState
              compact
              title="No matches"
              description="Try a different member, category or search."
              action={
                <Button variant="secondary" size="sm" onClick={clearNarrowing}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              compact
              icon="🧾"
              title={filters.kind === 'pending' ? 'Nothing pending' : filters.kind === 'income' ? 'No income logged' : 'No purchases yet'}
              description={filters.kind === 'pending' ? 'Purchases waiting on a refund or confirmation show up here.' : `Nothing logged ${periodLabel[filters.period].toLowerCase()}. Tap + to add one.`}
              action={
                filters.kind === 'pending' ? undefined : (
                  <Button size="sm" onClick={onLogPurchase}>
                    Log purchase
                  </Button>
                )
              }
            />
          )
        }
      />
      {hidden > 0 && (
        <div className="bdg-row" style={{ justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + ACTIVITY_PAGE)}>
            {hidden > ACTIVITY_PAGE ? `Show ${ACTIVITY_PAGE} more of ${hidden}` : `Show the last ${hidden}`}
          </Button>
        </div>
      )}
      {filters.period !== 'all' && rows.length > 0 && (
        <div className="bdg-row" style={{ justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => set('period', filters.period === 'week' ? 'month' : 'all')}>
            {filters.period === 'week' ? 'Show this month' : 'Show all time'}
          </Button>
        </div>
      )}
      <p className="bdg-text-xs bdg-text-subtle" style={{ margin: 0, textAlign: 'center' }}>
        {formatMoneyAuto(data.earned - data.spent, { currency, signDisplay: 'exceptZero' })} net {periodLabel[filters.period].toLowerCase()}
      </p>

      <TransactionDialog transaction={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
