import { useMemo, useState } from 'react';
import { Alert, Avatar, BudgetBar, Button, Card, EmptyState, MemberChip, PageHeader, StatCard, Tabs, TransactionItem, TrendBars, formatMoneyAuto, formatPercent } from '@budget-app/ui';
import { TransactionDialog } from '../../components/TransactionDialog';
import { firstName } from '../../data/split';
import { useHousehold } from '../../data/store';
import type { TransactionRecord } from '../../data/types';
import { useAccounts } from '../accounts';
import { dateOnly, formatLongDate, formatShortDate } from '../../lib/dates';
import { isNativeShell } from '../../data/durable';
import { exportText } from '../../lib/download';
import { buildMonthCsv, csvFilename } from './csv';
import { MonthPicker } from './MonthPicker';
import { useToday } from '../../lib/useToday';
import { monthKey } from './months';
import { selectMonthReport, selectReportMonths } from './selectors';
import { ShareList } from './ShareList';
import './reports.css';

interface ReportsScreenProps {
  initialMonth?: string;
  initialMemberId?: string | null;
  onBack: () => void;
  onLogPurchase: () => void;
}

type ReportTab = 'spending' | 'income' | 'people';

/**
 * Monthly report: how the month went - net, spend and income vs last month,
 * where the money went (categories, merchants, weeks), how earning went, and
 * who paid for what. Scoped to one member with the chip row; People stays
 * household-wide.
 */
