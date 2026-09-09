import { useMemo, useState } from 'react';
import {
  BudgetBar,
  Button,
  Card,
  EmptyState,
  GoalCard,
  MemberChip,
  PageHeader,
  StatCard,
  TransactionItem,
  TrendBars,
  formatDayLabel,
  formatMoneyAuto,
} from '@budget-app/ui';
import { goalDeadlineLabel, goalPace, selectMemberLeft, selectOverview } from '../data/selectors';
import { useHousehold } from '../data/store';
import { ScreenActions } from '../components/ScreenActions';
import { AccountsCard } from '../features/accounts';
import { UpcomingBillsCard } from '../features/bills';
import { BalanceCard } from '../features/settle';
import { CashFlowCard, horizonText, selectCashFlow, usePaydays } from '../features/paydays';
import { ShoppingListCard } from '../features/lists';
import { ReminderAlert, type ReminderTarget } from '../features/reminders';
import { useBills } from '../features/bills';
import { firstName } from '../data/split';
import { dateOnly, formatShortDate } from '../lib/dates';
import { useToday } from '../lib/useToday';

interface OverviewScreenProps {
  onLogPurchase: () => void;
  onLogEarnings: () => void;
  onOpenActivity: () => void;
  onOpenBills: () => void;
  onOpenGoals: () => void;
  /** Opens the Household tab, where category limits are edited (the over-budget reminder routes there itself). */
  onOpenHousehold: () => void;
  /** Opens the settle-up history (balance between the two of you). */
  onOpenSettle: () => void;
  /** Opens the Paydays sub-screen. */
  onOpenPaydays: () => void;
  /** Opens the Accounts sub-screen (bank accounts & credit cards). */
  onOpenAccounts: () => void;
  /** Opens the shopping / wish lists sub-screen. */
  onOpenLists: (list: 'shopping' | 'wish') => void;
  /** Opens the monthly report, optionally scoped to a member. */
  onOpenReport: (memberId: string | null) => void;
  /** Acts on a reminder (go somewhere, or open the log dialog). */
  onNavigate: (target: ReminderTarget) => void;
}

/**
 * Overview - the home screen. Today's earnings and this week's spend, money
 * safe to spend, the earnings trend against the daily target, the budgets
 * closest to their limits, the nearest goal and the latest purchases.
 * A MemberChip row switches between the household view and one member's budget.
 */