export function ReportsScreen({ initialMonth, initialMemberId = null, onBack, onLogPurchase }: ReportsScreenProps) {
  const state = useHousehold();
  const { household, members, categories } = state;
  const { accounts } = useAccounts();
  const now = useToday(); // the month picker's "current month" and days-elapsed roll over at midnight
  const months = useMemo(() => selectReportMonths(state, now), [state, now]);
  const current = monthKey(now);
  const [month, setMonth] = useState(initialMonth && months.includes(initialMonth) ? initialMonth : current);
  const [memberId, setMemberId] = useState<string | null>(initialMemberId);
  const [tab, setTab] = useState<ReportTab>('spending');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; title: string } | null>(null);
  const [viewing, setViewing] = useState<TransactionRecord | null>(null);
  const report = useMemo(() => selectMonthReport(state, month, memberId, now), [state, month, memberId, now]);
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const scope = report.scope;

  const exportCsv = async () => {
    const ok = await exportText(csvFilename(month, scope), buildMonthCsv(state, month, memberId, now, accounts), 'text/csv;charset=utf-8');
    setNotice(ok ? { tone: 'success', title: `Exported ${csvFilename(month, scope)}` } : { tone: 'danger', title: isNativeShell() ? "Couldn't export - nothing was saved" : "Couldn't export - your browser blocked the download" });
  };

  // Highlight the week we are in; past months get no highlight (the last bar would just be the month's tail).
  const today = now.getDate();
  const highlight = report.isCurrentMonth ? report.byWeek.findIndex((w) => today >= w.startDay && today <= w.endDay) : null;
  const changeLabel = `vs ${report.prev.label}`;

  return (
    <div className="bdg-stack reports">
      <PageHeader
        size="lg"
        eyebrow={scope ? scope.name : household.name}
        title="Monthly report"
        subtitle={`${report.label}${report.isCurrentMonth ? ` · ${report.daysElapsed} of ${report.daysInMonth} days` : ''}`}
        onBack={onBack}
        backLabel="Back"
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={report.empty}>
            Export CSV
          </Button>
        }
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)} />
      )}

      <MonthPicker value={month} min={months[0] ?? current} max={current} onChange={setMonth} />

      <div className="bdg-row bdg-wrap bdg-gap-2" role="group" aria-label="Whose month to show">
        {members.map((m) => (
          <MemberChip key={m.id} name={m.name} color={m.color} selected={memberId === m.id} onSelect={() => setMemberId((cur) => (cur === m.id ? null : m.id))} />
        ))}
      </div>

      {report.empty ? (
        <Card>
          <EmptyState
            icon="📊"
            title={`Nothing logged in ${report.label}`}
            description={scope ? `${firstName(scope.name)} had no purchases or income this month.` : 'Log purchases and income and the month will take shape here.'}
            action={report.isCurrentMonth ? <Button onClick={onLogPurchase}>Log purchase</Button> : <Button variant="secondary" onClick={() => setMonth(current)}>Latest month</Button>}
          />
        </Card>
      ) : (
        <>
          <StatCard
            label={scope ? `${firstName(scope.name)}'s net` : 'Net'}
            // An overspent month must not wear the cheerful hero colour (QA L21): auto colours by sign.
            tone={report.net < 0 ? 'auto' : 'primary'}
            value={report.net}
            currency={currency}
            change={report.deltas.net ?? undefined}
            changeLabel={report.deltas.net != null ? changeLabel : undefined}
            caption={report.savingsRate != null ? `${report.net >= 0 ? 'Kept' : 'Overspent'} ${formatPercent(Math.abs(report.savingsRate))} of income` : 'No income this month'}
            icon="🧮"
          />
          <div className="bdg-grid-2">
            <StatCard compact label="Spent" value={report.spend} currency={currency} direction="spend" change={report.deltas.spend ?? undefined} changeLabel={report.deltas.spend != null ? changeLabel : undefined} caption={report.deltas.spend == null ? 'Nothing to compare' : undefined} icon="🛒" />
            <StatCard compact label="Earned" value={report.income} currency={currency} change={report.deltas.income ?? undefined} changeLabel={report.deltas.income != null ? changeLabel : undefined} caption={report.deltas.income == null ? 'Nothing to compare' : undefined} icon="💵" />
          </div>

          <Tabs
            variant="segmented"
            fullWidth
            aria-label="Report section"
            value={tab}
            onChange={(v) => setTab(v as ReportTab)}
            items={[
              { value: 'spending', label: 'Spending' },
              { value: 'income', label: 'Income' },
              { value: 'people', label: 'People' },
            ]}
          />

          {tab === 'spending' && (
            <div className="reports__grid">
              {report.bills > 0 && (
                <Card title="Bills first" subtitle="Required money - paid before anything else, so it never counts against a budget">
                  <ShareList
                    rows={[
                      {
                        id: 'bills',
                        label: '🧾 Bills & subscriptions',
                        value: report.bills,
                        max: report.spend,
                        tone: 'primary',
                        valueLabel: `${money(report.bills)} · ${formatPercent(report.spend > 0 ? report.bills / report.spend : 0)}`,
                        sub: `${report.billsCount} payment${report.billsCount === 1 ? '' : 's'} · ${money(report.everyday)} of everyday spending on top`,
                      },
                    ]}
                  />
                </Card>
              )}
              <Card title="By week" subtitle="Everyday spend per week, bills aside">
                <TrendBars data={report.byWeek.map((w) => ({ label: w.label, value: w.spent }))} currency={currency} reference={report.weekAverage} referenceLabel="Average" highlightIndex={highlight} />
              </Card>
              <Card title="Categories" subtitle="Share of this month's everyday spending">
                {report.byCategory.length === 0 && <p className="bdg-text-sm bdg-text-muted">No everyday spending yet this month.</p>}
                <ShareList
                  rows={report.byCategory.map((r) => ({
                    id: r.category.id,
                    label: `${r.category.icon} ${r.category.name}`,
                    value: r.spent,
                    max: report.everyday,
                    tone: r.category.color,
                    valueLabel: `${money(r.spent)} · ${formatPercent(r.share)}`,
                    sub: r.limit > 0 && !scope ? `of ${money(r.limit)} limit · ${r.count} purchase${r.count === 1 ? '' : 's'}` : `${r.count} purchase${r.count === 1 ? '' : 's'}`,
                    vsLastMonth: r.vsLastMonth,
                  }))}
                />
              </Card>
              <Card title="Top merchants" padding="none">
                {report.topMerchants.length === 0 && <p className="report-row bdg-text-sm bdg-text-muted">Nothing yet - bills are listed on the Bills tab.</p>}
                {report.topMerchants.map((m) => (
                  <div key={m.title} className="report-row">
                    <span className="report-row__title">
                      {categories.find((c) => c.id === m.categoryId)?.icon} {m.title}
                    </span>
                    <span className="bdg-text-sm bdg-text-muted">{m.count}×</span>
                    <span className="bdg-tabular bdg-font-semibold">{money(m.total)}</span>
                  </div>
                ))}
              </Card>
              <Card title="Biggest purchases" padding="none">
                {report.biggest.length === 0 && <p className="report-row bdg-text-sm bdg-text-muted">No purchases logged yet this month.</p>}
                {report.biggest.map(({ t, amount }) => {
                  const cat = categories.find((c) => c.id === t.categoryId);
                  const member = members.find((m) => m.id === t.memberId);
                  return <TransactionItem key={t.id} title={t.title} amount={amount} currency={currency} category={cat?.name} icon={cat?.icon} when={formatShortDate(dateOnly(t.date))} member={!scope && member ? { name: member.name, color: member.color } : undefined} onClick={() => setViewing(t)} />;
                })}
              </Card>
            </div>
          )}

          {tab === 'income' && (
            <div className="reports__grid">
              <div className="bdg-grid-3 reports__stats">
                <StatCard compact label="Per day" value={report.dailyEarnings.avgPerDay} currency={currency} caption={`over ${report.dailyEarnings.daysCounted} days`} icon="📆" />
                <StatCard compact label="Days on target" valueText={report.dailyEarnings.daysHitTarget == null ? '—' : `${report.dailyEarnings.daysHitTarget} of ${report.dailyEarnings.daysCounted}`} caption={report.dailyEarnings.target > 0 ? `target ${money(report.dailyEarnings.target)}/day` : 'No daily target set'} icon="🎯" />
                <StatCard compact label="Best day" value={report.dailyEarnings.bestDay?.amount ?? 0} currency={currency} caption={report.dailyEarnings.bestDay ? formatLongDate(report.dailyEarnings.bestDay.date) : 'No income yet'} icon="🏆" />
              </div>
              <Card title="By week" subtitle="Income per week of the month">
                <TrendBars data={report.byWeek.map((w) => ({ label: w.label, value: w.income }))} currency={currency} tone="positive" highlightIndex={highlight} reference={report.dailyEarnings.target > 0 ? report.dailyEarnings.target * 7 : undefined} referenceLabel={report.dailyEarnings.target > 0 ? 'Weekly target' : undefined} />
              </Card>
              <Card title="Who earned it">
                <ShareList
                  rows={report.byMember
                    .filter((r) => r.earned > 0)
                    .map((r) => ({
                      id: r.member.id,
                      label: (
                        <span className="bdg-row bdg-gap-2">
                          <Avatar name={r.member.name} color={r.member.color} size="xs" />
                          {r.member.name}
                        </span>
                      ),
                      value: r.earned,
                      max: report.byMember.reduce((acc, x) => acc + x.earned, 0),
                      tone: r.member.color,
                      valueLabel: money(r.earned),
                      higherIsWorse: false,
                    }))}
                />
              </Card>
            </div>
          )}

          {tab === 'people' && (
            <div className="reports__grid">
              <Card title="Who paid" subtitle="Whole household">
                <ShareList
                  rows={report.byMember.map((r) => ({
                    id: r.member.id,
                    label: (
                      <span className="bdg-row bdg-gap-2">
                        <Avatar name={r.member.name} color={r.member.color} size="xs" />
                        {r.member.name}
                      </span>
                    ),
                    value: r.paid,
                    max: report.byMember.reduce((acc, x) => acc + x.paid, 0),
                    tone: r.member.color,
                    valueLabel: `${money(r.paid)} · ${formatPercent(r.share)}`,
                    sub: `on their budget ${money(r.budgetSpent)} · earned ${money(r.earned)} · ${r.count} payment${r.count === 1 ? '' : 's'}`,
                  }))}
                />
              </Card>
              <Card title="Personal budgets" subtitle="Everyday spend on each budget vs their monthly limit - bills aside">
                {report.byMember.map((r) => (
                  <BudgetBar key={r.member.id} category={`${firstName(r.member.name)}'s budget`} spent={r.budgetSpent} limit={r.member.monthlyLimit} currency={currency} color={r.member.color} show="spent" icon="👛" />
                ))}
              </Card>
            </div>
          )}
        </>
      )}

      <TransactionDialog transaction={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