export function OverviewScreen({ onLogPurchase, onLogEarnings, onOpenActivity, onOpenBills, onOpenGoals, onOpenSettle, onOpenPaydays, onOpenAccounts, onOpenLists, onOpenReport, onNavigate }: OverviewScreenProps) {
  const state = useHousehold();
  const { household, members, categories } = state;
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const now = useToday(); // today's figures roll over at midnight even if the screen stays open
  const data = useMemo(() => selectOverview(state, memberFilter, now), [state, memberFilter, now]);
  const { bills } = useBills();
  const { schedules } = usePaydays();
  const cashFlow = useMemo(() => selectCashFlow(state, bills, schedules, { horizon: 'payday', memberId: memberFilter, now }), [state, bills, schedules, memberFilter, now]);
  const payday = cashFlow.nextPayday;
  const currency = household.currency;
  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const memberOf = (id: string) => members.find((m) => m.id === id);
  const whenLabel = (iso: string) => {
    const day = formatDayLabel(dateOnly(iso));
    return day === 'Today' ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : day;
  };
  const scopeName = data.scope ? data.scope.name.split(' ')[0] : null;

  return (
    <div className="bdg-stack overview">
      <PageHeader
        size="lg"
        title="Overview"
        subtitle={data.dateLabel}
        actions={<ScreenActions />}
      />

      <div className="bdg-row bdg-wrap bdg-gap-2" role="group" aria-label="Whose budget to show">
        {members.map((m) => (
          <MemberChip
            key={m.id}
            name={m.name}
            color={m.color}
            meta={m.monthlyLimit > 0 ? `${formatMoneyAuto(selectMemberLeft(state, m), { currency })} left` : 'no cap'}
            selected={memberFilter === m.id}
            onSelect={() => setMemberFilter((cur) => (cur === m.id ? null : m.id))}
          />
        ))}
      </div>

      {/* One Alert at the top: the most urgent reminder (over budget, bills, approvals, cash flow...). */}
      <ReminderAlert onNavigate={onNavigate} />

      <div className="overview-grid">
        <div className="bdg-stack overview-col">
          {!cashFlow.hasLimit ? (
            // A ceiling of 0 means "no cap" - a member with no personal limit (QA MF-3),
            // or a household whose category limits are all "no limit" (audit MF-4):
            // there is nothing to spend against, so a negative "safe to spend" here
            // would be a made-up deficit.
            <StatCard
              label={scopeName ? `${scopeName}'s safe to spend` : 'Safe to spend'}
              valueText="No cap set"
              tone="primary"
              caption={`${formatMoneyAuto(data.monthSpend, { currency })} spent this month · set ${data.scope ? 'a personal limit' : 'category limits'} on the Household tab to track it`}
              icon="🛡️"
            />
          ) : (
            <StatCard
              label={scopeName ? `${scopeName}'s safe to spend` : 'Safe to spend'}
              value={cashFlow.hasSchedules ? cashFlow.safeToSpend : data.safeToSpend}
              currency={currency}
              tone="primary"
              // One horizon line for both branches: without paydays the cash flow's
              // window is month end, so the day count is the same one everywhere
              // rather than two counts for one date (audit MF-12).
              caption={`${horizonText(cashFlow.untilLabel, cashFlow.daysUntil, cashFlow.nextPayday?.overdueDays ?? 0)} · ${
                cashFlow.hasSchedules
                  ? cashFlow.billsDue + cashFlow.plannedSavings > 0
                    ? `after ${formatMoneyAuto(cashFlow.billsDue, { currency })} bills${cashFlow.plannedSavings > 0 ? ` & ${formatMoneyAuto(cashFlow.plannedSavings, { currency })} savings` : ''}`
                    : 'nothing left to pay'
                  : `${formatMoneyAuto(data.monthSpend, { currency })} of the ${formatMoneyAuto(data.monthLimit, { currency })} ${data.scope ? 'personal limit' : 'category limits'} used`
              }`}
              icon="🛡️"
              wholeOnly
            />
          )}
          <div className="bdg-grid-3 overview-stats">
            <StatCard
              compact
              label="Today's earnings"
              value={data.todayEarnings}
              currency={currency}
              change={data.earningsChange ?? undefined}
              changeLabel={data.earningsChange != null ? 'vs yesterday' : undefined}
              caption={data.earningsChange == null ? 'Nothing earned yesterday' : undefined}
              icon="💵"
            />
            <StatCard
              compact
              label="Spent this week"
              value={data.weekSpend}
              currency={currency}
              direction="spend"
              change={data.weekSpendChange ?? undefined}
              changeLabel={data.weekSpendChange != null ? 'vs last week' : undefined}
              icon="🛒"
            />
            <StatCard
              compact
              label="Next payday"
              valueText={
                payday
                  ? payday.overdueDays > 0
                    ? `${payday.overdueDays} ${payday.overdueDays === 1 ? 'day' : 'days'} late`
                    : payday.days === 0
                      ? 'Today'
                      : payday.days === 1
                        ? 'Tomorrow'
                        : `${payday.days} days`
                  : 'Not set'
              }
              caption={
                payday ? (
                  `${formatShortDate(payday.date)} · ${payday.member ? `${firstName(payday.member.name)}'s ` : ''}${payday.schedule.name} · ${formatMoneyAuto(payday.amount, { currency })}`
                ) : (
                  <Button variant="ghost" size="sm" onClick={onOpenPaydays}>
                    Add paydays
                  </Button>
                )
              }
              icon="📅"
            />
          </div>
          <Card
            title="Daily earnings"
            subtitle={
              household.dailyEarningTarget > 0
                ? `This week · target ${formatMoneyAuto(household.dailyEarningTarget, { currency })}/day`
                : 'This week · no daily target set'
            }
            actions={
              <div className="bdg-row bdg-gap-2">
                <Button variant="ghost" size="sm" onClick={onOpenPaydays}>
                  Paydays
                </Button>
                <Button variant="ghost" size="sm" onClick={onLogEarnings}>
                  Log earnings
                </Button>
              </div>
            }
          >
            <TrendBars
              data={data.earningsTrend}
              currency={currency}
              reference={household.dailyEarningTarget > 0 ? household.dailyEarningTarget : undefined}
              referenceLabel="Target"
            />
          </Card>
          <Card
            title="Budgets"
            subtitle={`${data.scope ? `${scopeName}'s spend vs household limits · ${data.monthLabel}` : data.monthLabel}${
              data.monthBills > 0 ? ` · ${formatMoneyAuto(data.monthBills, { currency })} of bills paid first, not counted here` : ''
            }`}
            actions={
              <div className="bdg-row bdg-gap-2">
                <Button variant="ghost" size="sm" onClick={() => onOpenReport(memberFilter)}>
                  Report
                </Button>
                <Button variant="ghost" size="sm" onClick={onOpenActivity}>
                  See all
                </Button>
              </div>
            }
          >
            {data.scope && (
              <BudgetBar category={`${scopeName}'s monthly budget`} spent={data.monthSpend} limit={data.monthLimit} currency={currency} icon="👛" color={data.scope.color} period={data.monthLabel} />
            )}
            {data.budgets.slice(0, data.scope ? 3 : 4).map((b) => (
              <BudgetBar
                key={b.category.id}
                category={b.category.name}
                spent={b.spent}
                limit={b.limit}
                currency={currency}
                icon={b.category.icon}
                color={b.category.color}
                show={data.scope ? 'spent' : 'left'}
              />
            ))}
            {data.budgets.length === 0 && <EmptyState compact title="Nothing spent yet" description="Purchases will show up against their category here." />}
          </Card>
        </div>

        <div className="bdg-stack overview-col">
          <BalanceCard onOpenHistory={onOpenSettle} />
          {cashFlow.hasSchedules ? <CashFlowCard cashFlow={cashFlow} onOpenBills={onOpenBills} onOpenPaydays={onOpenPaydays} /> : <UpcomingBillsCard onSeeAll={onOpenBills} />}
          <AccountsCard onOpen={onOpenAccounts} />
          <ShoppingListCard onOpen={onOpenLists} />
          <div className="bdg-stack bdg-gap-2">
            <div className="bdg-row-between">
              <h2 className="bdg-section-title">Closest goal</h2>
              <Button variant="ghost" size="sm" onClick={onOpenGoals}>
                All goals
              </Button>
            </div>
            {data.nearestGoal ? (
              <GoalCard
                name={data.nearestGoal.name}
                icon={data.nearestGoal.icon}
                target={data.nearestGoal.target}
                saved={data.nearestGoal.saved}
                currency={currency}
                deadline={goalDeadlineLabel(data.nearestGoal)}
                pace={goalPace(data.nearestGoal) ? `${formatMoneyAuto(goalPace(data.nearestGoal) ?? 0, { currency })}/week to make it` : undefined}
                contributors={data.nearestGoal.contributorIds.map((id) => memberOf(id)).filter((m): m is NonNullable<typeof m> => !!m).map((m) => ({ name: m.name, color: m.color }))}
                onClick={onOpenGoals}
              />
            ) : (
              <Card>
                <EmptyState compact icon="🎯" title="No active goals" description="Set a target and the household can save towards it together." action={<Button size="sm" onClick={onOpenGoals}>Add a goal</Button>} />
              </Card>
            )}
          </div>

          <Card
            title="Recent"
            subtitle={data.scope ? `${scopeName}'s latest` : 'Across the household'}
            padding="none"
            actions={
              <Button variant="ghost" size="sm" onClick={onOpenActivity}>
                See all
              </Button>
            }
          >
            {data.recent.length === 0 ? (
              <EmptyState compact icon="🧾" title="No purchases yet" description="Tap + to log the first one." action={<Button size="sm" onClick={onLogPurchase}>Log purchase</Button>} />
            ) : (
              data.recent.map((t) => {
                const cat = categoryOf(t.categoryId);
                const member = memberOf(t.memberId);
                return (
                  <TransactionItem
                    key={t.id}
                    title={t.title}
                    amount={t.amount}
                    currency={currency}
                    category={cat?.name}
                    when={whenLabel(t.date)}
                    member={!data.scope && member ? { name: member.name, color: member.color } : undefined}
                    icon={cat?.icon}
                    note={
                      data.recentShares[t.id] !== undefined
                        ? [
                            t.note,
                            // Scoped to the partner, the number is THEIR share, not the reader's (QA MF-7).
                            `${data.scope && data.scope.id !== state.currentMemberId ? `${scopeName}'s` : 'Your'} share ${formatMoneyAuto(data.recentShares[t.id]!, { currency })}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : t.note
                    }
                    recurring={t.recurring}
                    pending={t.pending}
                    onClick={onOpenActivity}
                  />
                );
              })
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
